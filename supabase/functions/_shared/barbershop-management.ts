import type {Database} from './database-schema.ts';
import type {DatabaseClient} from './database-client.ts';
import {manageShopMp} from './shop-mp-admin.ts';
import {adminUserInput,adminAccessInput,safeRecoveryLink,uuid} from './admin-management-validation.ts';
const temporaryPassword=()=> 'Zl!'+crypto.randomUUID().replaceAll('-','').slice(0,21);
const check=(error:any)=>{if(error)throw Error(error.message||'Não foi possível salvar.');};
async function rpc<N extends keyof Database['public']['Functions']>(db:DatabaseClient,name:N,args:Database['public']['Functions'][N]['Args']):Promise<Database['public']['Functions'][N]['Returns']>{const {data,error}=await db.rpc(name,args);check(error);return data as Database['public']['Functions'][N]['Returns'];}
const audit=async(db:DatabaseClient,tenant:string,actor:string,action:string,subject?:string,details={})=>{const {error}=await db.from('tenant_admin_events').insert({tenant_id:tenant,actor_id:actor,subject_id:subject||null,action,details});check(error);};
export async function manageBarbershop(db:DatabaseClient,actor:string|null,body:any){
 if(!actor||!uuid(body.id))throw Error('Barbearia inválida ou acesso não autorizado.');
 const owner=await rpc(db,'admin_assert_tenant',{p_tenant:body.id,p_actor:actor});
 const {data:tenant,error:tenantError}=await db.from('tenants').select('id,owner_id,name,slug,status,primary_color,logo_url,created_at,contact_name,contact_email,contact_phone').eq('id',body.id).single();check(tenantError);if(!tenant)throw Error('Barbearia não encontrada.');
 if(['admin_mp_status','admin_mp_save'].includes(body.action))return manageShopMp(db,actor,tenant,body);
 if(body.action==='admin_details'){
  const results=await Promise.all([
   rpc(db,'admin_tenant_users',{p_tenant:body.id,p_actor:actor}),
   db.from('tenant_admin_controls').select('*').eq('tenant_id',body.id).maybeSingle(),
   db.from('professionals').select('id,name,phone,active').eq('user_id',owner).order('name'),
   db.from('customers').select('id',{count:'exact',head:true}).eq('user_id',owner),
   db.from('appointments').select('id',{count:'exact',head:true}).eq('user_id',owner).in('status',['agendado','confirmado']),
   db.from('settings').select('shop_name,clinic_address,bot_enabled,bot_mode,secretary_name').eq('user_id',owner).maybeSingle(),
   db.from('tenant_admin_events').select('id,action,subject_id,details,created_at,actor_id').eq('tenant_id',body.id).order('created_at',{ascending:false}).limit(50),
   db.from('tenant_provision_jobs').select('state,last_error,finished_at').eq('tenant_id',body.id).maybeSingle(),
   rpc(db,'tenant_effective_tier',{p_owner:owner}),rpc(db,'billing_access_allowed',{p_owner:owner}),
   db.from('whatsapp_config').select('user_id').eq('user_id',owner).maybeSingle()
  ]);
  for(const r of results)if(r&&typeof r==='object'&&'error' in r)check(r.error);
  const actors=[...new Set((results[6].data||[]).map((r)=>r.actor_id))];
  const {data:actorRows}=actors.length?await db.from('profiles').select('id,name').in('id',actors):{data:[]};
  return{tenant,users:results[0],controls:results[1].data||{},professionals:results[2].data||[],counts:{customers:results[3].count||0,appointments:results[4].count||0},settings:results[5].data||{},history:(results[6].data||[]).map((e)=>({...e,actor_name:actorRows?.find((a:any)=>a.id===e.actor_id)?.name||'Administrador'})),provision:results[7].data,tier:results[8],access_allowed:results[9],whatsapp_configured:!!results[10].data};
 }
 if(body.action==='admin_save_shop'){
  const address=String(body.address||''),notes=String(body.internal_notes||'');
  await rpc(db,'admin_save_tenant_shop',{p_tenant:body.id,p_actor:actor,p_name:body.name,p_color:body.primary_color,p_logo:body.logo_url||'',p_address:address,p_notes:notes});return{ok:true};
 }
 if(body.action==='admin_save_access'){
  const a=adminAccessInput(body);await rpc(db,'admin_save_tenant_access',{p_tenant:body.id,p_actor:actor,p_tier:a.tier,p_expires:a.expires,p_temporary:a.temporary,p_reason:a.reason});return{ok:true};
 }
 if(body.action==='admin_rebuild_apps'){
  const {error}=await db.from('tenant_provision_jobs').upsert({tenant_id:body.id,state:'pending',last_error:null},{onConflict:'tenant_id'});check(error);await audit(db,body.id,actor,'apps.rebuild');return{ok:true};
 }
 if(body.action==='admin_bot_settings'){
  if(typeof body.enabled!=='boolean'||!['ai','menu'].includes(body.mode)||typeof body.secretary_name!=='string'||!body.secretary_name.trim()||body.secretary_name.length>40)throw Error('Confira o estado, modo e nome da secretária.');
  if(body.enabled&&(await rpc(db,'tenant_effective_tier',{p_owner:owner}))!=='premium')throw Error('O WhatsApp exige o plano Premium.');
  const {error}=await db.from('settings').update({bot_enabled:body.enabled,bot_mode:body.mode,secretary_name:body.secretary_name.trim()}).eq('user_id',owner);check(error);await audit(db,body.id,actor,'bot.updated',undefined,{enabled:body.enabled,mode:body.mode});return{ok:true};
 }
 if(body.action==='admin_connection'){
  const {data:config,error}=await db.from('whatsapp_config').select('api_url,instance_token').eq('user_id',owner).maybeSingle();check(error);if(!config)return{configured:false,connected:false};
  const url=new URL(config.api_url);if(url.origin!=='https://evolution.zlabs.com.br'||!(['','/'].includes(url.pathname)||(tenant.slug==='domvere'&&url.pathname==='/domvere-v2')))throw Error('Consulta de conexão indisponível para este provedor.');
  const response=await fetch(url.origin+'/instance/status',{headers:{apikey:config.instance_token.split(':').pop(),token:config.instance_token,'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Não foi possível consultar a conexão.');const result=await response.json();return{configured:true,connected:result?.data?.Connected===true&&result?.data?.LoggedIn===true};
 }
 if(body.action==='admin_user_create'){
  const values=adminUserInput(body);if(body.professional_id&&!uuid(body.professional_id))throw Error('Profissional inválido.');
  if(body.professional_id){const{data}=await db.from('professionals').select('id').eq('id',body.professional_id).eq('user_id',owner).maybeSingle();if(!data)throw Error('O profissional não pertence a esta barbearia.');}
  const password=temporaryPassword();const{data:created,error}=await db.auth.admin.createUser({email:values.email,password,email_confirm:true,user_metadata:{name:values.name}});if(error||!created.user)throw Error('Não foi possível criar o acesso. Confira se o e-mail já está em uso.');
  try{await rpc(db,'admin_link_tenant_user',{p_tenant:body.id,p_actor:actor,p_user:created.user.id,p_professional:body.professional_id||null,p_name:values.name,p_email:values.email,p_phone:values.phone});}
  catch(error){await db.auth.admin.deleteUser(created.user.id);throw error;}
  return{ok:true,temporary_password:password,email:values.email};
 }
 if(!uuid(body.user_id))throw Error('Selecione um usuário válido.');
 await rpc(db,'admin_assert_tenant_user',{p_owner:owner,p_user:body.user_id});
 const {data:user,error:userError}=await db.from('profiles').select('id,name,email,phone,active,must_change_password,professional_id').eq('id',body.user_id).single();check(userError);if(!user)throw Error('Usuário não encontrado nesta barbearia.');
 if(body.action==='admin_user_save'){
  const values=adminUserInput(body);if(typeof body.active!=='boolean'||typeof body.must_change_password!=='boolean')throw Error('Estado do acesso inválido.');
  const changed=values.email!==user.email;
  if(changed){const{error}=await db.auth.admin.updateUserById(user.id,{email:values.email,email_confirm:true});if(error)throw Error('Não foi possível alterar o e-mail. Confira se já está em uso.');}
  try{await rpc(db,'admin_save_tenant_user',{p_tenant:body.id,p_user:user.id,p_actor:actor,p_name:values.name,p_email:values.email,p_phone:values.phone,p_active:body.active,p_require_password:body.must_change_password,p_revoke:changed});}
  catch(error){if(changed)await db.auth.admin.updateUserById(user.id,{email:user.email,email_confirm:true});throw error;}
  return{ok:true};
 }
 if(body.action==='admin_user_reset_password'){
  const password=temporaryPassword();const{error}=await db.auth.admin.updateUserById(user.id,{password});check(error);
  await rpc(db,'admin_revoke_staff_sessions',{p_tenant:body.id,p_user:user.id,p_actor:actor,p_force_password:true});
  return{ok:true,email:user.email,temporary_password:password};
 }
 if(body.action==='admin_user_sessions'){
  await rpc(db,'admin_revoke_staff_sessions',{p_tenant:body.id,p_user:user.id,p_actor:actor,p_force_password:false});return{ok:true};
 }
 if(body.action==='admin_user_recovery_link'){
  if(user.email.endsWith('@barber.local'))throw Error('Este acesso usa nome de usuário. Gere uma senha temporária para ele.');
  const base=tenant.slug==='domvere'?'':'/t/'+tenant.slug;
  const{data,error}=await db.auth.admin.generateLink({type:'recovery',email:user.email,options:{redirectTo:'https://domvere.zlabs.com.br'+base+'/reset-password'}});check(error);
  const url=safeRecoveryLink(data?.properties?.action_link||'');await audit(db,body.id,actor,'user.recovery_link',user.id);return{ok:true,recovery_url:url};
 }
 if(body.action==='admin_user_delete'){
  if(user.id===owner)throw Error('O administrador principal só pode ser removido pela exclusão da barbearia.');
  if(body.confirm_name!==user.name)throw Error('Confirme o nome exato do profissional.');
  await rpc(db,'admin_revoke_staff_sessions',{p_tenant:body.id,p_user:user.id,p_actor:actor,p_force_password:false});
  const{error}=await db.auth.admin.deleteUser(user.id);check(error);await audit(db,body.id,actor,'user.deleted',user.id);return{ok:true};
 }
 throw Error('Ação administrativa inválida.');
}
