# ALSVID External System Boundaries

Status: current architecture decision

## Purpose

ALSVID is the bicycle-business internal/after-sales/vehicle-lifecycle system. It is not a general OMS, WMS, storefront, payment processor or carrier platform.

The guiding rule is:

> External systems execute commerce, order orchestration, warehouse work and transport. ALSVID keeps only the confirmed facts needed to understand and service the bicycle, customer, dealer and after-sales lifecycle.

## Shopify

Shopify remains the external B2C commerce/OMS authority.

Shopify owns the complete commerce record for its channel, including cart/checkout, payment, discount/tax calculations, customer commerce account, order lifecycle, refund/return and normal B2C fulfillment orchestration.

ALSVID may import or query selected confirmed facts that are needed for Vehicle/Customer/Dealer/Service context, for example:

- external order ID and source;
- customer mapping;
- SKU / variant reference;
- purchase and delivery dates;
- confirmed payment/transaction state where needed for service eligibility;
- fulfillment/shipment status;
- warehouse or fulfillment reference;
- carrier and tracking number;
- VIN association;
- warranty-start evidence.

ALSVID must not copy the whole Shopify order database merely for convenience and must not recreate general OMS behavior such as order routing, split-order logic, ATP, inventory allocation, multi-channel orchestration or payment calculation.

Full external order detail remains queryable from Shopify through its official APIs when needed.

## Future OMS

If ALSVID later needs a dedicated third-party OMS because channel/order complexity grows, that OMS remains external.

ALSVID integrates through a connector and receives only the confirmed facts it needs. The existence of a future OMS must not require replacing Vehicle, Warranty, ServiceCase, Partner or other ALSVID authorities.

## WMS / 3PL

WMS / 3PL remains the warehouse-execution authority. It owns warehouse-specific execution such as location/bin work, picking, packing, label creation, warehouse dispatch and stocktake execution.

Normal B2C fulfillment may use the WMS provider's standard Shopify integration directly:

```text
Shopify -> WMS / 3PL -> carrier
              |
              +--> confirmed fulfillment/tracking facts -> ALSVID
```

ALSVID does not force itself into the middle of a mature Shopify-to-WMS flow.

### After-sales replacement exception

ALSVID may directly issue a narrowly scoped after-sales replacement/repair-parts fulfillment request to a WMS when the WMS supports an API or other approved connector.

Example:

```text
ServiceCase -> warranty decision -> replacement part approved
            -> WMS fulfillment request -> shipment/tracking
            -> confirmed result stored on the ServiceCase / Vehicle timeline
```

This is an after-sales execution request, not general OMS authority.

If a WMS can only receive work through Shopify, ALSVID may create the appropriate external commerce/fulfillment record through the Shopify integration instead of duplicating WMS logic.

## Paid versus free after-sales parts

- Free warranty replacement: decision and audit trail are ALSVID-owned; fulfillment may be sent to WMS.
- Paid replacement/service part: ALSVID owns the service decision, while payment/order creation should go through Shopify or a future approved commerce/OMS system.
- Original-order refund/return/exchange: commerce/OMS system owns the transaction workflow; ALSVID stores only the resulting Vehicle/service facts and external references it needs.

## QR / customer / dealer views

Vehicle QR and My ALSVID / Dealer experiences may display selected external commercial and logistics facts associated with the authenticated user's own Vehicle or permitted inventory, such as:

- purchase source and external order number;
- purchase/delivery date;
- shipment state;
- carrier and tracking number;
- warranty state;
- after-sales cases and replacement shipments.

Displaying these facts does not make ALSVID the order-management authority.

## Connector rule

External integrations use explicit adapters/connectors rather than leaking provider-specific identifiers or business logic into core domains.

Expected connector families include:

- Shopify connector;
- future OMS connector;
- WMS / 3PL connector;
- logistics/carrier connector;
- payment/tax providers where later required.

External IDs are mappings only. Canonical ALSVID IDs remain authoritative inside ALSVID.
