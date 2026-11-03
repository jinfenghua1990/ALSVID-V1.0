-- Supplier ↔ Factory relations.
-- A factory is its own Partner with the FACTORY role; one supplier can own many
-- factories and a factory can serve several suppliers, so this is a link table
-- rather than a parent/child column on partners.partners.
CREATE TABLE partners.supplier_factories (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  supplier_partner_id uuid NOT NULL REFERENCES partners.partners(id) ON DELETE CASCADE,
  factory_partner_id uuid NOT NULL REFERENCES partners.partners(id) ON DELETE CASCADE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_factories_unique_pair UNIQUE (supplier_partner_id, factory_partner_id),
  CONSTRAINT supplier_factories_not_self CHECK (supplier_partner_id <> factory_partner_id)
);

CREATE INDEX supplier_factories_factory_idx
  ON partners.supplier_factories(factory_partner_id);
