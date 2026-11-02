-- Finalized costs must correspond to real allocations, not placeholders.
CREATE OR REPLACE FUNCTION finance.validate_landed_batch_finalization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='FINALIZED' AND OLD.status='DRAFT' THEN
    IF NOT EXISTS(SELECT 1 FROM finance.landed_cost_components WHERE batch_id=NEW.id)
      OR EXISTS(
        SELECT 1 FROM finance.landed_cost_components c
        LEFT JOIN finance.landed_cost_allocations a ON a.component_id=c.id
        WHERE c.batch_id=NEW.id AND c.capitalizable=true GROUP BY c.id,c.batch_currency_amount
        HAVING COALESCE(sum(a.allocated_amount),0)<>c.batch_currency_amount
      ) THEN
      RAISE EXCEPTION 'Landed cost batch requires every component to be completely allocated';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER finance_landed_batch_complete_guard
BEFORE UPDATE OF status ON finance.landed_cost_batches
FOR EACH ROW EXECUTE FUNCTION finance.validate_landed_batch_finalization();
