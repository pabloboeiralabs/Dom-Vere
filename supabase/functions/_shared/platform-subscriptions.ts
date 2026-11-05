import type {DatabaseClient} from './database-client.ts';
export function mpCheckoutUrl(value:unknown){
 try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password&&['www.mercadopago.com.br','mercadopago.com.br','www.mercadopago.com','mercadopago.com'].includes(u.hostname)&&!u.port?u.href:null;}catch{return null;}
}
export const subscriptionsEnabled=()=>Deno.env.get('MERCADOPAGO_SUBSCRIPTIONS_ENABLED')==='true'&&!!Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')&&!!Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET');
export async function mpRequest(path:string,body?:unknown,key?:string,method?:string){
 if(!/^\/(preapproval(?:\/[a-zA-Z0-9_-]+)?|authorized_payments(?:\/[a-zA-Z0-9_-]+)?|v1\/payments\/\d+|users\/me)$/.test(path))throw Error('Recurso inválido');
 const response=await fetch('https://api.mercadopago.com'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+Deno.env.get('MERCADOPAGO_ACCESS_TOKEN'),'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 if(!response.ok){const error=Object.assign(Error(response.status===400?'Confira os dados do cartão e o e-mail da assinatura.':'Mercado Pago temporariamente indisponível'),{definitive:[400,401,403,404,422].includes(response.status)});throw error;}return response.json();
}
export function subscriptionPayload(s:any,email:string,back:string){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)throw Error('Informe seu e-mail de pagamento');
 return{reason:`${s.plan_name} — Zlabs`,external_reference:'zlabs-sub:'+s.id,payer_email:email,auto_recurring:{frequency:1,frequency_type:'months',start_date:s.start_date+'T15:00:00.000Z',transaction_amount:s.amount_cents/100,currency_id:'BRL'},back_url:back,status:'pending'};
}
export function subscriptionMatches(remote:any,local:any,collector:string){
 const r=remote.auto_recurring;
 return String(remote.collector_id)===collector&&remote.external_reference==='zlabs-sub:'+local.id&&(!local.provider_id||String(remote.id)===local.provider_id)&&r?.currency_id==='BRL'&&r.frequency===1&&r.frequency_type==='months'&&Math.round(Number(r.transaction_amount)*100)===local.amount_cents&&String(r.start_date||'').slice(0,10)===local.start_date;
}
export function authorizedCycle(a:any,s:any){
 if(String(a.preapproval_id)!==s.provider_id||!/^\d+$/.test(String(a.payment?.id||''))||!Number.isFinite(Date.parse(a.debit_date)))throw Error('Pagamento recorrente incompatível');
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.debit_date));
 const[y,m,d]=date.split('-').map(Number),last=new Date(Date.UTC(y,m,0)).getUTCDate();
 if(date<s.start_date||d!==Math.min(s.due_day,last))throw Error('Ciclo recorrente incompatível');return date;
}
export async function startSubscription(db:DatabaseClient,invoice:any,email:string,paymentToken:string){
 if(!subscriptionsEnabled())throw Error('Assinaturas ainda não foram habilitadas');
 subscriptionPayload({id:'validation',plan_name:'Mensal',start_date:'2099-01-01',amount_cents:100},email,'https://painel.zlabs.com.br');
 const{data:claim,error}=await db.rpc('billing_claim_subscription',{p_invoice:invoice.id,p_email:email});
 if(error)throw Error(error.message||'Não foi possível preparar a assinatura');
 const checked=subscriptionClaim(claim);const s=checked.subscription;
 if(checked.existing){
  if(s.checkout_url&&s.state==='pending')return{url:mpCheckoutUrl(s.checkout_url)};
  if(['authorized','paused'].includes(s.state))throw Error('Este projeto já tem uma assinatura. Confira o estado no painel');
  throw Error('Criação em conferência. Não será gerada outra assinatura automaticamente');
 }
 try{
  const remote=await mpRequest('/preapproval',subscriptionPayload(s,email,'https://painel.zlabs.com.br/pagamento/'+paymentToken),s.id);
  const url=mpCheckoutUrl(remote.init_point);
  if(!url||!remote.id)throw Error('Retorno inválido do Mercado Pago');
  const{error:save}=await db.from('platform_subscriptions').update({provider_id:String(remote.id),checkout_url:url,state:'pending'}).eq('id',s.id);
  if(save)throw Error('Não foi possível registrar a assinatura');return{url};
 }catch(e){await db.from('platform_subscriptions').update({state:'unknown'}).eq('id',s.id);throw e;}
}
export async function syncSubscription(db:DatabaseClient,id:string,collector:string){
 const remote=await mpRequest('/preapproval/'+id);
 const localId=String(remote.external_reference||'').match(/^zlabs-sub:([a-f0-9-]{36})$/i)?.[1];
 if(!localId)return null;
 const{data:local,error}=await db.from('platform_subscriptions').select('*').eq('id',localId).maybeSingle();if(error)throw error;if(!local)return null;
 if(!subscriptionMatches(remote,local,collector))throw Error('Assinatura incompatível');
 if(!['pending','authorized','paused','cancelled'].includes(remote.status)||!Number.isFinite(Date.parse(remote.last_modified)))throw Error('Estado da assinatura inválido');
 // Compare-and-set makes stale notifications harmless.
 const{error:save}=await db.from('platform_subscriptions').update({provider_id:String(remote.id),state:remote.status,provider_updated_at:remote.last_modified}).eq('id',local.id).or('provider_updated_at.is.null,provider_updated_at.lte.'+remote.last_modified);
 if(save)throw save;return{...local,provider_id:String(remote.id)};
}
export async function syncAuthorizedPayment(db:DatabaseClient,id:string,collector:string){
 const authorized=await mpRequest('/authorized_payments/'+id);
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(String(authorized.preapproval_id||'')))throw Error('Assinatura inválida');
 const local=await syncSubscription(db,String(authorized.preapproval_id),collector);if(!local)return{ignored:true};
 if(!authorized.payment?.id)return{pending:true};
 const due=authorizedCycle(authorized,local),payment=await mpRequest('/v1/payments/'+String(authorized.payment.id));
 if(String(payment.collector_id)!==collector||payment.live_mode!==true||payment.currency_id!=='BRL'||Math.round(Number(payment.transaction_amount)*100)!==local.amount_cents)throw Error('Pagamento incompatível');
 if(!['approved','refunded','charged_back'].includes(payment.status))return{pending:true};
 const{data,error}=await db.rpc('billing_apply_subscription_payment',{p_subscription:local.id,p_authorized:String(authorized.id),p_due:due,p_payment:String(payment.id),p_status:payment.status,p_amount:Math.round(payment.transaction_amount*100),p_currency:payment.currency_id,p_method:payment.payment_method_id||null,p_net:payment.transaction_details?.net_received_amount==null?null:Math.round(payment.transaction_details.net_received_amount*100),p_updated:payment.date_last_updated});
 if(error)throw error;return data;
}

export async function startTransparentSubscription(db:DatabaseClient,invoice:any,email:string,cardToken:string,paymentToken:string){
 if(!subscriptionsEnabled())throw Error('Assinaturas ainda não estão disponíveis.');
 if(typeof cardToken!=='string'||!/^[a-zA-Z0-9_-]{10,200}$/.test(cardToken))throw Error('Preencha o cartão no formulário seguro.');
 subscriptionPayload({id:'validation',plan_name:'Mensal',start_date:'2099-01-01',amount_cents:100},email,'https://painel.zlabs.com.br');
 const{data:claim,error}=await db.rpc('billing_claim_subscription',{p_invoice:invoice.id,p_email:email});if(error)throw Error(error.message||'Não foi possível preparar a assinatura.');
 const checked=subscriptionClaim(claim);const s=checked.subscription;
 if(checked.existing)throw Error(['authorized','paused'].includes(s.state)?'Já existe uma assinatura para este projeto.':'Já existe uma assinatura em conferência. Não será criada outra cobrança.');
 let created=false;
 try{
  const remote=await mpRequest('/preapproval',{...subscriptionPayload(s,email,'https://painel.zlabs.com.br/pagamento/'+paymentToken),card_token_id:cardToken,status:'authorized'},s.id);
  created=true;
  const receiver=await mpRequest('/users/me');
  if(!remote.id||!subscriptionMatches(remote,s,String(receiver.id))||!['authorized','pending'].includes(remote.status))throw Error('Assinatura em conferência. Não repita a ativação.');
  const{error}=await db.from('platform_subscriptions').update({provider_id:String(remote.id),state:remote.status,checkout_url:null,provider_updated_at:remote.last_modified||new Date().toISOString()}).eq('id',s.id);if(error)throw Error('Autorização recebida; aguardando atualização. Não repita.');
  return {state:remote.status,start_date:s.start_date,amount_cents:s.amount_cents};
 }catch(e:unknown){await db.from('platform_subscriptions').update({state:!created&&(typeof e === 'object' && e !== null && 'definitive' in e ? e.definitive : undefined)?'failed':'unknown'}).eq('id',s.id);throw e;}
}
/** Reject malformed subscription claims before calling the payment provider. */
export function subscriptionClaim(value:unknown){
 if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Reserva de assinatura inválida.');
 const claim=value as Record<string,unknown>,raw=claim.subscription;
 if(typeof claim.existing!=='boolean'||raw===null||typeof raw!=='object'||Array.isArray(raw))throw Error('Reserva de assinatura inválida.');
 const s=raw as Record<string,unknown>;
 if(typeof s.id!=='string'||typeof s.plan_name!=='string'||typeof s.start_date!=='string'||typeof s.amount_cents!=='number'||s.state!=null&&typeof s.state!=='string'||s.checkout_url!=null&&typeof s.checkout_url!=='string')throw Error('Dados da assinatura incompletos.');
 return {existing:claim.existing,subscription:{...s,id:s.id,plan_name:s.plan_name,start_date:s.start_date,amount_cents:s.amount_cents,state:typeof s.state==='string'?s.state:'pending',checkout_url:typeof s.checkout_url==='string'?s.checkout_url:null}};
}
