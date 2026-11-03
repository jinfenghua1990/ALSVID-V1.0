-- Explicit commercial product series, separate from existing engineering platforms.
CREATE TABLE product.series (
 series_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][A-Z0-9_-]*$'),
 name_zh text NOT NULL,
 name_en text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
 default_platform_id uuid REFERENCES product.platforms(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
-- One-time conversion of historical technical-platform grouping into a separate,
-- editable series attribute; the legacy platform relation remains unchanged.
INSERT INTO product.series(code,name_zh,name_en,status,default_platform_id)
SELECT p.code,
 CASE p.code WHEN 'FC' THEN '折叠系列' WHEN 'FT' THEN '胖胎系列'
             WHEN 'CT' THEN '城市通勤系列' WHEN 'GT' THEN '旅行系列'
             ELSE p.name END,
 CASE p.code WHEN 'FC' THEN 'Folding Series' WHEN 'FT' THEN 'Fat Tire Series'
             WHEN 'CT' THEN 'City Commuter Series' WHEN 'GT' THEN 'Touring Series'
             ELSE p.name END,
 p.status,p.id
FROM product.platforms p ON CONFLICT(code) DO NOTHING;
ALTER TABLE product.models ADD COLUMN series_id bigint REFERENCES product.series(series_id) ON DELETE RESTRICT;
UPDATE product.models m
SET series_id=s.series_id
FROM product.platforms p JOIN product.series s ON s.code=p.code
WHERE m.product_type_code='BIKE' AND m.platform_id=p.id AND m.series_id IS NULL;
CREATE INDEX product_models_series_id_idx ON product.models(series_id) WHERE series_id IS NOT NULL;
