# Authority Note

This repository is authoritative for ALSVID.

If an older chat, ChaiBen-OS document, migration note or extracted source file contradicts the current ALSVID repository, do not follow the older source automatically. Read `AGENTS.md`, `docs/CURRENT_STATE.md`, `docs/ARCHITECTURE.md`, `docs/DATA_OWNERSHIP.md` and the active Issue/PR first.

The current operating decisions are:

- ALSVID and ChaiBen-OS are separate applications and business boundaries.
- ALSVID uses a zero-data cutover from the legacy ChaiBen ALSVID workspace.
- No new ALSVID work goes into ChaiBen-OS.
- DOMESTIC-only 1688, JackYun/吉客云 and 卖咖啡的熊 concepts do not enter ALSVID runtime.
- PostgreSQL owns business facts/metadata; R2 owns binary bytes.
- Shopify remains external OMS.

This note exists specifically to prevent future automated contributors from reconstructing a superseded architecture from historical files or chats.
