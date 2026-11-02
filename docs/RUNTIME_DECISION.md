# Runtime Platform Decision

## Purpose

This document records which platform runs ALSVID, why it was selected, which alternatives were considered, and when a future migration should be evaluated. The goal is to prevent future developers or AI agents from reopening the same decision without a real business reason.

## Decision summary

- **Preferred operations model:** local-first, portable Docker application deployment for authorized operators, using the shared Production Neon database, R2 objects and centrally authorized secrets.
- **Existing public HTTPS runtime:** Google Cloud Run `alsvid-web` and `alsvid-api` remain active deployment targets; do not remove them or redirect the public website without a separately verified cutover.
- **Single business authority:** application instances on different computers are peers; neither local disks nor Cloud Run owns a separate business database.
- **Deployment principle:** GitHub `main` is the source of code releases; runtime vendors are replaceable and CI uses isolated synthetic fixtures.
- **Unverified boundary:** the optional local Production stack exists in code, but its actual startup, staff access and cross-instance write/read behavior still require acceptance.

## Why retain Cloud Run as a supported public runtime

The existing public-facing ALSVID website and business portals continue to require an HTTPS entrypoint independent of any one operator workstation. Cloud Run remains supported while authorized local instances run against the same data because:

- it is operated by a large, established cloud provider;
- it runs containerized applications directly;
- it supports scale-to-zero for low-traffic services;
- it avoids maintaining a traditional virtual server;
- it integrates with GitHub/CI-based deployment workflows;
- it can expose a default HTTPS URL before ALSVID owns a custom domain;
- it supports a future path to managed secrets, logs, IAM, jobs and other production controls if ALSVID grows.

## Why Cloud Run is not a permanent lock-in

Cloud Run is a current provider decision, not an architectural dependency. ALSVID must keep:

- Docker/container definitions under version control;
- configuration through environment variables/secrets;
- PostgreSQL as the database contract;
- S3-compatible object storage behind adapters/ports;
- business domains free of Google-specific APIs unless explicitly approved.

If Cloud Run becomes too expensive, operationally inconvenient, regionally unsuitable, or commercially unattractive, the runtime may move without redesigning ALSVID business logic.

## Boundaries for local business operation

An authorized workstation or NAS can run the application locally using shared Production data. This does **not** automatically make it a reliable public server: uptime, TLS, network access, identity, secrets, backups, and failover need independent review before changing the public site. Do not distribute database or object-storage secrets to ordinary employee computers.

## Why not use a traditional VPS first

A VPS can run ALSVID, but it also creates server administration work: operating-system patching, firewall maintenance, process supervision, reverse proxy management, certificate renewal, monitoring and capacity planning. ALSVID does not currently need this operational burden.

A VPS may be reconsidered later only if there is a clear cost, networking or regulatory reason.

## Alternative runtime option: Railway

Railway is an optional future runtime because it is simple to deploy from GitHub and works well with containerized applications. It is easier operationally than a self-managed server.

Do not introduce Railway as another database or an unreviewed duplicate business deployment.

## Alternative runtime option: Apply.Build

Apply.Build may be evaluated for an alternative runtime because it supports GitHub/Docker-style deployment and may be useful as a low-cost emergency or experimental runtime.

No alternative is approved for production cutover by this document.

## Cloudflare runtime note

Cloudflare remains strategically important for R2 object storage. Cloudflare Workers are useful for lightweight edge functions but are not the selected runtime for the full ALSVID application. Cloudflare Containers may be reconsidered later if its pricing and product maturity become a better fit.

## Development and Production

The existing cloud deploy target is `alsvid-production` (`europe-west1`); `alsvid-prod` remains a proposed, unverified migration target. Authorized local business deployment uses the existing Production Neon/R2/secret authority without starting another business database. CI uses disposable synthetic resources and must not access Production secrets. The former `alsvid-dev` Cloud Run Development/Test environment remains retired. See `docs/LOCAL_PRODUCTION.md` for current local acceptance limitations.

Current release path:

1. create a branch and pull request to `main`;
2. run exact-source CI, including PostgreSQL migrations, tests and container smoke checks;
3. review and merge;
4. deploy the verified main commit to Production.

Do not require cloud Development acceptance or synchronize `main` back to `develop`. Restore a shared cloud Development runtime only through a new reviewed architecture decision. This record does not prove live cloud resources have been deleted.

## Change rule

Do not replace or delete the existing Cloud Run public deployment just because the local runtime is now preferred for authorized operation. Public cutover requires tested TLS, access control, routing, resilience and monitoring; database/R2 authority must remain shared.


## Current environment scope (2026-10-14)

Historical decision only: Cloud Run was the sole intended Production runtime in October 2026. The updated local-first plus existing Cloud Run model above supersedes this scope. This repository note is not proof of any live resource deletion. See `docs/LOCAL_PRODUCTION.md`, `docs/ENVIRONMENT_ARCHITECTURE.md` and `docs/RELEASE_FLOW.md`.
