import type {PaymentReceipt} from './payment-receipt.ts';
import {billingPhone,evolutionRequest,evolutionConnected,evolutionUrl} from './platform-whatsapp.ts';
import {generateReceipt,receiptCaption,receiptFilename} from './payment-receipt.ts';
export function receiptBase64(bytes:Uint8Array){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
export function receiptPayload(r:PaymentReceipt,number:string,bytes:Uint8Array){return {number,url:receiptBase64(bytes),type:'document',filename:receiptFilename(r),caption:receiptCaption(r.snapshot),id:'ZLR'+r.id.replace(/-/g,''),delay:0,formatJid:true};}
export function receiptSendResult(ok:boolean,status:number,data:{Info?:{ID?:string};key?:{id?:string};id?:string;messageId?:string}|null){const id=data?.Info?.ID||data?.key?.id||data?.id||data?.messageId;return ok&&id?{state:'sent',provider_id:String(id),last_error:null}:!ok&&status>=400&&status<500?{state:'failed',provider_id:null,last_error:'provider_rejected_'+status}:{state:'unknown',provider_id:null,last_error:'provider_outcome_unknown'};}
export async function sendPaymentReceipts(db:any){
 // An interrupted request must be checked by an operator, never blindly retried.
 await db.from('platform_receipt_deliveries').update({state:'unknown',last_error:'interrupted_send',updated_at:new Date().toISOString()}).eq('state','sending').lt('updated_at',new Date(Date.now()-5*60000).toISOString());
 const{data:config,error:configError}=await db.from('platform_whatsapp').select('enabled,instance_token').eq('singleton',true).maybeSingle();
 if(configError||!config?.enabled||!config.instance_token)return 0;
 const{data:jobs,error}=await db.from('platform_receipt_deliveries').select('receipt_id,receipt:platform_payment_receipts(*,invoice:platform_invoices(status,tenant_id,tenant:tenants(contact_phone)))').eq('state','pending').order('updated_at').limit(50);
 if(error)throw error;if(!jobs?.length)return 0;
 try{const connection=await evolutionRequest(config.instance_token,'/instance/status');if(!connection.ok||!evolutionConnected(connection.data))return 0;}catch{return 0;}
 let sent=0,attempts=0;
 for(const job of jobs){
  const r=job.receipt,number=billingPhone(r?.invoice?.tenant?.contact_phone);if(!r||!number||r.invoice.status!=='paid'){await db.from('platform_receipt_deliveries').update({updated_at:new Date().toISOString(),last_error:!number?'missing_phone':'payment_not_confirmed'}).eq('receipt_id',job.receipt_id).eq('state','pending');continue;}
  if(attempts>=1)break;
  // Generate before claiming: local PDF failures cannot cause ambiguous provider retries.
  let bytes:Uint8Array;try{bytes=await generateReceipt(r);}catch{continue;}
  const{data:claimed,error:claimError}=await db.rpc('billing_claim_receipt',{p_receipt:r.id});if(claimError||!claimed)continue;attempts++;
  let result:{state:string;provider_id?:string|null;last_error:string|null}={state:'unknown',provider_id:null,last_error:'network_outcome_unknown'};
  try{
   const{data:invoice,error:readError}=await db.from('platform_invoices').select('status').eq('id',r.invoice_id).maybeSingle();
   if(readError||invoice?.status!=='paid'){result={state:'cancelled',last_error:'payment_not_confirmed'};}
   else{const response=await fetch(evolutionUrl+'/send/media',{method:'POST',headers:{apikey:config.instance_token,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},body:JSON.stringify(receiptPayload(r,number,bytes)),signal:AbortSignal.timeout(25000)});const raw=await response.json().catch(()=>null);result=receiptSendResult(response.ok,response.status,raw?.data??raw);}
  }catch{/* A timeout may have delivered the document. Never repeat automatically. */}
  const{error:saveError}=await db.from('platform_receipt_deliveries').update({...result,updated_at:new Date().toISOString(),...(result.state==='sent'?{sent_at:new Date().toISOString()}:{})}).eq('receipt_id',r.id).eq('state','sending');
  if(!saveError&&result.state==='sent')sent++;
 }
 return sent;
}
