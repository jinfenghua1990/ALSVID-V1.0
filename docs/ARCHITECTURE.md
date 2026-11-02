# Architecture

## Goal

Build ALSVID as a durable enterprise operating platform without making early deployment unnecessarily complex.

## System shape

ALSVID starts as a **modular monolith** with three deployable processes in one monorepo:

- `apps/web` — Next.js user surfaces
- `apps/api` — NestJS application/API runtime
- `apps/worker` — asynchronous jobs, external synchronization, AI-assisted processing and long-running workflow execution

They share contracts and libraries but do not share arbitrary mutable state.

## Independent frontend project boundaries

Current target and execution authority: [ADR 0004](adr/0004-portal-experience-commerce-and-supplier.md), [design/portal boundary](DESIGN_TOOL_AND_PORTAL_BOUNDARY_2026-10-16.md), and the [evidence/delivery plan](PORTAL_DELIVERY_PLAN_2026-10-16.md). Supplier self-service is a confirmed phased fifth portal target. Independent experience/security boundaries may initially share `apps/web`; split deployables only for a concrete need, without duplicating domains or business data.

The confirmed frontend projects are ALSVID Official (ALSVID 官网), My ALSVID (车主中心 / 我的车库), ALSVID Dealer Portal (经销商平台), and ALSVID Admin (内部运营中心). They are independent frontend applications, not four pages inside one system. Most entry relationships are cross-application links; unified identity and selected authorized business facts connect the projects. This frontend boundary remains compatible with the modular-monolith API and shared monorepo. The existing `apps/web` packaging is not proof that all four independent frontends have been implemented.

Admin defines a top-right App Switcher with 官网, 车主中心, and 经销商平台 links that open the corresponding application in a new tab and preserve Admin state. See [APP_ENTRY_ARCHITECTURE.md](APP_ENTRY_ARCHITECTURE.md) for naming, authorization, environment and implementation-status rules.

## Why modular monolith first

ALSVID has strongly connected workflows: procurement creates production demand, production creates inventory/vehicles, logistics moves stock, commerce creates receivables, payments settle obligations, and after-sales depends on the exact vehicle/build history. Splitting these into network services before the domain model stabilizes would increase operational cost and make consistency harder.

A domain may become an independent service later only when an ADR demonstrates a concrete need such as independent scaling, security isolation, team ownership or external SLA.

## Enforced Domain structure

Every implemented Domain uses this internal shape:

```text
domains/<domain>/
  domain.json
  src/
    core/             # entities, value objects, invariants, policies
    application/      # commands, queries, orchestration, ports
    infrastructure/   # persistence and external/provider adapters
    api/              # transport-facing contracts/DTO glue
    index.ts           # public facade only
```

Core and application code may not depend on framework-specific or provider-specific SDKs. PostgreSQL SQL belongs in Domain infrastructure adapters. Cross-Domain consumers import public facades/contracts only, never another Domain's internal paths.

Each Domain declares its architecture state in `domain.json`. `pnpm arch:check` is part of CI and rejects boundary violations. Feature work must not bypass that check by weakening the rule set.

## Platform packages

Shared packages are intentionally narrow:

- `@alsvid/kernel` — generic domain errors, operation context, clock and pagination primitives
- `@alsvid/database` — database/query/transaction mechanics, not business repositories
- `@alsvid/ports` — provider-neutral external capability ports
- `@alsvid/observability` — structured logging
- `@alsvid/jobs` — durable PostgreSQL job mechanics
- `@alsvid/ui` — reusable application-shell and UI primitives

Shared packages must not become a dumping ground for business rules or Domain-owned data models.

## Domain map

- Identity & Access — users, memberships, roles, permissions, sessions
- Partners — supplier/factory/dealer/customer/service/logistics identity and roles
- Product — platforms, models, variants, SKUs, commercial identity
- Engineering — parts, BOM revisions, build specifications, technical release
- Procurement — RFQ/quote/PO/receipts/supplier commitments
- Production — production orders, assembly, QC and release
- Vehicle — unique physical bicycle identity, Vehicle Birth, lifecycle and ownership history
- Inventory — stock movement ledger, availability and reservation
- Warehouse — receiving, putaway, bins, transfer, stocktake, pick/pack/dispatch
- Logistics — export shipments, customs and delivery milestones
- Commerce — channels, external orders, fulfillment mapping, returns
- Finance — invoices, obligations, payments, allocations, landed cost, FX, settlement
- Dealer — dealer operations, allocations, handover and dealer inventory views
- Customer — customer profile, garage, ownership, preferences
- Service — warranty, service cases, repair events, replacement parts
- Communication — provider-neutral messages/threads/drafts/attachments
- Marketing — consent, suppression, segments, campaigns and send history
- Assets — object metadata, access policy and business linkage
- Integrations — provider adapters and synchronization control plane
- Audit & Compliance — immutable audit/security/compliance evidence

Not every item in the domain map is implemented yet. The map defines ownership, not completion status.

## Data

PostgreSQL is authoritative for structured business facts. Tables are owned by domains.

Cloudflare R2 or another S3-compatible provider stores binary assets. Database rows store object key, bucket/provider, checksum, media metadata, classification, visibility and business relationships.

## Cross-domain interaction

Use one of three patterns:

1. direct in-process application contract for synchronous invariants
2. domain event/outbox for eventual side effects and integrations
3. read-model projection for dashboards and 360-degree views

Never solve cross-domain behavior with direct writes to another domain's tables. A caller-owned transaction may be passed through a public application contract when atomicity genuinely spans two Domains, but the called Domain still owns its persistence operation.

## API composition

`apps/api` is the composition root. It constructs Domain services through their public factories and wires structural ports explicitly.

HTTP concerns stay outside business Domains:

- a global request-context interceptor establishes `requestId` and `correlationId`
- API-originated audit records inherit those identifiers automatically
- a global exception filter maps shared `DomainError` kinds to HTTP status codes
- individual controllers do not maintain a registry of every Domain error class
- structured request logging goes through `@alsvid/observability`

External/provider webhooks terminate at integration adapters, are authenticated where required, normalized, idempotently recorded, then translated into domain commands/events.

## Long-running workflows

Procurement-to-delivery may span months. Workflow state must be explicit and recoverable. Initial implementation uses PostgreSQL-backed durable jobs in `apps/worker` with leases, retry handling and idempotency. A workflow engine such as Temporal may be introduced later behind the workflow port without rewriting domain invariants.

## UI composition

The UI is entity- and workflow-centered rather than menu/form-centered. `@alsvid/ui` owns reusable application-shell/navigation primitives so new screens do not invent a parallel ALSVID control plane.

Core patterns include:

- shared application shell and navigation
- global search/command palette when implemented
- timeline/activity stream
- 360-degree entity pages
- workflow status and exceptions
- side panels/drawers for fast inspection
- dense tables only where operationally necessary

Primary navigation begins with: Overview, Product, Supply, Commerce, Vehicle, Dealer, Partners, Finance, Service and Communication.
