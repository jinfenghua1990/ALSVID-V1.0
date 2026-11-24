# Phase 3 Source Disposition Note

Source baseline: `jinfenghua1990/ChaiBen-OS@5cb68246f5049be90f9acdb4d6dc89b7decec803`.

| Legacy source | Standalone replacement | Result |
|---|---|---|
| `services/alsvid_engineering.py` | `services/engineering.py` | REWRITE; keeps product/BOM invariants, removes Workspace coupling and fixes revision allocation race |
| `routers/alsvid_product_center.py` | `api/product.py` | REWRITE; standalone read/write Product Center API |
| `routers/alsvid_asset_storage.py` | `api/assets.py` + `services/object_storage.py` | REWRITE; no Workspace scope, same R2 verification pattern |
| `routers/alsvid_vehicle_center.py` | `api/vehicles.py` + `services/vehicle_center.py` | REWRITE; standalone list plus Vehicle 360 projection |
| `services/vehicle_lifecycle.py` | `services/vehicle_lifecycle.py` | REWRITE; deterministic event ordering and unconditional factory-outbound downstream gate |
| `*_web.py` legacy ALSVID pages | none | REJECT; new standalone UI will be redesigned against new APIs |

This note is intentionally narrow. Customer Center and Service Center projection parity are handled in the next extraction slice.
