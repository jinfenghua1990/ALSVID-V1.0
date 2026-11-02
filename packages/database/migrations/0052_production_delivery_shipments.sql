-- Production delivery sheet: link every optional shipment batch to its purchase order
-- and allow real domestic China warehouse destinations without faking Germany customs.
ALTER TABLE logistics.shipments
  ADD COLUMN IF NOT EXISTS source_purchase_order_id uuid REFERENCES procurement.purchase_orders(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS logistics_shipments_source_po_idx
  ON logistics.shipments(source_purchase_order_id,created_at DESC)
  WHERE source_purchase_order_id IS NOT NULL;

DO $block$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid='logistics.shipments'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ILIKE '%route_type%'
  LOOP
    EXECUTE format('ALTER TABLE logistics.shipments DROP CONSTRAINT %I',constraint_name);
  END LOOP;
END
$block$;

ALTER TABLE logistics.shipments ADD CONSTRAINT shipments_route_type_v2_check
  CHECK (route_type IN ('FACTORY_TO_GERMANY_WAREHOUSE','FACTORY_TO_DOMESTIC_WAREHOUSE','FACTORY_TO_DEALER_DIRECT'));
ALTER TABLE logistics.shipments ADD CONSTRAINT shipments_route_destination_v2_check
  CHECK (
    (route_type IN ('FACTORY_TO_GERMANY_WAREHOUSE','FACTORY_TO_DOMESTIC_WAREHOUSE')
      AND destination_location_id IS NOT NULL AND destination_dealer_partner_id IS NULL AND destination_address_id IS NULL)
    OR
    (route_type='FACTORY_TO_DEALER_DIRECT'
      AND destination_location_id IS NULL AND destination_dealer_partner_id IS NOT NULL AND destination_address_id IS NOT NULL)
  );

ALTER TABLE logistics.shipment_events DROP CONSTRAINT IF EXISTS shipment_events_event_type_check;
ALTER TABLE logistics.shipment_events ADD CONSTRAINT shipment_events_event_type_v2_check
  CHECK (event_type IN (
    'PLANNED','BOOKED','CARGO_READY','PICKED_UP','CHINA_EXPORT_DECLARED','CHINA_EXPORT_CLEARED',
    'DEPARTED','IN_TRANSIT','ARRIVED_EU','IMPORT_DECLARED','IMPORT_CLEARED',
    'DELIVERED_GERMANY_WAREHOUSE','DELIVERED_WAREHOUSE','DELIVERED_DEALER',
    'EXCEPTION','HOLD','RELEASED_FROM_HOLD','CANCELLED'
  ));

CREATE OR REPLACE FUNCTION logistics.validate_shipment_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE route text;
BEGIN
  SELECT route_type INTO route FROM logistics.shipments WHERE id=NEW.shipment_id;
  IF NEW.event_type='DELIVERED_GERMANY_WAREHOUSE' AND route <> 'FACTORY_TO_GERMANY_WAREHOUSE' THEN
    RAISE EXCEPTION 'Germany warehouse milestone is invalid for this route';
  END IF;
  IF NEW.event_type='DELIVERED_WAREHOUSE' AND route <> 'FACTORY_TO_DOMESTIC_WAREHOUSE' THEN
    RAISE EXCEPTION 'Domestic warehouse milestone is invalid for this route';
  END IF;
  IF NEW.event_type='DELIVERED_DEALER' AND route <> 'FACTORY_TO_DEALER_DIRECT' THEN
    RAISE EXCEPTION 'Dealer milestone is invalid for this route';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION logistics.validate_shipment_route() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE address_partner uuid;
BEGIN
  IF NEW.carrier_partner_id IS NOT NULL THEN
    PERFORM logistics.require_partner_role(NEW.carrier_partner_id,'LOGISTICS_PROVIDER',
      'Shipment carrier must have LOGISTICS_PROVIDER Partner role');
  END IF;
  IF NEW.route_type='FACTORY_TO_DEALER_DIRECT' THEN
    PERFORM logistics.require_partner_role(NEW.destination_dealer_partner_id,'DEALER',
      'Dealer-direct destination must have DEALER Partner role');
    SELECT partner_id INTO address_partner FROM partners.addresses WHERE id=NEW.destination_address_id;
    IF address_partner IS DISTINCT FROM NEW.destination_dealer_partner_id THEN
      RAISE EXCEPTION 'Dealer-direct destination address must belong to the selected Dealer';
    END IF;
  END IF;
  IF NEW.route_type='FACTORY_TO_DOMESTIC_WAREHOUSE' AND NOT EXISTS (
    SELECT 1 FROM warehouse.locations l JOIN warehouse.warehouses w ON w.id=l.warehouse_id
    WHERE l.id=NEW.destination_location_id AND w.country_code='CN'
  ) THEN
    RAISE EXCEPTION 'Domestic delivery destination must belong to a China warehouse';
  END IF;
  RETURN NEW;
END;
$$;

-- A shipment linked to a PO may only include SKUs purchased under that PO.
CREATE OR REPLACE FUNCTION logistics.require_po_cargo_match() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE linked_po uuid; cargo_sku uuid;
BEGIN
  SELECT source_purchase_order_id INTO linked_po FROM logistics.shipments WHERE id=NEW.shipment_id;
  IF linked_po IS NULL THEN RETURN NEW; END IF;
  cargo_sku := NEW.sku_id;
  IF NEW.item_kind='VEHICLE' THEN
    SELECT sku_id INTO cargo_sku FROM vehicle.vehicles WHERE id=NEW.vehicle_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM procurement.purchase_order_lines l
    WHERE l.purchase_order_id=linked_po AND l.sku_id=cargo_sku AND l.line_kind='PURCHASE') THEN
    RAISE EXCEPTION 'Shipment cargo SKU does not match a purchased SKU in source PO';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER logistics_shipment_po_cargo_guard
BEFORE INSERT ON logistics.shipment_cargo
FOR EACH ROW EXECUTE FUNCTION logistics.require_po_cargo_match();

-- Reuse existing receiving_handoffs and inventory_received marker, preserving
-- the original anti-fake-stock and dealer-direct constraints for both warehouses.
CREATE OR REPLACE FUNCTION logistics.validate_receiving_handoff() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  route text;
  shipment_destination uuid;
  cargo_shipment uuid;
  movement_destination uuid;
  movement_reference_type text;
  movement_reference_id uuid;
BEGIN
  SELECT route_type,destination_location_id INTO route,shipment_destination
  FROM logistics.shipments WHERE id=NEW.shipment_id;
  IF route IS NULL OR route NOT IN ('FACTORY_TO_GERMANY_WAREHOUSE','FACTORY_TO_DOMESTIC_WAREHOUSE') THEN
    RAISE EXCEPTION 'Dealer-direct shipment cannot create a warehouse receiving handoff';
  END IF;
  IF shipment_destination IS DISTINCT FROM NEW.destination_location_id THEN
    RAISE EXCEPTION 'Receiving handoff must use shipment destination location';
  END IF;
  SELECT shipment_id INTO cargo_shipment FROM logistics.shipment_cargo WHERE id=NEW.cargo_id;
  IF cargo_shipment IS DISTINCT FROM NEW.shipment_id THEN
    RAISE EXCEPTION 'Receiving handoff cargo must belong to the shipment';
  END IF;
  SELECT destination_location_id,reference_type,reference_id
  INTO movement_destination,movement_reference_type,movement_reference_id
  FROM inventory.movements WHERE id=NEW.inventory_movement_id;
  IF movement_destination IS DISTINCT FROM NEW.destination_location_id
    OR movement_reference_type IS DISTINCT FROM 'SHIPMENT'
    OR movement_reference_id IS DISTINCT FROM NEW.shipment_id THEN
    RAISE EXCEPTION 'Receiving handoff Inventory movement must be shipment receipt at destination';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION logistics.validate_inventory_received_marker() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE cargo_count integer; handoff_count integer;
BEGIN
  IF OLD.inventory_received_at IS NOT NULL AND NEW.inventory_received_at IS DISTINCT FROM OLD.inventory_received_at THEN
    RAISE EXCEPTION 'Shipment Inventory receiving marker is immutable';
  END IF;
  IF NEW.inventory_received_at IS NOT NULL AND OLD.inventory_received_at IS NULL THEN
    IF NEW.route_type NOT IN ('FACTORY_TO_GERMANY_WAREHOUSE','FACTORY_TO_DOMESTIC_WAREHOUSE')
      OR NEW.status <> 'DELIVERED' THEN
      RAISE EXCEPTION 'Only delivered warehouse-route shipments can be marked received into Inventory';
    END IF;
    SELECT count(*)::int INTO cargo_count FROM logistics.shipment_cargo WHERE shipment_id=NEW.id;
    SELECT count(*)::int INTO handoff_count FROM logistics.receiving_handoffs WHERE shipment_id=NEW.id;
    IF cargo_count=0 OR handoff_count <> cargo_count THEN
      RAISE EXCEPTION 'Every shipment cargo line requires an Inventory receiving handoff';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
