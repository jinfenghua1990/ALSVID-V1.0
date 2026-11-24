# ALSVID Runtime Provider Options

Status: approved runtime-provider shortlist

## Decision

ALSVID keeps the runtime layer replaceable. The current provider order is:

1. **Google Cloud Run — preferred**
2. **Railway Free — second option**
3. **Apply.Build Free — third option**

This ranking applies to the current low-traffic stage. It is an operating preference, not a permanent platform lock-in.

## 1. Google Cloud Run — preferred

Why it is first:

- large, mature cloud provider;
- supports the current Docker/FastAPI runtime model;
- can scale to zero for low-frequency internal use;
- fits the current goal of keeping normal compute spend at or near $0 while usage remains within free allowances;
- can connect to GitHub for source-driven builds/deployments;
- suitable for later paid growth without changing ALSVID business architecture.

Cost posture:

- billing account/card may be attached;
- configure request-based billing, `min instances = 0`, and conservative maximum instances;
- enable budget alerts and available spend controls before Production;
- the goal is $0 normal compute cost in the initial low-traffic stage, but $0 is not guaranteed.

## 2. Railway Free — second option

Why it remains the second option:

- simple GitHub/Docker deployment experience;
- appropriate for a low-frequency internal system;
- useful fallback if Cloud Run becomes inconvenient for mainland-China access, account/billing policy, or operational simplicity.

Trade-off:

- free resource allowance is tighter than the preferred Cloud Run path;
- long-term cost/value should be re-evaluated once actual ALSVID usage is known.

## 3. Apply.Build Free — third option

Why it remains available:

- Docker/GitHub deployment model fits ALSVID;
- free entry tier is attractive for test or fallback use;
- useful as a contingency runtime because the ALSVID application is intentionally portable.

Trade-off:

- smaller provider/platform footprint than Google Cloud or Railway;
- therefore it is not the first choice for long-term Production unless real-world testing proves it more suitable.

## Selection rule

Do not redesign ALSVID around any one runtime provider.

The runtime provider may be changed if any of the following become materially better elsewhere:

- mainland-China accessibility;
- reliability;
- operating simplicity;
- cost;
- deployment workflow;
- security/operational controls.

Changing the runtime must not require moving the authoritative ALSVID business data model.

The durable architecture remains:

- GitHub: source code/history;
- PostgreSQL/Supabase initially: structured business data;
- Cloudflare R2: binary files;
- Shopify / future OMS / WMS / logistics providers: external execution systems;
- ALSVID: Vehicle/VIN, Warranty, ServiceCase and other explicitly ALSVID-owned business facts.
