import {createClient} from 'https://esm.sh/@supabase/supabase-js@2';
export async function edgeGuard(req:Request,mode:'shop'|'platform'|'service'='shop'){
 const deny=(status:number)=>new Response(JSON.stringify({error:'Acesso não autorizado'}),{status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
 const bearer=req.headers.get('Authorization')||'';const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 if(bearer===`Bearer ${key}`)return {service:true,owner:null,user:null};
 if(mode==='service')return deny(403);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,key);
 const{data,error}=await db.auth.getUser(bearer.replace(/^Bearer /,''));if(error||!data.user)return deny(401);
 const{data:profile}=await db.from('profiles').select('id,role,active,owner_id,professional_id,sessions_revoked_at').eq('id',data.user.id).maybeSingle();if(!profile?.active)return deny(403);
 if(profile.sessions_revoked_at){
  let session:string|null=null;try{const encoded=bearer.replace(/^Bearer /,'').split('.')[1].replace(/-/g,'+').replace(/_/g,'/');session=JSON.parse(atob(encoded)).session_id||null;}catch{return deny(401);}
  const{data:valid,error:sessionError}=await db.rpc('admin_staff_session_valid',{p_user:data.user.id,p_session:session});if(sessionError||!valid)return deny(401);
 }
 if(mode==='platform'){
  const{data:admin}=await db.from('platform_admins').select('user_id').eq('user_id',data.user.id).maybeSingle();
  return admin?{service:false,owner:data.user.id,user:data.user.id}:deny(403);
 }
 const owner=profile.role==='profissional'?profile.owner_id:profile.id;
 const{data:tenant}=await db.from('tenants').select('owner_id').eq('owner_id',owner).eq('status','active').maybeSingle();if(!tenant)return deny(403);
 const{data:billingAllowed,error:billingError}=await db.rpc('billing_access_allowed',{p_owner:owner});if(billingError||billingAllowed!==true)return deny(403);
 if(profile.role==='profissional'){
  const{data:pro}=await db.from('professionals').select('id').eq('id',profile.professional_id).eq('user_id',owner).eq('active',true).maybeSingle();if(!pro)return deny(403);
 }else if(!['admin','barbearia'].includes(profile.role))return deny(403);
 if(/\/(staff-whatsapp|whatsapp-provision)\/?$/.test(new URL(req.url).pathname)){const{data:tier,error:tierError}=await db.rpc('tenant_effective_tier',{p_owner:owner});if(tierError||tier!=='premium')return deny(403);}
 const body=await req.clone().json().catch(()=>({}));
 if(body.user_id&&body.user_id!==owner)return deny(403);
 if(Array.isArray(body.customer_ids)&&body.customer_ids.length){
  if(body.customer_ids.length>1000)return deny(400);
  const ids=[...new Set(body.customer_ids)];const{data:customers,error}=await db.from('customers').select('id').eq('user_id',owner).in('id',ids);
  if(error||customers?.length!==ids.length)return deny(403);
 }
 return{service:false,owner,user:data.user.id};
}
