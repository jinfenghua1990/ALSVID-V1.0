# ALSVID Database Architecture Decision

## 1. Database Strategy Overview

ALSVID adopts PostgreSQL as the long-term database standard.

The database layer must follow these principles:

- Use open standards.
- Avoid excessive platform lock-in.
- Keep business logic independent from database providers.
- Allow future migration between compatible PostgreSQL services.

---

# 2. Why PostgreSQL?

PostgreSQL is selected as the database standard because:

- Mature open-source relational database.
- Strong data consistency.
- Suitable for business systems.
- Large ecosystem.
- Supports complex relationships required by vehicle lifecycle management.

ALSVID data includes:

- Vehicles.
- VIN / frame numbers.
- Customers.
- Dealers.
- Warranty records.
- Repair history.
- Service records.
- External system synchronization records.

These require relational data management rather than a simple document database.

---

# 3. Current Primary Database Choice

## Neon PostgreSQL

Neon PostgreSQL is the current primary database service provider.

Reasons for selection:

- PostgreSQL native.
- Serverless architecture.
- Low operational maintenance.
- Suitable for small teams.
- Supports database branching for development and testing.
- Easy environment separation.

Current decision:

```text
Production Database:
Neon PostgreSQL
```

---

# 4. Alternative Database Option

## Supabase PostgreSQL

Supabase is maintained as a migration backup option.

It is not the current primary choice.

Reasons to keep Supabase as backup:

- PostgreSQL compatible.
- Provides additional backend services.
- Large developer ecosystem.
- Can support future requirements if ALSVID needs more integrated services.

Current decision:

```text
Primary:
Neon PostgreSQL

Alternative:
Supabase PostgreSQL
```

---

# 5. Development and CI database strategy

Local development and automated CI use isolated PostgreSQL databases. CI creates a disposable PostgreSQL 18 service for migration and integration checks. Production uses the managed Neon PostgreSQL database.

A separately managed non-production database may be used only for a specific integration test when explicitly provisioned and verified. The former Neon Development/Test resources are not assumed to exist or form a required acceptance gate.

# 6. Production data separation

Production data must never be used for destructive testing, migration experiments or seed/reset workflows. Ordinary local development and CI use isolated credentials; CI does not receive Production secrets. An explicitly authorized local Production runtime is a separate opt-in mode and shares the same Production Neon/R2 as Cloud Run without running tests, seeds or migrations (see [LOCAL_PRODUCTION.md](LOCAL_PRODUCTION.md)).

`main` changes are validated in CI before deployment. Test data is never copied or promoted to Production.

---

# 7. Data Ownership Principle

ALSVID does not become the source system for every business process.

Data ownership:

ALSVID Commerce (first-party):

- Product offerings, first-party storefront order and checkout orchestration, and ALSVID-owned transaction records.
- Authorized order, customer and payment-event references required for internal operations and after-sales.

Approved payment service provider (PSP):

- Payment processing, provider-side refunds and settlement execution; ALSVID stores verified events and reconciliation facts, not card secrets.

Historical external channels:

- Retired Shopify channel/order records remain available for read-only audit and data lineage. No new Shopify ingestion, replay or channel registration.

WMS:

- Inventory execution.
- Warehouse operations.
- Shipment/dispatch execution.

ALSVID:

- Vehicle lifecycle.
- Customer/dealer service relationships.
- Warranty information.
- Repair/service history.
- Important external business facts required for Vehicle 360, My ALSVID and after-sales.

ALSVID stores required business facts, not unnecessary copies of external systems.

---

# 8. Why Neon Rather Than Supabase as Primary Today?

Both are valid PostgreSQL platforms. Neon is primary today because ALSVID already owns its application/API/identity/domain layers and uses Cloudflare R2 for files. A focused managed PostgreSQL provider keeps the initial infrastructure simpler and avoids adopting platform capabilities ALSVID does not currently need.

Supabase remains explicitly approved as a migration alternative because it preserves PostgreSQL compatibility and may become attractive if its integrated capabilities provide real future value.

---

# 9. Future Migration Principle

If the database provider changes in the future, the business layer should remain unchanged as far as reasonably possible.

Migration target:

```text
PostgreSQL-compatible managed database
```

Provider-specific features must not leak into core business rules unless intentionally documented and justified.

A future switch from Neon to Supabase (or another PostgreSQL provider) should be treated as an infrastructure migration, not a redesign of ALSVID.