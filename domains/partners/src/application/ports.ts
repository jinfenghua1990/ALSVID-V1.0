import type { QueryExecutor } from '@alsvid/database';
import type { PartnerAddressInput,PartnerContactInput,PartnerDetail,PartnerFactoryLink,PartnerIdentifierInput,PartnerKind,PartnerRole,PartnerSummary } from '../core/model.js';
export interface PartnerAuditPort{record(input:{actorUserId:string;action:string;targetType:string;targetId:string;metadata?:Record<string,unknown>},executor?:QueryExecutor):Promise<void>}
export interface PartnerRepository{
 transaction<T>(work:(executor:QueryExecutor)=>Promise<T>):Promise<T>;
 list(search:string,role?:PartnerRole):Promise<PartnerSummary[]>;get(id:string,executor?:QueryExecutor):Promise<PartnerDetail|null>;
 createBase(input:{kind:PartnerKind;displayName:string;legalName:string|null;countryCode:string|null;actorUserId:string},executor:QueryExecutor):Promise<string>;
 updateBase(input:{id:string;expectedVersion:number;kind:PartnerKind|null;displayName:string|null;legalNameProvided:boolean;legalName:string|null;countryCodeProvided:boolean;countryCode:string|null;status:'ACTIVE'|'INACTIVE'|null;actorUserId:string},executor:QueryExecutor):Promise<boolean>;
 exists(id:string,executor:QueryExecutor):Promise<boolean>;
 replaceRoles(id:string,actorUserId:string,roles:PartnerRole[],executor:QueryExecutor):Promise<void>;
 replaceIdentifiers(id:string,items:PartnerIdentifierInput[],executor:QueryExecutor):Promise<void>;
 replaceContacts(id:string,items:PartnerContactInput[],executor:QueryExecutor):Promise<void>;
 replaceAddresses(id:string,items:PartnerAddressInput[],executor:QueryExecutor):Promise<void>;
 partnerHasRole(id:string,role:PartnerRole,executor?:QueryExecutor):Promise<boolean>;
 listFactories(supplierPartnerId:string):Promise<PartnerFactoryLink[]>;
 replaceFactories(supplierPartnerId:string,actorUserId:string,factoryIds:string[],executor:QueryExecutor):Promise<void>;
}
