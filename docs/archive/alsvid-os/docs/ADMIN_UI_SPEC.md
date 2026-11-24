# ALSVID Admin UI Specification

Status: durable internal-admin product/UI direction.

This document defines the intended standalone ALSVID administration experience. It does not redefine domain ownership in `ARCHITECTURE.md` or `DATA_OWNERSHIP.md`.

## 1. Design character

ALSVID admin should feel like a focused modern product, not a generic ERP skin.

Direction:
- premium, minimal and spacious;
- restrained Apple / DJI / modern mobility-product influence rather than copying any brand;
- gray-blue, matte graphite and premium neutral palette;
- clear hierarchy, generous whitespace and strong photography/3D where useful;
- Germany/EU urban-mobility context when product imagery appears;
- avoid generic Bootstrap-looking dashboards, dense module-card walls and unnecessary decorative gradients.

Visual design never changes business authority or permissions.

## 2. Primary navigation

Use one first-level navigation layer:

```text
工作台 | 产品中心 | 供应链中心 | 经销商中心 | 客户中心 | 车辆中心 | 售后中心 | 财务中心
```

Rules:
1. no permanent second navigation bar;
2. no generic “更多 / More” dumping ground;
3. no fixed ERP-style left sidebar as the primary product navigation unless a future validated redesign explicitly supersedes this rule;
4. detailed actions belong inside each center as tabs/sections/filters/drawers/context actions/detail routes;
5. use business language rather than internal technical names;
6. navigation may be permission-aware, but hiding a menu is never authorization.

## 3. Global shell

Conceptual internal entrance: `admin.alsvid.com`.

Persistent shell should provide:
- ALSVID brand/product identity;
- primary navigation;
- global search;
- role-aware quick actions;
- user/account entry;
- clear environment/preview indicators when relevant.

There is no ChaiBen Workspace switch in the standalone ALSVID shell.

Long-term global search may resolve:
- frame number;
- model/SKU;
- dealer;
- customer;
- service case;
- supported supply-chain/commercial references.

Search results route into the canonical owning center instead of duplicating a new record view.

## 4. 工作台

Answer: “what needs attention today?”

Prioritize:
- actionable pending work;
- exceptions and lifecycle gaps;
- vehicles awaiting key steps;
- dealer receipts/PDI/handover pending;
- sold/unclaimed Vehicles where relevant;
- urgent/open service cases;
- inventory/logistics exceptions once implemented;
- overdue commercial signals when authorized;
- recent meaningful activity.

Do not use the dashboard primarily as a grid of links to modules.

## 5. 产品中心

Hierarchy:

```text
FC / FT / CT / GT
    -> Model (FC1 / FT1 / CT1 / GT1)
    -> Variant / SKU / market / color / edition
    -> Parts / released BOM revisions
    -> Assets / manuals / exploded views / 3D / video / documents
```

Model detail should answer:
- what is this product/platform?;
- which SKUs/variants represent it?;
- current and prior released BOMs;
- applicable parts/assets/manuals/3D;
- which Vehicles were built from a revision, linked into Vehicle Center.

Assets are presented in business context rather than as an unrelated top-level “素材中心”.

## 6. 供应链中心

Show the ALSVID export flow from supplier/factory to channel:
- procurement;
- production batches;
- inbound/receiving;
- stock/warehouse;
- logistics/transit;
- serialized bicycle traceability.

A batch view should reconcile planned/completed/outbound quantities and frame-number coverage. Physical bicycles link to canonical Vehicle records rather than a separate supply-chain identity.

## 7. 经销商中心

Dealer list/360 should surface, as supported:
- identity/contact/location;
- authorization and territory;
- product/service capability;
- Vehicles in transit, custody, pending handover and sold;
- service responsibility;
- approved documents/materials;
- authorized commercial context.

Full Vehicle history remains Vehicle Center authority; dealer pages link there rather than duplicating it.

## 8. 客户中心

Buyer/customer list and 360 should support:
- name/contact;
- country/language;
- frame/model/dealer context;
- current and former owned Vehicles;
- purchase/dealer references;
- warranty/service summaries;
- interactions;
- marketing-consent evidence.

Consent presentation must distinguish registration/warranty/service from marketing permission and retain auditable opt-in/withdrawal evidence.

## 9. 车辆中心

Frame number is the primary lookup identity.

Candidate filters:
- model/SKU;
- lifecycle/current state;
- production batch;
- current dealer;
- owner bound/unbound;
- warranty/service attention.

Vehicle 360 should organize:

### Identity
- frame number;
- model/SKU/variant;
- lifecycle state.

### Birth/factory
- production batch/source;
- completion/outbound facts;
- immutable released BOM/build snapshot.

### Configuration
- original configuration;
- current serialized components where implemented;
- replacement history.

### Relationships
- current dealer/custodian;
- current owner/customer;
- activation/warranty references.

### Timeline
Chronological append-only material lifecycle events.

### Service
Open/recent cases and links to After-sales Center.

## 10. 售后中心

Prefer entry by frame-number search/scan or context from Vehicle/Dealer/Customer.

Show enough Vehicle context to avoid servicing the wrong configuration:
- frame/model/SKU;
- birth configuration;
- current component configuration where supported;
- warranty;
- service history;
- permitted dealer/customer relationship context.

ServiceCase presentation includes issue, priority, diagnosis, status, resolution, provider/dealer, parts/replacements, event history and supporting assets.

Digital service history follows the Vehicle while personal data remains access-controlled after ownership transfer.

## 11. 财务中心

Present ALSVID export/commercial finance facts by permission:
- receivables/payables;
- invoices/payments;
- open items/reconciliation;
- tax evidence;
- close/reporting;
- dealer/supplier context.

Do not add mathematically invalid cross-currency aggregation without an explicit conversion/reporting contract.

## 12. Cross-center navigation

Use links instead of duplicated authorities. Examples:

```text
Product / BOM revision -> filtered Vehicle list
Dealer -> associated Vehicles -> Vehicle 360
Customer -> owned Vehicle -> Vehicle 360
Vehicle -> Product / Dealer / Customer / ServiceCase
ServiceCase -> canonical Vehicle
```

Each destination owns its richer presentation.

## 13. States and feedback

Every first-party center must explicitly design:
- loading;
- empty/no data yet;
- no matching result;
- no permission;
- partial/missing reference data;
- integration unavailable;
- recoverable validation error;
- destructive-action confirmation where required.

Never display raw stack traces or pretend future data exists.

## 14. Responsive behavior

Internal Admin is desktop-first but should remain usable for lightweight tablet/mobile lookup.

- preserve table/workbench information density intelligently;
- keep frame number and primary status prominent;
- collapse secondary metadata before primary identifiers;
- do not convert every desktop workflow into an oversized card stack.

Dealer Portal and My ALSVID may use their own more mobile-first patterns.

## 15. UI implementation rule

Before major UI implementation, inspect current high-quality design references and use appropriate design tooling/plugins when available. A visual refresh must not duplicate backend rules or invent data. New UI should consume purpose-built standalone ALSVID APIs and preserve the domain/authorization contracts in this repository.
