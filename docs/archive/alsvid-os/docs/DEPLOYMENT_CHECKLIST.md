# ALSVID Initial Deployment Checklist

Status: execution checklist for the first managed-cloud deployment

## Phase A — repository safety

- Confirm `jinfenghua1990/ALSVID` visibility matches company policy. Current intended policy is Private before production credentials are connected.
- Never commit live Supabase, R2, Shopify, Google Cloud or WMS/OMS credentials.
- Merge deployment changes only after CI/tests pass.

## Phase B — Test environment

1. Create a dedicated Supabase Test project/database.
2. Create a dedicated R2 Test bucket.
3. Create a Google Cloud project for ALSVID Test or a clearly separated Test Cloud Run service.
4. Enable Cloud Run/Cloud Build/Artifact Registry as required by the chosen deploy flow.
5. Configure Cloud Run request-based billing.
6. Set minimum instances to `0`.
7. Set maximum instances to `1` initially.
8. Configure only Test secrets/environment variables.
9. Apply Alembic migrations to the Test database.
10. Deploy the container.
11. Verify `GET /health`.
12. Verify login, Vehicle Center, Service Center, Dealer/My ALSVID paths and R2 upload/download behavior.
13. Test access from normal company networks in mainland China and from at least one European network.
14. Test selected Shopify read/sync flows without introducing OMS behavior.
15. Test WMS/after-sales connector only against a safe sandbox/test account when available.

## Phase C — cost controls

Before Production:

- enable Cloud Billing budget alerts;
- keep Cloud Run `min instances = 0`;
- keep conservative `max instances`;
- verify whether Budget Spend Caps are available for the actual billing account/project and configure a low cap if available;
- avoid always-on resources that sit outside Cloud Run free allowances;
- avoid unnecessary VPC connectors and large egress through Cloud Run;
- keep binary files in R2.

Do not assume a budget alert stops spend. Spend Caps, where available, are the hard-stop mechanism for covered Cloud Run resources; otherwise operational monitoring and conservative quotas remain required.

## Phase D — Production environment

1. Create a separate Supabase Production project/database.
2. Create a separate R2 Production bucket.
3. Create a separate Cloud Run Production service.
4. Configure Production secrets only in the deployment environment.
5. Apply Production Alembic migrations as a controlled release step.
6. Deploy the same tested container artifact/configuration pattern.
7. Verify `GET /health` and authenticated flows.
8. Verify mainland-China internal access and European service/customer access.
9. Connect Shopify production integration only after the ALSVID boundary is verified: selected confirmed facts/references only; no general OMS logic.
10. Connect WMS/3PL only through its connector boundary; after-sales replacement requests may be issued from ServiceCase where explicitly supported.

## Phase E — Q4 backup

Q4 is a backup/disaster-recovery target, not the public runtime.

Schedule and verify:

- PostgreSQL backup/export;
- R2 incremental copy/verification;
- Git repository mirror/bundle;
- restore test at a defined interval;
- backup failure notification.

Add a second off-site backup later so Q4 is not the only recovery copy.

## Release principle

```text
change -> Test -> verify -> Production
```

Do not edit production code directly on the runtime platform. GitHub remains the source-of-truth for code and deployment definitions.
