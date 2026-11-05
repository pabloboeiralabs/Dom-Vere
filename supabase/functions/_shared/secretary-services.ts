const clean=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/sombrancelha/g,'sobrancelha');
export function requestedServicePair(text:string,services:{id:string;name:string}[]){
 const t=clean(text);
 if(!/\bbarba\b/.test(t)||!/sobrancelha/.test(t)||/\b(so|apenas|somente)\b/.test(t))return null;
 if(!/lamina|pinca/.test(t))return {needsVariant:true,ids:[]};
 const beard=services.find(s=>clean(s.name)==='barba');
 const brow=services.find(s=>clean(s.name).includes('sobrancelha')&&!/cabelo|barba/.test(clean(s.name))&&clean(s.name).includes(/lamina/.test(t)?'lamina':'pinca'));
 return beard&&brow?{needsVariant:false,ids:[beard.id,brow.id]}:null;
}
export function bookingServiceIds(args:{service_ids?:unknown;service_id?:unknown},selected:string[]=[]){
 const explicit:string[]=Array.isArray(args.service_ids)&&args.service_ids.length?args.service_ids.filter((id):id is string=>typeof id==='string'):typeof args.service_id==='string'?[args.service_id]:[];
 return [...new Set(explicit.length>1?explicit:selected.length>1&&(!explicit.length||selected.includes(explicit[0]))?selected:explicit)];
}
