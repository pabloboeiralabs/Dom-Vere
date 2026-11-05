export const evolutionUrl='https://evolution.zlabs.com.br';
export function billingPhone(input:unknown){if(typeof input!=='string')return '';const digits=input.replace(/\D/g,'');const number=digits.length===10||digits.length===11?'55'+digits:digits;return /^55[1-9][0-9]{9,10}$/.test(number)?number:'';}
export function billingMessage(invoice:{amount_cents:number;due_date:string;is_down_payment?:boolean;billing_kind?:string;installment_number?:number;installment_count?:number;monthly_amount_cents?:number;installment_amount_cents?:number},tenant:{name:string;contact_name:string},url:string|null,today:string){const first=tenant.contact_name.trim().split(/\s+/)[0];const value=(invoice.amount_cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const due=invoice.due_date.split('-').reverse().join('/');return `Oi, ${first}! Tudo bem? Aqui é da Zlabs.\n\nPassando para lembrar ${invoice.is_down_payment?'da entrada da compra do sistema de':invoice.billing_kind==='sale'?`da parcela ${invoice.installment_number}/${invoice.installment_count} da compra do sistema de`:'da mensalidade de'} ${tenant.name}, no valor ${invoice.billing_kind==='sale'&&(invoice.monthly_amount_cents||0)>0?`total de ${value} (parcela de ${((invoice.installment_amount_cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} + mensalidade de ${((invoice.monthly_amount_cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})})`:`de ${value}`}, ${invoice.due_date<today?'que venceu':invoice.due_date===today?'que vence hoje':'com vencimento em'}${invoice.due_date===today?'':` ${due}`}.${url?`\n\nVocê pode pagar ${invoice.billing_kind==='sale'?'por Pix':'por Pix ou cartão'} neste link:\n${url}`:''}\n\nSe precisar de ajuda, é só responder por aqui. Obrigada!`;}
export async function evolutionRequest(token:string,path:string,body?:unknown,method?:string){const r=await fetch(evolutionUrl+path,{method:method||(body?'POST':'GET'),headers:{apikey:token,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});const data=await r.json().catch(()=>null);return {ok:r.ok,status:r.status,data:data?.data??data};}
export function evolutionConnected(input:unknown){const value=input&&typeof input==='object'?input as Record<string,unknown>:{};return (value?.connected??value?.Connected)===true&&(value?.loggedIn??value?.LoggedIn)===true;}
export function evolutionQr(input:unknown){
 const value=input&&typeof input==='object'?input as Record<string,unknown>:{};
 for(const item of [value?.code,value?.qrcode,value?.base64,value?.Code,value?.Qrcode])if(typeof item==='string'&&item.startsWith('data:image/png;base64,'))return item;
 for(const item of [value?.Qrcode,value?.qrcode,value?.base64])if(typeof item==='string'&&item.length<2000000&&/^iVBORw0KGgo[A-Za-z0-9+/=\r\n]+$/.test(item))return 'data:image/png;base64,'+item.replace(/[\r\n]/g,'');
 return null;
}
// Server-side adapter. Private credentials never enter frontend responses.
export function whatsevoConfig(){
 const env=(name:string)=>(typeof Deno==='undefined'?undefined:Deno.env.get(name));
 const url=env('WHATSEVO_API_URL'),key=env('WHATSEVO_API_KEY');
 if(!url&&!key)return null;
 if(!url||!key)throw Error('Complete a configuração privada da API Whats-Evo.');
 const parsed=new URL(url);
 if(parsed.protocol!=='https:'||parsed.hostname!=='whats-evo.zlabs.com.br'||!/^\/t\/[a-f0-9-]{36}\/api\/v1\/?$/.test(parsed.pathname)||parsed.username||parsed.password||parsed.search||parsed.hash)throw Error('Endereço privado do Whats-Evo inválido.');
 return {url:url.replace(/\/$/,''),key};
}
export async function billingWhatsAppRequest(token:string,path:string,body?:{id:string;number:string;text:string;delay?:number;formatJid?:boolean},method?:string){
 const config=whatsevoConfig();
 if(!config)return evolutionRequest(token,path,body,method);
 if(!['/instance/status','/send/text'].includes(path))throw Error('Esta ação é gerenciada no painel Whats-Evo.');
 const send=path==='/send/text';
 if(send&&(!body?.id||typeof body.id!=='string'))throw Error('Identificador único da cobrança obrigatório.');
 const r=await fetch(config.url+(send?'/messages':'/status'),{method:send?'POST':'GET',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','User-Agent':'Zlabs-Finance/1.0',...(send?{'Idempotency-Key':body?.id||''}:{})},...(send?{body:JSON.stringify({number:'+'+String(body?.number).replace(/^\+/,''),text:body?.text,purpose:'billing'})}:{}),signal:AbortSignal.timeout(45000),redirect:'error'});
 const data=await r.json().catch(()=>null);
 if(!send)return {ok:r.ok,status:r.status,data:r.ok?{connected:data?.connected===true,loggedIn:data?.sessionActive===true,rateLimited:data?.canSend===false}:null,provider:'whats-evo'};
 if(r.ok&&data?.state==='sent'&&data?.accepted===true&&typeof data?.id==='string')return {ok:true,status:200,data:{id:data.id},provider:'whats-evo'};
 return {ok:false,status:r.status===202?503:r.status,data:null,provider:'whats-evo'};
}
