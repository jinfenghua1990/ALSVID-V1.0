-- Real multi-stage warehouse receipts. No arrival status may create stock by itself.
ALTER TABLE logistics.receiving_handoffs ADD COLUMN received_quantity numeric(18,6);
UPDATE logistics.receiving_handoffs h SET received_quantity=c.quantity
  FROM logistics.shipment_cargo c WHERE c.id=h.cargo_id;
ALTER TABLE logistics.receiving_handoffs
  ALTER COLUMN received_quantity SET NOT NULL,
  ADD CONSTRAINT receiving_handoffs_received_quantity_positive CHECK(received_quantity>0),
  DROP CONSTRAINT IF EXISTS receiving_handoffs_cargo_id_key;
CREATE INDEX receiving_handoffs_cargo_idx ON logistics.receiving_handoffs(cargo_id);

CREATE OR REPLACE FUNCTION logistics.validate_receiving_handoff() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE route text; destination uuid; cargo_shipment uuid; cargo_qty numeric;
        cargo_kind text; existing_qty numeric; movement_qty numeric; movement_dest uuid;
        receipt_move_type text; movement_reference_type text; movement_reference_id uuid;
BEGIN
  SELECT route_type,destination_location_id INTO route,destination
    FROM logistics.shipments WHERE id=NEW.shipment_id;
  IF route IS NULL OR route NOT IN ('FACTORY_TO_GERMANY_WAREHOUSE','FACTORY_TO_DOMESTIC_WAREHOUSE') THEN
    RAISE EXCEPTION 'Dealer-direct shipment cannot create warehouse receipt';
  END IF;
  IF destination IS DISTINCT FROM NEW.destination_location_id THEN
    RAISE EXCEPTION 'Receipt destination differs from shipment destination';
  END IF;
  SELECT shipment_id,quantity,item_kind INTO cargo_shipment,cargo_qty,cargo_kind
    FROM logistics.shipment_cargo WHERE id=NEW.cargo_id;
  IF cargo_shipment IS DISTINCT FROM NEW.shipment_id THEN
    RAISE EXCEPTION 'Receipt cargo does not belong to shipment';
  END IF;
  SELECT COALESCE(sum(received_quantity),0) INTO existing_qty
    FROM logistics.receiving_handoffs WHERE cargo_id=NEW.cargo_id;
  IF NEW.received_quantity<=0 OR existing_qty+NEW.received_quantity>cargo_qty
    OR (cargo_kind='VEHICLE' AND NEW.received_quantity<>1) THEN
    RAISE EXCEPTION 'Received quantity must be positive and cannot exceed shipment cargo quantity';
  END IF;
  SELECT quantity,destination_location_id,movement_type,reference_type,reference_id
    INTO movement_qty,movement_dest,receipt_move_type,movement_reference_type,movement_reference_id
    FROM inventory.movements WHERE id=NEW.inventory_movement_id;
  IF movement_dest IS DISTINCT FROM NEW.destination_location_id
    OR receipt_move_type IS DISTINCT FROM 'RECEIPT'
    OR movement_qty IS DISTINCT FROM NEW.received_quantity
    OR movement_reference_type IS DISTINCT FROM 'SHIPMENT'
    OR movement_reference_id IS DISTINCT FROM NEW.shipment_id THEN
    RAISE EXCEPTION 'Warehouse receipt requires a matching real inventory movement';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION logistics.validate_inventory_received_marker() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.inventory_received_at IS NOT NULL AND NEW.inventory_received_at IS DISTINCT FROM OLD.inventory_received_at THEN
    RAISE EXCEPTION 'Shipment inventory receipt marker is immutable';
  END IF;
  IF NEW.inventory_received_at IS NOT NULL AND OLD.inventory_received_at IS NULL THEN
    IF NEW.route_type NOT IN ('FACTORY_TO_GERMANY_WAREHOUSE','FACTORY_TO_DOMESTIC_WAREHOUSE')
      OR NEW.status<>'DELIVERED' THEN
      RAISE EXCEPTION 'Only delivered warehouse shipments can be fully received';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM logistics.shipment_cargo WHERE shipment_id=NEW.id)
      OR EXISTS (
        SELECT 1 FROM logistics.shipment_cargo c
        LEFT JOIN logistics.receiving_handoffs h ON h.cargo_id=c.id
        WHERE c.shipment_id=NEW.id
        GROUP BY c.id,c.quantity HAVING COALESCE(sum(h.received_quantity),0)<>c.quantity
      ) THEN
      RAISE EXCEPTION 'All cargo quantities must be fully received before completion';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
