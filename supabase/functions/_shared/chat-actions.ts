import type {ChatActionContext,ChatSendPayload} from './chat-action-types.ts';
import type {Json,Database} from './database-schema.ts';
import type {DatabaseClient} from './database-client.ts';
import {shopLinks} from "./tenant-links.ts";
declare const EdgeRuntime: { waitUntil: (task: Promise<unknown>) => void };
export async function shopStaff(db:DatabaseClient,owner:string){
 const{data:professionals,error}=await db.from('professionals').select('id').eq('user_id',owner).eq('active',true);if(error)throw error;
 const ids=(professionals||[]).map((p)=>p.id);if(!ids.length)return[];
 const{data,error:profileError}=await db.from('profiles').select('id,name').in('professional_id',ids).eq('role','profissional').eq('active',true);if(profileError)throw profileError;return data||[];
}
export function publicStorageUrl(url:string) {
 if(!url)return url; const parsed=new URL(url);
 const base=Deno.env.get('API_EXTERNAL_URL')||Deno.env.get('SUPABASE_PUBLIC_URL')||'https://domvere-api.zlabs.com.br';
 return new URL(parsed.pathname+parsed.search,base).toString();
}
// Shared, shop-scoped operations. All provider paths and fields are allowlisted here.
export async function handleChatAction({db,owner,staff,body,provider}:ChatActionContext) {
 if(typeof body.chat!=='string'||!/^\d+@s\.whatsapp\.net$/.test(body.chat))throw Error('Conversa inválida.');
 const chat=body.chat, number=chat?.split('@')[0];
 const check=(error:unknown)=>{if(error)throw new Error('Não foi possível salvar a alteração.');};
 const pref=()=>db.from('whatsapp_chat_preferences').select('*').eq('user_id',owner).eq('staff_id',staff).eq('wa_chatid',chat).maybeSingle();
 const message=async()=>{if(!body.message_id)throw Error('Selecione uma mensagem.');const{data,error}=await db.from('whatsapp_messages').select('*').eq('user_id',owner).eq('wa_chatid',chat).eq('id',body.message_id).maybeSingle();if(error||!data)throw new Error('Mensagem não encontrada.');return data;};
 if(body.action==='preferences'){
  const allowed=['archived','pinned','muted','unread_override','draft','labels'] as const;
  const updates:Database['public']['Tables']['whatsapp_chat_preferences']['Insert']={user_id:owner,staff_id:staff,wa_chatid:chat};
  const values=body.values||{};
  for(const key of allowed)if(key in values){const value=values[key];
   if(key==='draft'){if(typeof value!=='string'||value.length>4000)throw Error('Rascunho inválido.');updates.draft=value;}
   else if(key==='labels'){if(!Array.isArray(value)||value.length>20||value.some(v=>typeof v!=='string'||v.length>80))throw Error('Etiquetas inválidas.');updates.labels=value.filter((v):v is string=>typeof v==='string');}
   else{if(typeof value!=='boolean')throw Error('Preferência inválida.');updates[key]=value;}
  }
  const{error}=await db.from('whatsapp_chat_preferences').upsert(updates);check(error);return{ok:true};
 }
 if(body.action==='read'){
  const{error}=await db.from('whatsapp_chat_preferences').upsert({user_id:owner,staff_id:staff,wa_chatid:chat,last_read_at:new Date().toISOString(),unread_override:false});check(error);
  const{data}=await db.from('whatsapp_messages').select('wa_message_id').eq('user_id',owner).eq('wa_chatid',chat).eq('from_me',false).order('wa_timestamp',{ascending:false}).limit(100);
  const ids=(data||[]).map((m)=>m.wa_message_id).filter(Boolean);if(ids.length){const notify=provider(db,owner,'/message/markread',{number,id:ids}).catch(()=>{});if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(notify);else await notify;}return{ok:true};
 }
 if(body.action==='presence'){
  if(!['composing','paused','recording'].includes(body.state||''))throw new Error('Presença inválida.');
  await provider(db,owner,'/message/presence',{number,state:body.state==='recording'?'composing':body.state,isAudio:body.state==='recording'});return{ok:true};
 }
 if(body.action==='chat_bot'){
  if(typeof body.enabled!=='boolean')throw new Error('Estado inválido.');
  const{error}=await db.from('crm_leads').update({bot_paused:!body.enabled,manual_started_at:body.enabled?null:new Date().toISOString(),manual_finished_at:null,assigned_staff_id:null}).eq('user_id',owner).eq('wa_chatid',chat);check(error);return{ok:true,enabled:body.enabled};
 }
 if(body.action==='assign')throw new Error('O atendimento é compartilhado com a equipe.');
 if(body.action==='finish'){
  const{error}=await db.from('crm_leads').update({assigned_staff_id:null,manual_finished_at:new Date().toISOString(),bot_paused:body.resume_bot!==true,manual_started_at:body.resume_bot===true?null:new Date().toISOString()}).eq('user_id',owner).eq('wa_chatid',chat);check(error);return{ok:true};
 }
 if(body.action==='note'){
  if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)throw new Error('Nota inválida.');const{error}=await db.from('whatsapp_internal_notes').insert({user_id:owner,staff_id:staff,wa_chatid:chat,text:body.text.trim()});check(error);return{ok:true};
 }
 if(body.action==='details'){
  const[notes,preferences,lead,staffRows,tools,responses,services]=await Promise.all([db.from('whatsapp_internal_notes').select('*').eq('user_id',owner).eq('wa_chatid',chat).order('created_at',{ascending:false}).limit(50),pref(),db.from('crm_leads').select('assigned_staff_id,bot_paused,manual_started_at,manual_finished_at,presence_state,presence_updated_at').eq('user_id',owner).eq('wa_chatid',chat).maybeSingle(),shopStaff(db,owner).then((data)=>({data})),db.from('whatsapp_shop_tools').select('*').eq('user_id',owner).maybeSingle(),db.from('bot_trigger_responses').select('trigger_word,response_text').eq('user_id',owner),db.from('services').select('name,price').eq('user_id',owner).eq('active',true)]);return{booking_url:(await shopLinks(db,owner)).booking,responses:responses.data||[],services:services.data||[],notes:notes.data||[],preferences:preferences.data||{},lead:lead.data,staff:[{id:owner,name:'Administrador'},...(staffRows.data||[])],tools:tools.data||{quick_replies:[],labels:[]}};
 }
 if(['star','hide'].includes(body.action)){
  const m=await message();const{error}=await db.from('whatsapp_message_preferences').upsert({user_id:owner,staff_id:staff,message_id:m.id,...(body.action==='star'?{starred:body.value!==false}:{hidden:body.value!==false})});check(error);return{ok:true};
 }
 if(['react','edit','delete'].includes(body.action)){
  const m=await message();if(!m.wa_message_id)throw new Error('Esta mensagem não tem identificador do WhatsApp.');
  if(body.action==='react'){
   if(typeof body.emoji!=='string'||body.emoji.length>16)throw new Error('Reação inválida.');
   await provider(db,owner,'/message/react',{number,reaction:body.emoji,id:m.wa_message_id,fromMe:m.from_me});const reactions:Record<string,string>={};if(m.reactions&&typeof m.reactions==='object'&&!Array.isArray(m.reactions))for(const [key,value] of Object.entries(m.reactions))if(typeof value==='string')reactions[key]=value;if(body.emoji)reactions.self=body.emoji;else delete reactions.self;const{error}=await db.from('whatsapp_messages').update({reactions}).eq('id',m.id).eq('user_id',owner);check(error);
  }else{
   if(!m.from_me)throw new Error('Você só pode editar ou apagar para todos mensagens enviadas.');if(m.sender_staff_id&&m.sender_staff_id!==staff&&staff!==owner)throw new Error('Só o autor ou o administrador pode alterar esta mensagem.');
   if(body.action==='edit'){
    if(m.media_type||Date.now()-(Number(m.wa_timestamp)<1e12?Number(m.wa_timestamp)*1000:Number(m.wa_timestamp))>15*60000)throw new Error('Só é possível editar texto enviado nos últimos 15 minutos.');
    if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)throw new Error('Texto inválido.');await provider(db,owner,'/message/edit',{number,chat,messageId:m.wa_message_id,message:body.text.trim()});const{error}=await db.from('whatsapp_messages').update({text:body.text.trim(),edited_at:new Date().toISOString()}).eq('user_id',owner).eq('id',m.id);check(error);
   }else{await provider(db,owner,'/message/delete',{number,chat,messageId:m.wa_message_id});const{error}=await db.from('whatsapp_messages').update({deleted_at:new Date().toISOString(),text:'Mensagem apagada',media_url:null,media_path:null}).eq('user_id',owner).eq('id',m.id);check(error);}
  }return{ok:true};
 }
 if(body.action==='poll_results'){
  const m=await message();if(m.media_type!=='poll'||!m.wa_message_id)throw new Error('Enquete não encontrada.');
  const result=await provider(db,owner,`/polls/${encodeURIComponent(m.wa_message_id)}/results`);const data=result.data||result;
  const options=await Promise.all(String(m.text||'').split('\n').slice(1).map(async(text:string)=>{const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));const hash=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');return{text,votes:Number(data.optionCounts?.[hash]||0)};}));return{total_votes:Number(data.totalVotes||0),options};
 }
 if(body.action==='download'){
  const m=await message();if(m.media_path){const{data,error}=await db.storage.from('whatsapp-private').createSignedUrl(m.media_path,3600);check(error);if(!data?.signedUrl)throw Error('Arquivo indisponível.');return{url:publicStorageUrl(data.signedUrl)};}
  if(!m.media_payload)throw new Error('Arquivo antigo sem dados de download. Peça ao cliente para reenviar.');
  const file=await provider(db,owner,'/message/downloadmedia',{message:m.media_payload});const base64=file?.data?.base64;if(typeof base64!=='string')throw new Error('O WhatsApp não disponibilizou o arquivo.');
  const raw=base64.includes(',')?base64.split(',')[1]:base64;const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(bytes.length>20*1024*1024)throw new Error('Arquivo maior que 20 MB.');const path=`${owner}/${m.id}`;const{error}=await db.storage.from('whatsapp-private').upload(path,bytes,{contentType:m.media_mimetype||'application/octet-stream',upsert:true});check(error);await db.from('whatsapp_messages').update({media_path:path}).eq('user_id',owner).eq('id',m.id);const{data}=await db.storage.from('whatsapp-private').createSignedUrl(path,3600);if(!data?.signedUrl)throw Error('Arquivo indisponível.');return{url:publicStorageUrl(data.signedUrl)};
 }
 if(body.action==='block'||body.action==='unblock'){await provider(db,owner,`/user/${body.action}`,{number});return{ok:true};}
 if(body.action==='history'){const{data:last}=await db.from('whatsapp_messages').select('wa_message_id,from_me,wa_timestamp').eq('user_id',owner).eq('wa_chatid',chat).not('wa_message_id','is',null).order('wa_timestamp',{ascending:false}).limit(1);if(!last?.length)throw new Error('Receba uma mensagem antes de solicitar o histórico do telefone.');await provider(db,owner,'/chat/history-sync',{messageInfo:{Chat:chat,ID:last[0].wa_message_id,IsFromMe:last[0].from_me,Timestamp:new Date(Number(last[0].wa_timestamp)<1e12?Number(last[0].wa_timestamp)*1000:Number(last[0].wa_timestamp)).toISOString()},count:100});return{ok:true};}
 if(body.action==='send'||body.action==='media'||body.action==='location'||body.action==='contact'||body.action==='poll'||body.action==='forward'){
  let payload:ChatSendPayload={number},fields:Record<string,Json|undefined>={},path='/send/text';
  if(body.quoted_id){const{data:q}=await db.from('whatsapp_messages').select('wa_message_id,text,from_me,media_type,media_filename').eq('user_id',owner).eq('wa_chatid',chat).eq('id',body.quoted_id).maybeSingle();if(!q?.wa_message_id)throw new Error('Mensagem original não encontrada.');payload.quoted={messageId:q.wa_message_id};fields.quoted_message_id=q.wa_message_id;fields.quoted_text=q.text||q.media_filename||q.media_type||'Mensagem';}
  if(body.action==='send'){if(typeof body.text!=='string'||!body.text.trim()||body.text.length>4000)throw new Error('Informe texto de até 4000 caracteres.');payload.text=body.text.trim();fields.text=payload.text;}
  if(body.action==='media'){
   if(typeof body.base64!=='string'||body.base64.length>28*1024*1024||!body.base64.startsWith('data:'))throw new Error('Arquivo inválido ou maior que 20 MB.');
   if(!['image','video','audio','document','sticker'].includes(body.type||''))throw new Error('Tipo de mídia inválido.');
   const raw=body.base64.split(',')[1];const bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));if(bytes.length>20*1024*1024)throw new Error('Arquivo maior que 20 MB.');const filename=String(body.filename||'arquivo').slice(0,180);const mime=body.base64.slice(5,body.base64.indexOf(';'));const storagePath=`${owner}/${crypto.randomUUID()}`;const upload=await db.storage.from('whatsapp-private').upload(storagePath,bytes,{contentType:mime});check(upload.error);const{data:link}=await db.storage.from('whatsapp-private').createSignedUrl(storagePath,3600);if(!link?.signedUrl)throw Error('Arquivo indisponível.');path=body.type==='sticker'?'/send/sticker':'/send/media';payload={...payload,url:raw,type:body.type,filename,caption:String(body.caption||'').slice(0,4000)};if(body.type==='sticker')payload.sticker=raw;fields={...fields,text:payload.caption,media_type:body.type,media_path:storagePath,media_url:publicStorageUrl(link.signedUrl),media_filename:filename,media_mimetype:mime};
  }
  if(body.action==='location'){
   if(typeof body.latitude!=='number'||typeof body.longitude!=='number'||!Number.isFinite(body.latitude)||!Number.isFinite(body.longitude)||Math.abs(body.latitude)>90||Math.abs(body.longitude)>180)throw new Error('Localização inválida.');path='/send/location';payload={...payload,latitude:body.latitude,longitude:body.longitude,name:String(body.name||'Localização').slice(0,100),address:String(body.address||'').slice(0,300)};fields={...fields,text:`${payload.name}\n${payload.address}`,media_type:'location',media_url:`https://www.google.com/maps?q=${body.latitude},${body.longitude}`};
  }
  if(body.action==='contact'){if(typeof body.contact_phone!=='string'||!/^\+?\d{8,15}$/.test(body.contact_phone.replace(/[\s()-]/g,'')))throw new Error('Telefone inválido.');path='/send/contact';payload.vcard={fullName:String(body.name||'Contato').slice(0,100),phone:body.contact_phone.replace(/\D/g,'')};fields.text=`${payload.vcard.fullName}\n${payload.vcard.phone}`;fields.media_type='contact';}
  if(body.action==='poll'){if(typeof body.question!=='string'||!body.question.trim()||!Array.isArray(body.options)||body.options.length<2||body.options.length>12||body.options.some((v)=>typeof v!=='string'||!v.trim()||v.length>100))throw new Error('Informe uma pergunta e de 2 a 12 opções.');path='/send/poll';payload={...payload,question:body.question.slice(0,250),options:body.options.map((v:string)=>v.trim()),maxAnswer:1};fields.text=`${payload.question}\n${(payload.options||[]).join('\n')}`;fields.media_type='poll';}
  if(body.action==='forward'){
   if(!body.message_id)throw Error('Selecione uma mensagem para encaminhar.');
   const{data:m}=await db.from('whatsapp_messages').select('*').eq('user_id',owner).eq('id',body.message_id).maybeSingle();if(!m||m.deleted_at)throw new Error('Mensagem não encontrada.');if(m.media_path){const{data:link}=await db.storage.from('whatsapp-private').createSignedUrl(m.media_path,3600);if(!link?.signedUrl)throw Error('Arquivo indisponível.');path='/send/media';payload={number,url:publicStorageUrl(link.signedUrl),type:m.media_type,caption:m.text||'',filename:m.media_filename||'arquivo'};fields={text:m.text,media_type:m.media_type,media_path:m.media_path,media_filename:m.media_filename};}else{payload.text=m.text;fields.text=m.text;}
  }
  const requestId=body.request_id || crypto.randomUUID();
  if(!/^[a-f0-9-]{36}$/i.test(requestId))throw new Error('Identificador de envio inválido.');
  const claim=await db.from('whatsapp_send_requests').insert({user_id:owner,staff_id:staff,request_id:requestId,wa_chatid:chat,state:'pending'});
  if(claim.error?.code==='23505'){
   const{data:existing}=await db.from('whatsapp_send_requests').select('state,provider_id,wa_chatid,staff_id').eq('user_id',owner).eq('request_id',requestId).maybeSingle();
   if(existing?.wa_chatid!==chat||existing?.staff_id!==staff)throw new Error('Identificador de envio pertence a outra conversa.');
   if(existing?.state==='sent')return{ok:true,provider_id:existing.provider_id,already_sent:true};
   throw new Error('Este envio está pendente de confirmação. Confira o histórico antes de enviar novamente.');
  }
  check(claim.error);payload.id=requestId.replace(/-/g,'').toUpperCase();
  try{
   const sent=await provider(db,owner,path,payload);
   const id=sent?.data?.Info?.ID||sent?.data?.key?.id||sent?.key?.id||sent?.id||payload.id;
   const {data:saved,error}=await db.rpc('confirm_whatsapp_send',{p_owner:owner,p_staff:staff,p_request:requestId,p_chat:chat,p_provider_id:id,p_fields:fields,p_timestamp:Date.now()});
   if(error||!saved||typeof saved!=='object'||Array.isArray(saved)||saved.ok!==true)throw new Error('O envio foi aceito, mas a confirmação não foi salva. Confira o histórico antes de repetir.');
   return saved;
  }
  catch(error){await db.from('whatsapp_send_requests').update({state:'unknown'}).eq('user_id',owner).eq('request_id',requestId).eq('state','pending');throw error;}
 }
 throw new Error('Ação não disponível.');
}
