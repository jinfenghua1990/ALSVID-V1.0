-- Factory completion does NOT automatically manufacture sellable stock.
-- Real factory warehouse count creates a protected inventory receipt.
CREATE TABLE production.factory_finished_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  production_order_id uuid NOT NULL REFERENCES production.production_orders(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES warehouse.locations(id) ON DELETE RESTRICT,
  inventory_movement_id uuid NOT NULL UNIQUE REFERENCES inventory.movements(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK(quantity>0 AND quantity=trunc(quantity)),
  received_by uuid REFERENCES identity.users(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX production_factory_receipts_order_idx
  ON production.factory_finished_receipts(production_order_id,received_at);

CREATE OR REPLACE FUNCTION production.validate_factory_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE factory uuid; sku uuid; expected_qty numeric; order_status text;
        previous_qty numeric; destination_partner uuid; country text;
        move_qty numeric; move_sku uuid; move_location uuid; move_kind text;
        move_reference_type text; move_reference_id uuid; move_type text;
BEGIN
  SELECT po.factory_partner_id,bs.sku_id,po.planned_quantity,po.status
    INTO factory,sku,expected_qty,order_status
    FROM production.production_orders po
    JOIN engineering.build_specs bs ON bs.id=po.build_spec_id
    WHERE po.id=NEW.production_order_id;
  IF order_status IS DISTINCT FROM 'COMPLETED' THEN
    RAISE EXCEPTION 'Factory goods must be completed and QC passed before receipt';
  END IF;
  SELECT w.partner_id,w.country_code INTO destination_partner,country
    FROM warehouse.locations l JOIN warehouse.warehouses w ON w.id=l.warehouse_id
    WHERE l.id=NEW.location_id;
  IF country IS DISTINCT FROM 'CN' OR destination_partner IS DISTINCT FROM factory THEN
    RAISE EXCEPTION 'Factory receipt must use the China warehouse owned by the production factory';
  END IF;
  SELECT COALESCE(sum(quantity),0) INTO previous_qty
    FROM production.factory_finished_receipts WHERE production_order_id=NEW.production_order_id;
  IF previous_qty+NEW.quantity>expected_qty THEN
    RAISE EXCEPTION 'Factory receipt exceeds actual completed production quantity';
  END IF;
  SELECT movement_type,quantity,sku_id,item_kind,destination_location_id,reference_type,reference_id
    INTO move_type,move_qty,move_sku,move_kind,move_location,move_reference_type,move_reference_id
    FROM inventory.movements WHERE id=NEW.inventory_movement_id;
  IF move_type IS DISTINCT FROM 'RECEIPT' OR move_qty IS DISTINCT FROM NEW.quantity
    OR move_sku IS DISTINCT FROM sku OR move_kind IS DISTINCT FROM 'SKU'
    OR move_location IS DISTINCT FROM NEW.location_id
    OR move_reference_type IS DISTINCT FROM 'PRODUCTION_ORDER'
    OR move_reference_id IS DISTINCT FROM NEW.production_order_id THEN
    RAISE EXCEPTION 'Factory receipt requires matching physical inventory movement';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER production_factory_receipt_guard
BEFORE INSERT ON production.factory_finished_receipts
FOR EACH ROW EXECUTE FUNCTION production.validate_factory_receipt();

CREATE OR REPLACE FUNCTION production.reject_factory_receipt_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Factory receiving ledger is append-only';
END;
$$;
CREATE TRIGGER production_factory_receipt_immutable
BEFORE UPDATE OR DELETE ON production.factory_finished_receipts
FOR EACH ROW EXECUTE FUNCTION production.reject_factory_receipt_mutation();
