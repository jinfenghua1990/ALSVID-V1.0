# Numeric product ID integration
The canonical customer-facing identity is `product.models.product_id` (six decimal digits, assigned by migration 0047 sequence and immutable). `product.skus.sku_number` is a nine-digit SKU number with that six-digit prefix and a 001–999 suffix. Do not manually mint or reuse either. The system keeps UUID `product.models.id` for internal joins; model `code` is mutable business naming, not identity.

## Admin operations
- Product R&D creates the Product record, auto-assigning the numeric ID; the save response displays the ID. All products are one authority.
- Commerce product list filters by numeric Product ID and canonical deep links use `?productId=100001`. Old `?modelId=UUID` bookmarks continue to work.
- Homepage fixed historical slots can choose the eligible product by numeric ID in the UI; API continues to persist UUID mapping. These slots still have historical model-code eligibility constraints and have **not** become arbitrary dynamically rendered pages.
- Commerce visual editor offers **only** products returned by reviewed `/v1/product/public/catalog`. Inserting a product saves a draft preview block with `data-product-id=100001` and an actual numeric WWW detail URL; no stale static price/stock. The editor's draft is NOT connected to live WWW rendering or checkout until a later reviewed publication pipeline is implemented.
- WWW detail routes already resolve published bikes from `/{locale}/explore/{productId}`. Product publication status and approved artwork remain mandatory gates. No new public checkout or ATP access in this change.

## Safety
No migration renumbering, existing product ID edits, fake catalog inventory, auto publish, seed data insertion or payment activation. Numeric IDs are primary operator references, not a reason to bypass UUID-backed domain foreign keys.
