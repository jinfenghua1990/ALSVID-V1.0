export const CommerceCapability={Read:'commerce.read',Map:'commerce.map',Reconcile:'commerce.reconcile'} as const;
/** Providers allowed for new registrations; historic Shopify rows remain readable for audit. */
export type CommerceProvider='AMAZON'|'OTHER';
export interface NormalizedOrderLine{externalLineId:string;externalProductId?:string;externalVariantId?:string;externalSku?:string;title?:string;quantity:string|number;unitPrice:string|number;sourceUpdatedAt?:string}
export interface NormalizedOrder{externalOrderId:string;externalOrderName?:string;externalCustomerId?:string;orderStatus:string;financialStatus?:string;fulfillmentStatus?:string;currency:string;subtotalAmount:string|number;totalAmount:string|number;sourceCreatedAt?:string;sourceUpdatedAt?:string;lines:NormalizedOrderLine[]}
export interface NormalizedFulfillmentLine{externalLineId:string;quantity:string|number}
export interface NormalizedFulfillment{externalFulfillmentId:string;externalOrderId:string;status:string;trackingCompany?:string;trackingNumber?:string;sourceCreatedAt?:string;sourceUpdatedAt?:string;lines:NormalizedFulfillmentLine[]}
export interface CreateChannelInput{provider:CommerceProvider;channelKey:string;displayName:string;externalAccountId:string;defaultDealerPartnerId?:string;requiresDealer?:boolean;metadata?:Record<string,unknown>}
export interface VariantMappingInput{channelId:string;externalVariantId:string;externalProductId?:string;externalSku?:string;skuId:string}
export interface OrderPartnerMappingInput{dealerPartnerId?:string|null;customerPartnerId?:string|null}
