> **Owner decision, 2026-11-02:** The Shopify runtime adapter is retired: no new Shopify channels, webhook ingestion/replay, checkout dependency or second business database. Historical external records and migrations are retained read-only. Do not derive current implementation from archived Shopify-first documents. See [retirement boundary](SHOPIFY_RETIREMENT_2026-11-02.md).

# ALSVID AI Context

## Purpose

This document exists so future AI assistants, developers, and maintainers understand why ALSVID is designed this way before making changes.

## ALSVID Positioning

ALSVID is a bicycle brand digital platform focused on vehicle lifecycle management.

ALSVID manages:

- Vehicle identity (VIN)
- Vehicle 360 records
- Customer ownership relationship
- Warranty
- Service history
- After-sales processes
- Dealer service information

## What ALSVID is NOT

ALSVID is not:

- A replacement for WMS execution
- A general-purpose OMS or marketplace aggregator
- A full ERP replacement
- A payment processor or acquiring bank

ALSVID owns its first-party B2C storefront checkout and order records. A contracted PSP handles payment processing. Shopify is not required for the initial release; see [ADR 0005](adr/0005-alsvid-owned-storefront-and-third-party-payments.md).

## Core Business Boundary

ALSVID Commerce owns ALSVID's own consumer storefront transactions: product/variant selection, cart, checkout orchestration, customer order records and customer-visible order status.

Finance owns payment attempts, verified payment state, refunds, allocations and settlement facts. A PSP executes payment processing and is the source of external payment events; ALSVID validates provider signatures, order/amount/currency binding and idempotency before updating state.

WMS owns physical stock and warehouse execution: picking, packing, dispatch and warehouse-side fulfillment.

ALSVID owns storefront orders but does not replace WMS or become a general-purpose OMS.

## Core Architecture Principles

1. Keep business logic independent from vendors.
2. Use PostgreSQL standards to avoid database lock-in.
3. Keep deployment containerized and portable.
4. Do not add complexity before business requirements require it.
5. Preserve clear ownership boundaries between ALSVID Commerce, Finance, external PSPs and WMS.
6. Do not redesign confirmed architecture without reviewing existing decisions.

## Current Infrastructure Decisions

Runtime:

- Primary: Google Cloud Run
- Fallback 1: Railway
- Fallback 2: Apply.Build

Database:

- Primary: Neon PostgreSQL
- Alternative: Supabase PostgreSQL

Storage:

- Cloudflare R2

Development and CI:

- Local workstation and Docker for development.
- Disposable GitHub-hosted runners for automated checks, with temporary PostgreSQL and no Production secrets.
- The former shared cloud Development/Test runtime is retired.

Production:

- Google Cloud Run in verified `alsvid-production` (`europe-west1`).
- Neon PostgreSQL.
- Cloudflare R2.

## Future AI Rule

Before changing architecture, check:

- Why was the current choice made?
- What problem does the change solve?
- Does it violate ALSVID boundaries?
- Is there a simpler solution?


## Environment and release model (2026-10-14)

The current cloud runtime is Production only (verified project `alsvid-production`, region `europe-west1`; `alsvid-prod` is not an active deployment). Local Docker and ephemeral GitHub CI are the development/validation environments. The former cloud Development/Test runtime and automatic promotion flow are retired. Pull requests target `main`; Production deployment requires successful CI for the exact commit. Treat older Development references elsewhere in the docs as historical unless explicitly updated. Verify live cloud inventory before claiming a resource exists or was deleted.

## Design tool and portal boundary — 2026-10-16

The design/portal target is documented in `docs/DESIGN_TOOL_AND_PORTAL_BOUNDARY_2026-10-16.md` and ADR 0004. Current implementation evidence, known gaps and task dependencies are in `docs/PORTAL_DELIVERY_PLAN_2026-10-16.md`. Read both before changing portals; older tool assignments or pre-deployment status do not override them.

### Design tools

- **Ardot:** internal ALSVID Admin operations design/prototyping only. This includes Admin workbench, products, orders, production, inventory, dealer management from the employee view, customer, after-sales, supply chain, supplier management, data and settings.
- **Figma:** final UI/visual design for all external user portals: ALSVID Official / Shop, My ALSVID, ALSVID Dealer Portal, and the future Supplier Portal.
- Ardot and Figma must not maintain two competing final designs for the same page.
- A design file is not evidence that code, API integration, CI, deployment or business acceptance is complete.

### Portal model

The four confirmed core projects remain:

1. ALSVID Official
2. My ALSVID
3. ALSVID Dealer Portal
4. ALSVID Admin

A **Supplier Portal** is a confirmed phased delivery target (#185), not an already delivered fifth core project. Upstream supplier self-service must include actual scoped workflows, rather than remain indefinitely a supplier field or role seed. Retain existing monorepo/domain foundations; portal count does not require separate backends/databases.

### External commerce boundary

ALSVID Commerce owns the first-release self-built WWW B2C storefront, preview cart, checkout orchestration and ALSVID order records; an approved PSP performs payment processing. Shopify is not a first-release dependency. Any later external channel, including Shopify B2B, requires an explicit owner decision and verified identity/order/price authority mapping. Do not turn any external commerce provider into ALSVID Admin, WMS, or a full upstream supplier collaboration system.

### Supplier boundary

For an upstream supplier that supplies ALSVID, the long-term self-service flow is:

```text
ALSVID Admin
  -> Procurement / PO
  -> Supplier Portal
  -> supplier confirms quantity / delivery date
  -> production progress
  -> shipment notice
  -> documents / invoice
  -> ALSVID receiving / QC / inventory
```

Supplier proposals/quotations may initiate the workflow, but formal PO issue, commercial approval, physical receiving/QC and payments remain with their owning authorized processes. Supplier reports and invoice uploads are submitted evidence. See the implementation plan's action matrix before exposing internal Procurement APIs.

If the same company also buys ALSVID products, it can separately have a Dealer/B2B buyer relationship if and when that channel is approved. Supplier relationship and B2B buyer relationship must remain separate in permissions, order types and data scope.

### Implementation rule

Future AI agents must read `docs/PROJECT_MEMORY_INDEX.md`, `docs/CURRENT_STATE.md`, ADR 0005/0006 and `docs/DESIGN_TOOL_AND_PORTAL_BOUNDARY_2026-10-16.md` before changing portal UI, any approved external commerce integration, supplier flows or design-tool ownership. Do not delete existing design assets or code solely because ownership moved; first inspect whether the asset is a duplicate, an implementation dependency, or a historical fixture.

Current gaps matter: My still uses shared UI garage fixtures; My must use ALSVID-owned email verification and server-verified vehicle ownership, not Shopify Customer OAuth; Dealer/Supplier roles are not organization-scoped entitlements. Parent-domain Cookies are sent to matching subdomains, including My, even with a different My cookie name. Follow the current delivery plan and verify scope before exposing real external business data. Issue #20 is closed; do not restart the historical platform rebuild or retired cloud Test/M1 release work.
