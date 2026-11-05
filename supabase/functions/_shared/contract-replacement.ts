import{syncCheckout,cancelPendingPix}from'./transparent-checkout.ts';
import{mpRequest}from'./platform-subscriptions.ts';
const parts=(rows:any[])=>rows.filter(i=>i.billing_kind==='sale').sort((a,b)=>a.installment_number-b.installment_number).map(i=>({amount_cents:i.installment_amount_cents,due_date:i.due_date,is_down_payment:!!i.is_down_payment}));
export function contractNeedsReplacement(current:any,rows:any[],draft:any,mode:string){
 if(!current)return false;
 if(current.billing_mode!==mode)return true;
 if(mode==='sale')return JSON.stringify(parts(rows))!==JSON.stringify(draft.installments.map((i:any)=>({amount_cents:i.amount_cents,due_date:i.due_date,is_down_payment:!!i.is_down_payment})))||current.monthly_amount_cents!==(draft.monthly_enabled?draft.monthly_amount_cents:0)||current.monthly_start_date!==(draft.monthly_enabled?draft.monthly_start_date:null);
 return current.amount_cents!==draft.amount_cents||current.next_due_date!==(draft.next_due_date||null);
}
export async function prepareReplacement(db:any,tenant:string){
 const{data:invoices,error}=await db.from('platform_invoices').select('*').eq('tenant_id',tenant).eq('status','open').is('replaced_at',null);if(error)throw Error('Não foi possível consultar as cobranças anteriores.');
 for(const invoice of invoices||[]){
  await prepareInvoiceClosure(db,invoice);
 }
 const{data:subscriptions,error:subError}=await db.from('platform_subscriptions').select('id,provider_id,state').eq('tenant_id',tenant).not('state','in','(cancelled,failed)');if(subError)throw Error('Não foi possível conferir a assinatura anterior.');
 for(const sub of subscriptions||[]){
  if(!sub.provider_id)throw Error('A assinatura anterior ainda está em preparação. Aguarde e tente salvar novamente.');
  const remote=await mpRequest('/preapproval/'+sub.provider_id,{status:'cancelled'},undefined,'PUT');if(remote.status!=='cancelled')throw Error('Aguardando o cancelamento da assinatura anterior.');
  const{error}=await db.from('platform_subscriptions').update({state:'cancelled',provider_updated_at:remote.last_modified||new Date().toISOString()}).eq('id',sub.id);if(error)throw Error('Assinatura cancelada; tente salvar o contrato novamente.');
 }
}

export async function prepareInvoiceClosure(db:any,invoice:any){
  const{data:attempts,error}=await db.from('platform_checkout_attempts').select('*').eq('invoice_id',invoice.id).in('state',['processing','pending','unknown','approved']);if(error)throw Error('Não foi possível consultar os pagamentos.');
  for(const attempt of attempts||[]){
   let result=await syncCheckout(db,invoice,attempt);
   if(attempt.method==='pix'&&result.state==='pending')result=await cancelPendingPix(db,invoice);
   if(!['approved','cancelled','rejected','expired'].includes(result.state))throw Error('Há um pagamento em conferência no Mercado Pago. A troca será liberada após a confirmação, sem descartar um possível recebimento.');
  }
  if(invoice.preference_id){
   const path='/checkout/preferences/'+invoice.preference_id;let preference=await mpRequest(path);
   if(!preference.expires||!preference.expiration_date_to||Date.parse(preference.expiration_date_to)>Date.now())preference=await mpRequest(path,{expires:true,expiration_date_from:new Date(Date.now()-172800000).toISOString(),expiration_date_to:new Date(Date.now()-1000).toISOString()},undefined,'PUT');
   if(!preference.expires||!Number.isFinite(Date.parse(preference.expiration_date_to))||Date.parse(preference.expiration_date_to)>Date.now())throw Error('O link de pagamento anterior ainda está sendo desativado. Tente salvar novamente.');
  }
}
