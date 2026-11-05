import {checkoutClaim} from './checkout-claim.ts';
import type {DatabaseClient} from './database-client.ts';
import { validatePayment, webhookUrl } from './billing.ts';
const mail=(v:unknown)=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
export function checkoutBody(invoice:any,body:any){
 if(!mail(body.email))throw Error('Informe um e-mail válido para o pagamento.');
 const payer:any={email:body.email.trim().toLowerCase()};
 if(body.identification){const d=body.identification;if(!['CPF','CNPJ'].includes(d.type)||!/^\d{11}$|^\d{14}$/.test(d.number||''))throw Error('Confira o CPF ou CNPJ informado.');payer.identification={type:d.type,number:d.number};}
 const result:any={transaction_amount:invoice.amount_cents/100,description:invoice.plan_name,external_reference:invoice.id,notification_url:webhookUrl,payment_method_id:'pix',payer,metadata:{invoice_id:invoice.id,tenant_id:invoice.tenant_id}};
 if(body.method==='card'){
  if(typeof body.card_token!=='string'||!/^[a-zA-Z0-9_-]{10,200}$/.test(body.card_token)||!/^\w{2,50}$/.test(body.payment_method_id||''))throw Error('Preencha os dados do cartão com segurança.');
  result.payment_method_id=body.payment_method_id;result.token=body.card_token;result.installments=1;
  if(body.issuer_id&&/^\d{1,20}$/.test(String(body.issuer_id)))result.issuer_id=String(body.issuer_id);
 }else if(body.method!=='pix')throw Error('Escolha Pix ou cartão.');
 return result;
}
export async function paymentRequest(path:string,body?:unknown,key?:string,method?:string){
 if(!/^\/(v1\/payments(?:\/\d+)?|users\/me)$/.test(path)&&!/^\/v1\/payments\/search\?external_reference=[a-f0-9-]{36}&sort=date_created&criteria=desc&limit=20$/.test(path))throw Error('Recurso de pagamento inválido.');
 let response:Response;
 try{response=await fetch('https://api.mercadopago.com'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+Deno.env.get('MERCADOPAGO_ACCESS_TOKEN'),'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});}catch{throw Error('A confirmação está demorando. Confira o estado desta mensalidade antes de tentar novamente.');}
 const data=await response.json().catch(()=>({}));
 if(!response.ok){const error=Object.assign(Error(response.status===400?'Confira o e-mail e os dados de pagamento. Se o erro continuar, entre em contato com a Zlabs.':'O pagamento não pôde ser confirmado agora. Aguarde e consulte novamente.'),{definitive:[400,401,403,404,422].includes(response.status)});throw error;}
 return data;
}
export async function syncCheckout(db:DatabaseClient,invoice:any,attempt:any){
 if(!attempt.provider_id){
  if(['processing','unknown'].includes(attempt.state)){const found=await paymentRequest('/v1/payments/search?external_reference='+invoice.id+'&sort=date_created&criteria=desc&limit=20');const payment=found.results?.find((p:any)=>p.metadata?.checkout_attempt_id===attempt.id);if(payment?.id){const{error}=await db.from('platform_checkout_attempts').update({provider_id:String(payment.id)}).eq('id',attempt.id);if(error)throw Error('Pagamento em conferência.');attempt={...attempt,provider_id:String(payment.id)};}}
  if(!attempt.provider_id)return {state:attempt.state,method:attempt.method,processing:['processing','unknown'].includes(attempt.state)};
 }
 let payment=await paymentRequest('/v1/payments/'+attempt.provider_id);
 const receiver=await paymentRequest('/users/me');
 if(!validatePayment(payment,invoice,String(receiver.id)))throw Error('Não foi possível validar este pagamento.');
 if(attempt.method==='pix'&&payment.status==='pending'&&payment.date_of_expiration&&Date.parse(payment.date_of_expiration)<=Date.now()){await paymentRequest('/v1/payments/'+attempt.provider_id,{status:'cancelled'},undefined,'PUT');payment=await paymentRequest('/v1/payments/'+attempt.provider_id);if(!validatePayment(payment,invoice,String(receiver.id)))throw Error('Pagamento em conferência.');}
 const state=payment.status==='approved'?'approved':['cancelled','rejected','refunded','charged_back'].includes(payment.status)?'cancelled':payment.status==='pending'?'pending':'processing';
 const {error}=await db.from('platform_checkout_attempts').update({state,expires_at:payment.date_of_expiration||null}).eq('id',attempt.id);if(error)throw Error('Não foi possível atualizar o pagamento.');
 if(['approved','refunded','charged_back'].includes(payment.status)){
  const result=await db.rpc('billing_apply_payment',{p_invoice:invoice.id,p_payment:String(payment.id),p_status:payment.status,p_amount:Math.round(Number(payment.transaction_amount)*100),p_currency:payment.currency_id,p_method:payment.payment_method_id||null,p_net:payment.transaction_details?.net_received_amount==null?null:Math.round(payment.transaction_details.net_received_amount*100),p_updated:payment.date_last_updated});if(result.error)throw Error('Pagamento recebido; aguardando atualização da mensalidade. Não pague novamente.');
 }
 const transaction=payment.point_of_interaction?.transaction_data||{};
 return {state,method:attempt.method,expires_at:payment.date_of_expiration||null,...(attempt.method==='pix'&&state==='pending'?{qr_code:transaction.qr_code||null,qr_image:transaction.qr_code_base64||null}:{}),message:state==='approved'?'Pagamento confirmado.':state==='pending'?'Aguardando pagamento.':state==='cancelled'?'Pagamento não concluído. Escolha como deseja pagar.':'Pagamento em análise. Aguarde a confirmação.'};
}
export async function processTransparentPayment(db:DatabaseClient,invoice:any,body:any){
 const payload=checkoutBody(invoice,body);
 if(!/^[a-f0-9-]{36}$/i.test(body.request_id||''))throw Error('Atualize a página e tente novamente.');
 const claim=await db.rpc('billing_claim_checkout',{p_invoice:invoice.id,p_method:body.method,p_request:body.request_id});if(claim.error)throw Error(claim.error.message||'Não foi possível iniciar o pagamento.');
 const checked=checkoutClaim(claim.data);const a=checked.attempt;
 if(checked.existing){if(a.method!==body.method)throw Error('Já existe um pagamento em andamento. Cancele o Pix pendente antes de usar o cartão.');return syncCheckout(db,invoice,a);}
 try{
  payload.metadata.checkout_attempt_id=a.id;
  const payment=await paymentRequest('/v1/payments',payload,a.id);
  const result=await db.from('platform_checkout_attempts').update({provider_id:String(payment.id),state:payment.status==='rejected'?'rejected':'pending',expires_at:payment.date_of_expiration||null}).eq('id',a.id);if(result.error)throw Error('Envio registrado; aguarde a confirmação. Não repita o pagamento.');
  return await syncCheckout(db,invoice,{...a,provider_id:String(payment.id)});
 }catch(error:unknown){await db.from('platform_checkout_attempts').update({state:(typeof error === 'object' && error !== null && 'definitive' in error ? error.definitive : undefined)?'rejected':'unknown'}).eq('id',a.id).is('provider_id',null);throw error;}
}
export async function cancelPendingPix(db:DatabaseClient,invoice:any){
 const {data:a}=await db.from('platform_checkout_attempts').select('*').eq('invoice_id',invoice.id).eq('method','pix').eq('state','pending').maybeSingle();
 if(!a?.provider_id)throw Error('Nenhum Pix pendente para cancelar.');
 const current=await syncCheckout(db,invoice,a);if(current.state==='approved')return current;
 if(current.state==='pending')await paymentRequest('/v1/payments/'+a.provider_id,{status:'cancelled'},undefined,'PUT');
 return syncCheckout(db,invoice,a);
}
