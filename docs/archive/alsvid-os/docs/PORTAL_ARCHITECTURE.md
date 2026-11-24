# ALSVID Portal Architecture

Status: durable standalone entrance and authorization direction.

ALSVID is one independent application/domain authority with multiple experiences. Internal Admin, Dealer Portal, My ALSVID and public/service flows must not create duplicate Product, Partner, Vehicle, Warranty or ServiceCase masters.

## 1. Entrances

Target entrances:

- `admin.alsvid.com` — internal administration
- `dealer.alsvid.com` — dealer operations
- `my.alsvid.com` — buyer/customer experience when adopted
- `service.alsvid.com` — narrow public/service flows when a separate domain is operationally useful
- `alsvid.com` — Shopify/public brand storefront boundary

Domain separation is an experience/deployment concern, not a reason to duplicate databases or business authorities.

## 2. Internal Admin

Primary audience: owner/admin and future ALSVID staff by role/scope.

First-level navigation:
- 工作台
- 产品中心
- 供应链中心
- 经销商中心
- 客户中心
- 车辆中心
- 售后中心
- 财务中心

Internal Admin may aggregate authorized information across domains but remains subject to backend permissions.

## 3. Dealer Portal

First-level navigation target:
- 工作台
- 我的车辆
- 车辆交付
- 售后服务
- 产品与配件
- 账户

Dealer Portal focuses on that dealer's legitimate responsibilities:
- allocated/in-transit Vehicles;
- received/in-stock custody;
- PDI and delivery preparation;
- pending handover;
- sold Vehicles associated with that dealer;
- buyer handover/binding actions explicitly permitted to the dealer;
- authorized service cases;
- approved product/service documents;
- separately authorized dealer commercial facts.

Dealer A must never see Dealer B's Vehicles, customers, service records or commercial facts merely by guessing a frame number, URL or internal ID.

Dealer receipt/PDI/handover always operates on an existing canonical Vehicle.

## 4. My ALSVID

Initial form: mobile-first web/PWA.

First-level navigation target:
- 车库
- 服务
- 配件
- 我的

Target capabilities:
- multiple ALSVID Vehicles per buyer;
- My Garage cards;
- vehicle model/photo/color;
- appropriately displayed frame number;
- registration/authenticity status;
- purchase/dealer references where suitable;
- warranty;
- manuals and vehicle-specific documents;
- compatible parts/accessories;
- customer-safe service history;
- open service/warranty cases;
- dealer/service contact;
- later ownership transfer;
- communication/marketing preference controls.

Claim/activation must resolve an existing Vehicle. It must not create another Vehicle or another buyer simply to satisfy account creation.

## 5. Public/service flows

A person may need activation, authenticity verification or service intake before having a signed-in My ALSVID account. Public routes therefore use purpose-built minimal contracts.

Candidate flows:
- vehicle activation/claim start;
- minimal authenticity/frame-number validation;
- warranty eligibility/start lookup with escalation when needed;
- service intake;
- service-status lookup using secure references;
- ownership-transfer verification;
- recall/safety lookup.

Public service is never a public Vehicle database.

Without sufficient authorization, public flows must not expose:
- owner identity/contact/address;
- purchase price;
- dealer confidential/commercial information;
- full repair/service history;
- internal diagnosis/notes;
- private assets/documents;
- internal database identifiers.

## 6. Authorization

UI visibility is not authorization.

Every protected request must validate scope server-side using canonical relationships and authenticated identity. Browser-supplied labels or object IDs alone are never authority.

Rules:
- internal admin APIs do not become public because a UI can call them;
- dealer resources are dealer-scoped on every read/write;
- buyer resources are ownership/account-scoped on every read/write;
- public APIs return purpose-built minimal projections;
- predictable frame numbers/URLs do not grant access.

## 7. Same Vehicle, different views

```text
Vehicle ALS-FC1-000128

Internal Admin
-> authorized Vehicle 360

Dealer A
-> custody/PDI/handover/service subset when authorized

My ALSVID owner
-> garage/warranty/customer-safe service subset

Public/service
-> minimal activation/verification/intake facts only
```

No entrance owns a second Vehicle.

## 8. Admin preview

Future internal support may provide explicit “预览经销商端” or “预览 My ALSVID”. Preview is a presentation/debugging feature, not silent impersonation.

Guardrails:
- explicit enter/exit;
- obvious preview indicator;
- preserve the administrator identity and audit trail;
- read-only by default unless a later action is separately authorized;
- reuse external presentation contracts where practical;
- never weaken backend scope enforcement.

## 9. QR and claim routing

```text
opaque/random QR token
    -> narrow public activation/lookup endpoint
    -> minimal verification
    -> identity/claim verification
    -> existing Vehicle
    -> My ALSVID / dealer flow as authorized
```

Do not expose internal PKs in QR codes. QR reissue does not change Vehicle identity. Token issuance/claim/revocation/reissue should be auditable.

Battery regulatory QR remains distinct from Vehicle QR.

## 10. Data-scope intent

| Capability | Admin | Dealer | My ALSVID | Public/service |
|---|---|---|---|---|
| Product/docs | authorized full | approved view | customer/public view | limited |
| Dealers | authorized | own profile/context | relevant contact only | published contact only |
| Customers | authorized | minimum required for handover/service | own profile | no |
| Vehicles | authorized fleet | own authorized set | own authorized set | minimal verification only |
| Vehicle 360 | authorized full | scoped subset | customer-safe subset | no |
| Warranty | authorized | scoped | own Vehicles | minimal eligibility |
| Service | authorized | assigned/authorized cases | customer-safe own history | intake/status reference only |
| Finance | role-scoped | only explicitly designed dealer facts | no internal finance | no |
| Marketing consent | authorized role | no general access | own controls | capture only when appropriate |
| Ownership transfer | authorized/support | assisted only if designed | verified owner flow | verification entry only |
| Recall | campaign view | affected dealer set | affected own Vehicles | minimal lookup |

## 11. Deployment independence

These portals may be deployed separately later, but they remain parts of the ALSVID application boundary. Do not reintroduce ChaiBen Workspace switching, ChaiBen identity headers or a second business-rule engine merely because domains are separate.
