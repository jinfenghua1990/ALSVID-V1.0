import { ForbiddenError } from '@alsvid/kernel';
import { postgresErrorCode } from '@alsvid/database';
import { PartnerCapability,type CreatePartnerInput,type PartnerActor,type PartnerDetail,type PartnerFactoryLink,type PartnerRole,type PartnerSummary,type UpdatePartnerInput } from '../core/model.js';
import { PartnerConflictError,PartnerNotFoundError,PartnerValidationError } from '../core/errors.js';
import { assertUniqueRoles,normalizePartnerCountry } from '../core/normalization.js';
import type { PartnerAuditPort,PartnerRepository } from './ports.js';

export class PartnerService{
 constructor(private readonly repository:PartnerRepository,private readonly audit:PartnerAuditPort){}
 async list(actor:PartnerActor,query='',role?:PartnerRole):Promise<PartnerSummary[]>{requireCapability(actor,PartnerCapability.Read);return this.repository.list(query.trim().toLowerCase(),role);}
 async get(actor:PartnerActor,id:string):Promise<PartnerDetail>{requireCapability(actor,PartnerCapability.Read);const row=await this.repository.get(id);if(!row)throw new PartnerNotFoundError('Partner not found');return row;}
 async create(actor:PartnerActor,input:CreatePartnerInput):Promise<PartnerDetail>{requireCapability(actor,PartnerCapability.Write);if(input.roles?.length)requireCapability(actor,PartnerCapability.RoleManage);const displayName=input.displayName.trim();if(displayName.length<2)throw new PartnerValidationError('displayName is required');if(!['ORGANIZATION','PERSON'].includes(input.kind))throw new PartnerValidationError('Invalid Partner kind');if(input.roles)assertUniqueRoles(input.roles);
  try{const id=await this.repository.transaction(async(executor)=>{const partnerId=await this.repository.createBase({kind:input.kind,displayName,legalName:input.legalName?.trim()||null,countryCode:normalizePartnerCountry(input.countryCode),actorUserId:actor.userId},executor);if(input.roles)await this.repository.replaceRoles(partnerId,actor.userId,input.roles,executor);if(input.identifiers)await this.repository.replaceIdentifiers(partnerId,input.identifiers,executor);if(input.contacts)await this.repository.replaceContacts(partnerId,input.contacts,executor);if(input.addresses)await this.repository.replaceAddresses(partnerId,input.addresses,executor);await this.audit.record({actorUserId:actor.userId,action:'partner.created',targetType:'partner',targetId:partnerId,metadata:{roles:input.roles??[]}},executor);return partnerId;});return await this.requireDetail(id);}catch(error){if(postgresErrorCode(error)==='23505')throw new PartnerConflictError('A Partner identifier is already in use');throw error;}}
 async update(actor:PartnerActor,id:string,input:UpdatePartnerInput):Promise<PartnerDetail>{requireCapability(actor,PartnerCapability.Write);if(input.roles)requireCapability(actor,PartnerCapability.RoleManage);if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<1)throw new PartnerValidationError('expectedVersion is required');if(input.roles)assertUniqueRoles(input.roles);
  try{await this.repository.transaction(async(executor)=>{const updated=await this.repository.updateBase({id,expectedVersion:input.expectedVersion,kind:input.kind??null,displayName:input.displayName?.trim()||null,legalNameProvided:input.legalName!==undefined,legalName:input.legalName?.trim()||null,countryCodeProvided:input.countryCode!==undefined,countryCode:normalizePartnerCountry(input.countryCode),status:input.status??null,actorUserId:actor.userId},executor);if(!updated){if(!await this.repository.exists(id,executor))throw new PartnerNotFoundError('Partner not found');throw new PartnerConflictError('Partner changed since it was loaded; refresh and retry');}if(input.roles)await this.repository.replaceRoles(id,actor.userId,input.roles,executor);if(input.identifiers)await this.repository.replaceIdentifiers(id,input.identifiers,executor);if(input.contacts)await this.repository.replaceContacts(id,input.contacts,executor);if(input.addresses)await this.repository.replaceAddresses(id,input.addresses,executor);await this.audit.record({actorUserId:actor.userId,action:'partner.updated',targetType:'partner',targetId:id,metadata:{fields:Object.keys(input).filter(key=>key!=='expectedVersion')}},executor);});return await this.requireDetail(id);}catch(error){if(postgresErrorCode(error)==='23505')throw new PartnerConflictError('A Partner identifier is already in use');throw error;}}
 async listFactories(actor:PartnerActor,supplierPartnerId:string):Promise<PartnerFactoryLink[]>{
  requireCapability(actor,PartnerCapability.Read);
  if(!await this.repository.get(supplierPartnerId))throw new PartnerNotFoundError('Partner not found');
  return this.repository.listFactories(supplierPartnerId);
 }
 async replaceFactories(actor:PartnerActor,supplierPartnerId:string,factoryIds:string[]):Promise<PartnerFactoryLink[]>{
  requireCapability(actor,PartnerCapability.Write);
  if(!Array.isArray(factoryIds))throw new PartnerValidationError('factoryIds must be an array');
  const unique=[...new Set(factoryIds.map(id=>String(id).trim()).filter(Boolean))];
  if(unique.includes(supplierPartnerId))throw new PartnerValidationError('A supplier cannot be linked to itself as a factory');
  if(!await this.repository.partnerHasRole(supplierPartnerId,'SUPPLIER'))throw new PartnerValidationError('Target Partner does not hold the SUPPLIER role');
  for(const factoryId of unique){
    if(!await this.repository.partnerHasRole(factoryId,'FACTORY'))throw new PartnerValidationError('Partner '+factoryId+' does not hold the FACTORY role');
  }
  await this.repository.transaction(async(executor)=>{
    await this.repository.replaceFactories(supplierPartnerId,actor.userId,unique,executor);
    await this.audit.record({actorUserId:actor.userId,action:'partner.factories_replaced',targetType:'partner',targetId:supplierPartnerId,metadata:{factoryIds:unique}},executor);
  });
  return this.repository.listFactories(supplierPartnerId);
 }
 private async requireDetail(id:string){const row=await this.repository.get(id);if(!row)throw new PartnerNotFoundError('Partner not found');return row;}
}
function requireCapability(actor:PartnerActor,capability:string){if(!actor.permissions.includes(capability))throw new ForbiddenError('PARTNER_FORBIDDEN',`Missing permission: ${capability}`);}
