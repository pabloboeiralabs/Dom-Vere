import type {DatabaseClient} from './database-client.ts';
import { shopStaff } from "./chat-actions.ts";
export async function notifyManualMessage(db:DatabaseClient,owner:string,chat:string,text:string,fromMe:boolean){
 if(fromMe||!/^\d+@s\.whatsapp\.net$/.test(chat))return;
 const{data:lead}=await db.from('crm_leads').select('bot_paused,bot_enabled_when_global_off,assigned_staff_id,name').eq('user_id',owner).eq('wa_chatid',chat).maybeSingle();
 if(!lead?.bot_paused){if(lead?.bot_enabled_when_global_off)return;const{data:settings}=await db.from('settings').select('bot_enabled').eq('user_id',owner).maybeSingle();if(settings?.bot_enabled!==false)return;}
 const staff=await shopStaff(db,owner);
 const recipients=[owner,...(staff||[]).map((p)=>p.id)];
 for(const recipient of new Set(recipients)){
  const{data:pref}=await db.from('whatsapp_chat_preferences').select('muted').eq('user_id',owner).eq('staff_id',recipient).eq('wa_chatid',chat).maybeSingle();if(pref?.muted)continue;
  const url=`${recipient===owner?'https://domvere.zlabs.com.br/whatsapp':'https://barber.zlabs.com.br/barber-panel'}?chat=${encodeURIComponent(chat)}`;
  const title=lead?.name&&lead.name!=='Novo Lead'?`WhatsApp · ${lead.name}`:'Nova mensagem no WhatsApp';
  const body=text?text.slice(0,120):'O cliente enviou um arquivo.';
  const saved=await db.from('client_notifications').insert({user_id:recipient,customer_id:null,title,body,url});if(saved.error)continue;
  try{await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push-notification`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`},body:JSON.stringify({user_id:recipient,title,body,url,tag:`wa-${chat}`})});}catch{ /* Best-effort fallback: the caller keeps the last valid state. */ }
 }
}
