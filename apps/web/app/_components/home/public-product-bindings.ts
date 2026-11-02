/** Public projection contains only the exact model ID for fixed ALSVID homepage artwork.
 * The endpoint resolves ACTIVE BIKE models; it does NOT authorize checkout or claim publication.
 */
export type HomepageProductBindings = Record<'FC1_HERO'|'FC1_FEATURED'|'FC2_LAUNCH',string|null>;
export const emptyHomepageProductBindings:HomepageProductBindings={
 FC1_HERO:null,FC1_FEATURED:null,FC2_LAUNCH:null,
};

export async function homepageProductBindings():Promise<HomepageProductBindings>{
 const base=process.env.ALSVID_API_BASE_URL;
 if(!base)return {...emptyHomepageProductBindings};
 try{
  const response=await fetch(base+'/v1/product/public/homepage-bindings',{
   cache:'no-store',signal:AbortSignal.timeout(5000),
  });
  if(!response.ok)return {...emptyHomepageProductBindings};
  const payload:unknown=await response.json();
  if(!payload||typeof payload!=='object'||!('data' in payload)||!Array.isArray(payload.data))
   return {...emptyHomepageProductBindings};
  const values={...emptyHomepageProductBindings};
  const expected={FC1_HERO:'A1-ULTRA',FC1_FEATURED:'A1-ULTRA',FC2_LAUNCH:'L1-PRO'} as const;
  for(const record of payload.data){
   if(!record||typeof record!=='object')continue;
   const item=record as Record<string,unknown>;
   if(item.slot==='FC1_HERO'||item.slot==='FC1_FEATURED'||item.slot==='FC2_LAUNCH'){
    if(item.modelCode===expected[item.slot]&&typeof item.modelId==='string'&&
       /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(item.modelId))
      values[item.slot]=item.modelId;
   }
  }
  return values;
 }catch{return {...emptyHomepageProductBindings};}
}
