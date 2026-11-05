import type {DatabaseClient} from './database-client.ts';
export const shopPaymentWebhook='https://domvere-api.zlabs.com.br/functions/v1/shop-payment-webhook';
const encoder=new TextEncoder();
function keyBytes(){const raw=Deno.env.get('SHOP_MP_ENCRYPTION_KEY')||'';if(!/^[a-f0-9]{64}$/i.test(raw))throw Error('Proteção das credenciais ainda não configurada no servidor.');return Uint8Array.from(raw.match(/../g)!,h=>parseInt(h,16));}
export async function sealShopSecret(value:string,owner:string){const key=await crypto.subtle.importKey('raw',keyBytes(),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(owner)},key,encoder.encode(value));return 'v1.'+btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(data)));}
export async function openShopSecret(value:string,owner:string){const [v,iv,data]=value.split('.');if(v!=='v1'||!iv||!data)throw Error('Credencial indisponível');const key=await crypto.subtle.importKey('raw',keyBytes(),'AES-GCM',false,['decrypt']);const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0)),additionalData:encoder.encode(owner)},key,Uint8Array.from(atob(data),c=>c.charCodeAt(0)));return new TextDecoder().decode(plain);}
export async function shopMp(token:string,path:string,body?:unknown,method?:string,key?:string){
 const response=await fetch('https://api.mercadopago.com'+path,{method:method||(body?'POST':'GET'),headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(key?{'X-Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 if(!response.ok){const error=Object.assign(Error(response.status===401?'A conexão Mercado Pago precisa ser atualizada.':'O Mercado Pago não concluiu a operação. Confira a conta e tente novamente.'),{status:response.status,definitive:[400,401,403,404,422].includes(response.status)});throw error;}return response.json();
}
export function safeShopCheckout(value:unknown){try{const u=new URL(String(value));return u.protocol==='https:'&&['www.mercadopago.com.br','mercadopago.com.br','www.mercadopago.com','mercadopago.com'].includes(u.hostname)&&!u.username&&!u.password&&!u.port?u.href:null;}catch{return null;}}
export function shopPreference(order:any,tenant:any,back:string){return{items:[{id:order.id,title:`${order.snapshot.plan_name} — ${tenant.name}`,quantity:1,currency_id:'BRL',unit_price:order.amount_cents/100}],external_reference:order.id,notification_url:shopPaymentWebhook+'?connection='+order.connection_id,back_urls:{success:back,pending:back,failure:back},auto_return:'approved',payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'atm'}],installments:1},metadata:{shop_plan_order:order.id}};}
export function shopSubscription(order:any,email:string,back:string){return{reason:order.snapshot.plan_name,external_reference:order.id,payer_email:email,back_url:back,status:'pending',auto_recurring:{frequency:order.snapshot.validity_days,frequency_type:'days',transaction_amount:order.amount_cents/100,currency_id:'BRL'}};}
export function matchingShopPayment(payment:any,order:any,connection:any){return String(payment.external_reference)===order.id&&String(payment.collector_id)===connection.collector_id&&payment.currency_id==='BRL'&&Number.isFinite(payment.transaction_amount)&&Math.round(payment.transaction_amount*100)===order.amount_cents&&payment.live_mode===connection.live_mode;}
export async function processShopPayment(db:DatabaseClient,connection:any,payment:any){
 const {data:order,error}=await db.from('shop_plan_orders').select('*').eq('id',payment.external_reference).eq('connection_id',connection.id).maybeSingle();if(error)throw Error('Falha ao consultar cobrança');if(!order)return{ignored:true};if(!matchingShopPayment(payment,order,connection))throw Error('Pagamento incompatível');
 const {data,error:applyError}=await db.rpc('shop_plan_apply_payment',{p_order:order.id,p_payment:payment});if(applyError)throw Error('Falha ao aplicar pagamento');return data;
}
export async function reconcileShopOrder(db:DatabaseClient,order:any,connection:any){
 const token=await openShopSecret(connection.token_cipher,connection.user_id);
 if(order.preapproval_id){
  const sub=await shopMp(token,'/preapproval/'+encodeURIComponent(order.preapproval_id));if(String(sub.collector_id)!==connection.collector_id||sub.external_reference!==order.id)throw Error('Assinatura incompatível');
  await db.from('shop_plan_orders').update({subscription_status:sub.status}).eq('id',order.id).neq('subscription_status','cancelled');
  const events=await shopMp(token,'/authorized_payments/search?preapproval_id='+encodeURIComponent(order.preapproval_id)+'&limit=100');
  const{data:known,error:knownError}=await db.from('shop_plan_payments').select('payment_id,status').eq('order_id',order.id).order('created_at',{ascending:false});if(knownError)throw Error('Falha ao consultar pagamentos');const recorded=new Map((known||[]).map((row)=>[row.payment_id,row.status]));const latest=known?.[0]?.payment_id;
  for(const event of events.results||[]){const pid=event.payment?.id||event.payment_id;if(pid&&String(event.preapproval_id)===order.preapproval_id){const previous=recorded.get(String(pid)),current=event.payment?.status;if(String(pid)!==latest&&['approved','refunded','charged_back'].includes(String(previous))&&previous===current)continue;const payment=await shopMp(token,'/v1/payments/'+encodeURIComponent(pid));if(!payment.external_reference)payment.external_reference=order.id;await processShopPayment(db,connection,payment);}}
 }else{
  const payments=await shopMp(token,'/v1/payments/search?external_reference='+encodeURIComponent(order.id)+'&sort=date_created&criteria=desc&limit=30');
  for(const payment of [...(payments.results||[])].reverse())await processShopPayment(db,connection,payment);
 }
}
