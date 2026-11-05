import type {DatabaseClient} from './database-client.ts';
import {matchesBillingApproval} from './billing-approval.ts';
import{billingPhone,billingMessage,billingWhatsAppRequest as evolutionRequest,evolutionConnected,whatsevoConfig}from'./platform-whatsapp.ts';
export const billingChannels=(mode:string)=>mode==='both'?['system','whatsapp']:mode==='whatsapp'?['whatsapp']:['system'];
export async function sendPlatformReminders(db:DatabaseClient,configured:boolean,manualInvoice?:any,manualChannel?:string,includeLink=true,approval?:unknown){
 const wantsLink=!manualInvoice||includeLink;
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const hour=Number(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date()));if(!manualInvoice&&(hour<9||hour>=20))return 0;
 let notices:any[];
 if(manualInvoice){
  const{data:c}=await db.from('platform_billing_contracts').select('enabled,reminder_channel').eq('tenant_id',manualInvoice.tenant_id).maybeSingle();
  if(!c?.enabled||manualInvoice.tenant?.status!=='active'||manualInvoice.status!=='open')throw Error('Confira se o contrato está ativo e a cobrança continua em aberto.');
  if(billingChannels(manualChannel||c.reminder_channel).includes('whatsapp')){
   if(wantsLink&&!configured)throw Error('Configure os tokens do Mercado Pago antes de enviar a cobrança por WhatsApp.');
   if(!manualInvoice.tenant?.contact_name?.trim()||!billingPhone(manualInvoice.tenant?.contact_phone))throw Error('Cadastre o responsável e o WhatsApp com DDD no contrato.');
  }
  const{data:previous,error:previousError}=await db.from('platform_billing_notices').select('state').eq('invoice_id',manualInvoice.id).eq('notice_date',today).maybeSingle();if(previousError)throw Error('Não foi possível consultar o histórico.');if(previous?.state==='sent'&&!manualChannel)return 0;
  notices=[{invoice_id:manualInvoice.id,notice_date:today,invoice:manualInvoice}];
 }else{
  const{data,error}=await db.from('platform_billing_notices').select('invoice_id,notice_date,invoice:platform_invoices(id,tenant_id,status,billing_kind,is_down_payment,installment_number,installment_count,installment_amount_cents,monthly_amount_cents,amount_cents,due_date,payment_token,tenant:tenants(id,name,owner_id,slug,status,contact_name,contact_phone,deployment_type))').eq('state','pending').lte('notice_date',today).order('notice_date',{ascending:true}).limit(1000);if(error)throw error;notices=data||[];
 }
 const{data:legacyConnection}=await db.from('platform_whatsapp').select('*').eq('singleton',true).eq('enabled',true).maybeSingle();
 const connection=whatsevoConfig()?{instance_token:legacyConnection?.instance_token||''}:legacyConnection;
 let whatsappReady=false;if((configured||!wantsLink)&&connection){try{const r=await evolutionRequest(connection.instance_token,'/instance/status');whatsappReady=r.ok&&evolutionConnected(r.data)&&!r.data?.rateLimited;}catch{ /* Best-effort fallback: the caller keeps the last valid state. */ }}
 if(manualInvoice){const{data:c}=await db.from('platform_billing_contracts').select('reminder_channel').eq('tenant_id',manualInvoice.tenant_id).maybeSingle();if(billingChannels(manualChannel||c?.reminder_channel||'system').includes('whatsapp')&&!whatsappReady)throw Error('Conecte o WhatsApp da Zlabs na aba WhatsApp antes de enviar a cobrança.');}
 if(manualInvoice){const{error}=await db.from('platform_billing_notices').upsert({invoice_id:manualInvoice.id,notice_date:today},{onConflict:'invoice_id,notice_date',ignoreDuplicates:true});if(error)throw Error('Não foi possível preparar o envio.');}
 let sent=0,attempted=0;
 for(const n of notices||[]){
  if(attempted>=10)break;
  const i=n.invoice;let t=i?.tenant;
  if(!i||i.status!=='open'||t?.status!=='active'){await db.from('platform_billing_notices').update({state:'cancelled'}).eq('invoice_id',n.invoice_id).eq('notice_date',n.notice_date);continue;}
  const{data:c}=await db.from('platform_billing_contracts').select('enabled,reminder_channel').eq('tenant_id',i.tenant_id).maybeSingle();if(!c?.enabled)continue;
  const{data:recurring,error:recurringError}=await db.from('platform_subscriptions').select('start_date').eq('tenant_id',i.tenant_id).in('state',['creating','pending','authorized','paused','unknown']).lte('start_date',i.due_date).maybeSingle();
  if(recurringError)throw Error('Não foi possível conferir a assinatura antes de enviar.');
  if(recurring){if(manualInvoice)throw Error('Mensalidade vinculada à assinatura. Confira a cobrança recorrente antes de enviar outro pedido de pagamento.');continue;}
  const channels=billingChannels(manualChannel||c.reminder_channel);
  // A missed, unattempted notice can be recovered today. Never repeat a past uncertain delivery.
  const{data:past,error:pastError}=await db.from('platform_billing_deliveries').select('channel,state').eq('invoice_id',i.id).eq('notice_date',n.notice_date);
  if(pastError)throw Error('Não foi possível conferir as tentativas anteriores.');
  for(const channel of channels){
   if(n.notice_date<today&&past?.some((d)=>d.channel===channel&&['sent','skipped','unknown','sending','failed'].includes(d.state)))continue;
   if(channel==='whatsapp'&&(!connection||(wantsLink&&!configured)||!whatsappReady||!billingPhone(t.contact_phone)||!t.contact_name?.trim()))continue;
   if(channel==='whatsapp'&&connection&&whatsevoConfig()){const capacity=await evolutionRequest(connection.instance_token,'/instance/status');if(!capacity.ok||!evolutionConnected(capacity.data)||capacity.data?.rateLimited){whatsappReady=false;continue;}}
   const{data:claim,error:claimError}=await db.rpc(manualChannel?'billing_claim_manual_delivery':'billing_claim_delivery',{p_invoice:i.id,p_date:today,p_channel:channel});if(manualInvoice&&claimError)throw Error('Não foi possível reservar este envio. Tente novamente.');if(claimError||!claim)continue;attempted++;
   // Re-read after claiming: a webhook may have settled a previously loaded invoice.
   const{data:current,error:currentError}=await db.from('platform_invoices').select('id,tenant_id,plan_name,replaced_at,status,amount_cents,billing_kind,is_down_payment,installment_amount_cents,monthly_amount_cents,installment_number,installment_count,due_date,payment_token,tenant:tenants(id,name,owner_id,slug,status,contact_name,contact_phone,deployment_type)').eq('id',i.id).maybeSingle();
   if(currentError||current?.status!=='open'||current.replaced_at!==null||current.tenant?.status!=='active'){
    await db.from('platform_billing_deliveries').update({state:'skipped',last_error:currentError?'invoice_check_failed':'invoice_closed',updated_at:new Date().toISOString()}).eq('invoice_id',i.id).eq('notice_date',today).eq('channel',channel).eq('state','sending');
    continue;
   }
   if(approval&&!matchesBillingApproval(current,approval)){
    await db.from('platform_billing_deliveries').update({state:'pending',last_error:'approval_changed',updated_at:new Date().toISOString()}).eq('invoice_id',i.id).eq('notice_date',today).eq('channel',channel).eq('state','sending');
    throw Error('Os dados mudaram após a aprovação. Confira a cobrança novamente.');
   }
   Object.assign(i,current);t=current.tenant;
   let state='sent',last_error:string|null=null,provider_id:string|null=null;
   if(channel==='whatsapp'){
    try{
     // The deterministic provider ID complements our atomic per-invoice/channel claim.
     const id='ZLABS'+i.id.replaceAll('-','')+today.replaceAll('-','');
     if(!connection)throw Error('Conexão indisponível');const r=await evolutionRequest(connection.instance_token,'/send/text',{number:billingPhone(t.contact_phone),text:billingMessage(i,t,wantsLink?'https://painel.zlabs.com.br/pagamento/'+i.payment_token:null,today),id,delay:0,formatJid:true});
     if(!r.ok){if(r.status===429||r.status===503&&r.data?.rateLimited){state='pending';last_error='rate_limit';whatsappReady=false;}else{state=r.status>=500?'unknown':'failed';last_error=state==='unknown'?'delivery_unconfirmed':'provider_rejected';}}
     else{provider_id=r.data?.Info?.ID||r.data?.key?.id||r.data?.id||r.data?.messageId||null;if(!provider_id){state='unknown';last_error='delivery_unconfirmed';}}
    }catch{state='unknown';last_error='delivery_unconfirmed';}
   }else if(t.owner_id){
    try{const value=(i.amount_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),url='https://domvere.zlabs.com.br'+(t.slug==='domvere'?'':'/t/'+t.slug)+'/subscription';
     const r=await db.functions.invoke('send-push-notification',{body:{user_id:t.owner_id,title:i.is_down_payment?'Entrada da compra do sistema':i.billing_kind==='sale'?'Parcela da compra do sistema':'Mensalidade do sistema',body:`${i.is_down_payment?'Sua entrada':i.billing_kind==='sale'?'Sua parcela '+i.installment_number+'/'+i.installment_count:'Sua mensalidade'} de ${value} vence em ${i.due_date.split('-').reverse().join('/')}${wantsLink?'. Consulte sua assinatura.':'.'}`,...(wantsLink?{url}:{}),tag:'billing-'+i.id+'-'+today,notification_id:'billing-'+i.id+'-'+today,skip_in_app:true}});
     if(r.error||r.data?.error)last_error='push_unavailable_in_app_active';
    }catch{last_error='push_unavailable_in_app_active';}
   }
   const{error:saveError}=await db.from('platform_billing_deliveries').update({state,last_error,provider_id,updated_at:new Date().toISOString()}).eq('invoice_id',i.id).eq('notice_date',today).eq('channel',channel).eq('state','sending');if(saveError)throw saveError;
   if(state==='sent')sent++;
  }
  const{data:rows}=await db.from('platform_billing_deliveries').select('channel,state').eq('invoice_id',i.id).eq('notice_date',today);
  if(channels.every(ch=>[...(rows||[]),...(past||[])].some((r)=>r.channel===ch&&['sent','skipped'].includes(r.state))))await db.from('platform_billing_notices').update({state:'sent'}).eq('invoice_id',i.id).eq('notice_date',n.notice_date).eq('state','pending');
 }
 return sent;
}
