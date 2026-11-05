export const billingCors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info'};
export const billingReply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...billingCors,'Content-Type':'application/json'}});
export const webhookUrl='https://domvere-api.zlabs.com.br/functions/v1/mercadopago-webhook';
export function checkoutPreference(invoice:{id:string;plan_name:string;amount_cents:number},tenant:{id:string;slug:string;name:string}){
 const path=tenant.slug==='domvere'?'':'/t/'+tenant.slug;
 const back='https://domvere.zlabs.com.br'+path+'/subscription';
 return {items:[{id:invoice.id,title:`${invoice.plan_name} — ${tenant.name}`,quantity:1,currency_id:'BRL',unit_price:invoice.amount_cents/100}],external_reference:invoice.id,notification_url:webhookUrl,back_urls:{success:back,pending:back,failure:back},auto_return:'approved',payment_methods:{excluded_payment_types:[{id:'ticket'},{id:'atm'},{id:'debit_card'}],installments:1},metadata:{tenant_id:tenant.id,invoice_id:invoice.id}};
}
export async function verifyMpSignature(headers:Headers,id:string,secret:string){
 if(!secret||!id||id.length>100)return false;
 const parts=Object.fromEntries((headers.get('x-signature')||'').split(',').map(x=>x.trim().split('=')));
 const requestId=headers.get('x-request-id');if(!parts.ts||!/^\d+$/.test(parts.ts)||!requestId||requestId.length>200||! /^[a-f0-9]{64}$/i.test(parts.v1||''))return false;
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 const sig=Uint8Array.from(parts.v1.match(/../g)!.map((h:string)=>parseInt(h,16)));
 return crypto.subtle.verify('HMAC',key,sig,new TextEncoder().encode(`id:${id.toLowerCase()};request-id:${requestId};ts:${parts.ts};`));
}
export function validatePayment(payment:{external_reference?:unknown;currency_id?:unknown;transaction_amount?:unknown;collector_id?:unknown;live_mode?:unknown},invoice:{id:string;amount_cents:number},collector:string){
 return String(payment.external_reference)===invoice.id&&payment.currency_id==='BRL'&&Math.round(Number(payment.transaction_amount)*100)===invoice.amount_cents&&(!collector||String(payment.collector_id)===collector)&&payment.live_mode===true;
}
