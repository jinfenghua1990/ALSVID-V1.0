# Phase 3 Acceptance

Phase 3 is ready to merge when:

- the application imports with Product Center, Assets and Vehicle Center routers enabled;
- Ruff passes;
- the full pytest suite passes;
- BOM release is idempotent for unchanged content;
- asset metadata cannot escape its ALSVID owner key prefix;
- Vehicle 360 projects canonical lifecycle/warranty/service facts;
- no downstream Vehicle event can occur before factory outbound, including malformed imported rows with an empty build snapshot;
- no new runtime dependency on ChaiBen-OS, Workspace switching, 1688 or JackYun is introduced.
