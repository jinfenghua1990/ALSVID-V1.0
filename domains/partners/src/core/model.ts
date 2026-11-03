export const PartnerRoles=['SUPPLIER','FACTORY','DEALER','CUSTOMER','SERVICE_PARTNER','LOGISTICS_PROVIDER'] as const;
export type PartnerRole=(typeof PartnerRoles)[number];
export type PartnerKind='ORGANIZATION'|'PERSON';
export interface PartnerIdentifierInput{scheme:string;value:string}
export interface PartnerContactInput{type:'EMAIL'|'PHONE'|'WEBSITE';purpose:'GENERAL'|'SALES'|'FINANCE'|'SERVICE'|'LOGISTICS';value:string;isPrimary?:boolean}
export interface PartnerAddressInput{purpose:'REGISTERED'|'BILLING'|'SHIPPING'|'WAREHOUSE'|'SERVICE';recipient?:string;line1:string;line2?:string;city:string;region?:string;postalCode?:string;countryCode:string}
export interface CreatePartnerInput{kind:PartnerKind;displayName:string;legalName?:string;countryCode?:string;roles?:PartnerRole[];identifiers?:PartnerIdentifierInput[];contacts?:PartnerContactInput[];addresses?:PartnerAddressInput[]}
export interface UpdatePartnerInput extends Partial<CreatePartnerInput>{status?:'ACTIVE'|'INACTIVE';expectedVersion:number}
export interface PartnerSummary{id:string;partnerCode:string;kind:PartnerKind;displayName:string;legalName:string|null;status:'ACTIVE'|'INACTIVE';countryCode:string|null;version:number;roles:PartnerRole[];createdAt:string;updatedAt:string}
export interface PartnerDetail extends PartnerSummary{identifiers:Array<{id:string;scheme:string;value:string}>;contacts:Array<{id:string;type:string;purpose:string;value:string;isPrimary:boolean}>;addresses:Array<{id:string;purpose:string;recipient:string|null;line1:string;line2:string|null;city:string;region:string|null;postalCode:string|null;countryCode:string}>}
export interface PartnerActor{userId:string;permissions:readonly string[]}
export const PartnerCapability={Read:'partner.read',Write:'partner.write',RoleManage:'partner.role.manage'} as const;
/** A factory is an independent FACTORY Partner linked to one or more suppliers. */
export interface PartnerFactoryLink{id:string;factoryId:string;factoryCode:string;displayName:string;countryCode:string|null;status:'ACTIVE'|'INACTIVE'}
