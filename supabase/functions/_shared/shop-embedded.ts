import {checkoutClaim,preparedOrder} from './checkout-claim.ts';
import type {DatabaseClient} from './database-client.ts';
import{checkoutBody}from'./transparent-checkout.ts';
import{shopMp,openShopSecret,processShopPayment,shopPaymentWebhook,shopSubscription,reconcileShopOrder}from'./shop-payments.ts';
export function embeddedPaymentBody(order:any,body:any){
 const payload=checkoutBody({id:order.id,amount_cents:order.amount_cents,plan_name:order.snapshot.plan_name},body);
 payload.notification_url=shopPaymentWebhook+'?connection='+order.connection_id;
 payload.metadata={shop_plan_order:order.id};
 if(body.method==='pix')payload.date_of_expiration=new Date(Date.now()+35*60000).toISOString();
 return payload;
}
export async function embeddedStatus(db:DatabaseClient,order:any,connection:any,attempt:any){
 const token=await openShopSecret(connection.token_cipher,connection.user_id);
 if(attempt.method==='subscription'){
  if(!order.preapproval_id){return{state:'processing',method:attempt.method,message:'Autorização em conferência. Não envie novamente.'};}
  await reconcileShopOrder(db,order,connection);
  const{data:latest}=await db.from('shop_plan_orders').select('status,subscription_status').eq('id',order.id).single();
  return{state:latest?.status==='paid'?'approved':latest?.subscription_status==='cancelled'?'cancelled':'processing',method:attempt.method,message:'Assinatura autorizada. A liberação aguarda o primeiro pagamento aprovado.'};
 }
 if(!attempt.provider_id){
  const found=await shopMp(token,'/v1/payments/search?external_reference='+order.id+'&sort=date_created&criteria=desc&limit=30');
  const payment=found.results?.find((p:any)=>p.metadata?.shop_checkout_attempt===attempt.id);
  if(!payment)return{state:attempt.state,method:attempt.method,message:'Pagamento em conferência. Aguarde antes de tentar novamente.'};
  attempt={...attempt,provider_id:String(payment.id)};
  const{error}=await db.from('shop_checkout_attempts').update({provider_id:attempt.provider_id}).eq('id',attempt.id);if(error)throw Error('Pagamento em conferência.');
 }
 let payment=await shopMp(token,'/v1/payments/'+encodeURIComponent(attempt.provider_id));
 // The same receiver/amount/reference validation applies to every status and QR response.
 await processShopPayment(db,connection,payment);
 if(attempt.method==='pix'&&payment.status==='pending'&&Date.parse(payment.date_of_expiration)<=Date.now()){
  await shopMp(token,'/v1/payments/'+attempt.provider_id,{status:'cancelled'},'PUT');payment=await shopMp(token,'/v1/payments/'+attempt.provider_id);await processShopPayment(db,connection,payment);
 }
 const state=payment.status==='approved'?'approved':['cancelled','refunded','charged_back'].includes(payment.status)?'cancelled':payment.status==='rejected'?'rejected':payment.status==='pending'?'pending':'processing';
 const{error}=await db.from('shop_checkout_attempts').update({state}).eq('id',attempt.id);if(error)throw Error('Aguardando atualização do pagamento.');
 const t=payment.point_of_interaction?.transaction_data||{};
 return{state,method:attempt.method,expires_at:payment.date_of_expiration||null,...(state==='pending'&&attempt.method==='pix'?{qr_code:t.qr_code,qr_image:t.qr_code_base64}:{}),message:state==='approved'?'Pagamento confirmado! Seu plano está liberado.':state==='rejected'?'Cartão não aprovado. Confira os dados ou escolha Pix.':state==='cancelled'?'Pagamento cancelado. Você pode escolher outra forma.':'Aguardando confirmação do pagamento.'};
}
export async function prepareEmbeddedOrder(db:DatabaseClient,offer:any,connection:any,recurring:boolean){
 const{data:existing}=await db.from('shop_plan_orders').select('*').eq('offer_id',offer.id).maybeSingle();
 if(existing?.preference_id){
  await reconcileShopOrder(db,existing,connection);
  const{data:latest}=await db.from('shop_plan_orders').select('status').eq('id',existing.id).single();if(latest?.status==='paid')return{...existing,status:'paid'};
  const{data:payments,error:paymentsError}=await db.from('shop_plan_payments').select('payment_id').eq('order_id',existing.id).in('status',['pending','in_process','authorized']);if(paymentsError)throw Error('Não foi possível conferir os pagamentos anteriores.');
  if(payments?.length){const{data:attempts,error:attemptError}=await db.from('shop_checkout_attempts').select('provider_id').eq('order_id',existing.id);if(attemptError)throw Error('Pagamento em conferência.');const known=new Set((attempts||[]).map((a)=>a.provider_id));if(payments.some((p)=>!known.has(p.payment_id)))throw Error('Existe um pagamento anterior em andamento. Aguarde a confirmação antes de pagar novamente.');}
  const token=await openShopSecret(connection.token_cipher,connection.user_id);
  await shopMp(token,'/checkout/preferences/'+encodeURIComponent(existing.preference_id),{expires:true,expiration_date_to:new Date().toISOString()},'PUT');
 }
 if(existing&&existing.recurring!==recurring){const{error}=await db.rpc('shop_switch_checkout_mode',{p_order:existing.id,p_recurring:recurring});if(error)throw Error(error.message);}
 const{data:order,error}=await db.rpc('shop_plan_prepare_order',{p_offer:offer.id,p_recurring:recurring});if(error)throw Error(error.message);return preparedOrder(order);
}
export async function payEmbedded(db:DatabaseClient,order:any,connection:any,body:any){
 const subscription=body.method==='subscription';
 if(subscription&&(body.consent!==true||!/^\S+@\S+\.\S+$/.test(body.email||'')||body.email.length>254||!/^[a-zA-Z0-9_-]{10,200}$/.test(body.card_token||'')))throw Error('Informe seu e-mail, preencha o cartão e autorize a assinatura.');
 const payload=subscription?{...shopSubscription(order,body.email,'https://cliente.zlabs.com.br/cliente'),status:'authorized',card_token_id:body.card_token}:embeddedPaymentBody(order,body);
 if(!/^[a-f0-9-]{36}$/i.test(body.request_id||''))throw Error('Atualize o pagamento e tente novamente.');
 const{data:claim,error}=await db.rpc('shop_claim_checkout',{p_order:order.id,p_method:body.method,p_request:body.request_id});if(error)throw Error(error.message);
 const checked=checkoutClaim(claim);const a=checked.attempt;
 if(checked.existing){if(a.method!==body.method)throw Error('Existe um pagamento em andamento. Confira ou cancele o Pix antes de escolher outro meio.');return embeddedStatus(db,order,connection,a);}
 const token=await openShopSecret(connection.token_cipher,connection.user_id);
 try{
  if(!subscription)payload.metadata.shop_checkout_attempt=a.id;
  const payment=await shopMp(token,subscription?'/preapproval':'/v1/payments',payload,'POST',a.id);
  if(subscription){if(!payment.id||String(payment.collector_id)!==connection.collector_id||payment.external_reference!==order.id)throw Error('Autorização em conferência. Não envie novamente.');const{error}=await db.from('shop_plan_orders').update({preapproval_id:String(payment.id),subscription_status:payment.status,checkout_lock_until:null}).eq('id',order.id);if(error)throw Error('Autorização em conferência.');order={...order,preapproval_id:String(payment.id)};}
  const{error}=await db.from('shop_checkout_attempts').update({provider_id:String(payment.id),state:subscription?'authorized':payment.status==='rejected'?'rejected':'pending'}).eq('id',a.id);if(error)throw Error('Pagamento em conferência. Não envie novamente.');
  return embeddedStatus(db,order,connection,{...a,provider_id:String(payment.id)});
 }catch(error:unknown){await db.from('shop_checkout_attempts').update({state:(typeof error === 'object' && error !== null && 'definitive' in error ? error.definitive : undefined)?'rejected':'unknown'}).eq('id',a.id).is('provider_id',null);throw error;}
}
