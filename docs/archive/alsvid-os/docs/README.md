# ALSVID Documentation Index

Use this order for current project decisions:

1. `../AGENTS.md` — mandatory contributor/agent constitution.
2. `CURRENT_STATE.md` — current standalone authority, zero-data decision, implemented vs future scope.
3. `ARCHITECTURE.md` — runtime/domain architecture and invariants.
4. `DATA_OWNERSHIP.md` — one-owner-per-business-fact rules.
5. `INFRASTRUCTURE_CONTRACT.md` — PostgreSQL, R2 and Shopify infrastructure boundaries.
6. Current Issue/PR and current code/tests — active implementation decisions.

Historical extraction material:

- `MIGRATION_INVENTORY.md`
- `MIGRATION_INVENTORY_PHASE3_NOTE.md`
- `MIGRATION_STATUS.md`
- `PHASE3_ACCEPTANCE.md`
- `PHASE3_CLEAN_MIGRATION.md`
- `DATA_CUTOVER.md`

Historical migration documents do not override the current authority files above. The active cutover decision is zero-data: do not invent legacy rows or reintroduce ChaiBen runtime coupling merely to satisfy old extraction notes.
