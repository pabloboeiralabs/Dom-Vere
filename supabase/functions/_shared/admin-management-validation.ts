export const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export function adminUserInput(body:Record<string,unknown>){
 const name=String(body.name||'').trim(),email=String(body.email||'').trim().toLowerCase(),phone=String(body.phone||'').trim();
 if(name.length<2||name.length>150||email.length>254||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)||phone.length>40||(phone&&(!/^\+?[\d\s().-]{8,40}$/.test(phone)||phone.replace(/\D/g,'').length<8||phone.replace(/\D/g,'').length>15)))throw Error('Confira nome, e-mail de acesso e telefone com DDD.');
 return{name,email,phone};
}
export function adminAccessInput(body:Record<string,unknown>){
 const date=(value:unknown)=>{if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('Informe uma data válida.');return value;};
 const tier=body.plan_tier;if(typeof tier!=='string'||!['basico','premium'].includes(tier))throw Error('Selecione Básico ou Premium.');
 const expires=date(body.license_expires_on),temporary=date(body.temporary_access_until),reason=String(body.access_reason||'').trim();
 if(reason.length>500||(temporary&&reason.length<5))throw Error('Informe o motivo da liberação temporária (5 a 500 caracteres).');
 return{tier,expires,temporary,reason};
}
export function safeRecoveryLink(raw:string){const u=new URL(raw);if(!['https://domvere-api.zlabs.com.br','http://kong:8000','http://supabase-kong:8000'].includes(u.origin)||u.pathname!=='/auth/v1/verify'||u.searchParams.get('type')!=='recovery')throw Error('O serviço retornou um link de recuperação inválido.');u.protocol='https:';u.hostname='domvere-api.zlabs.com.br';u.port='';return u.toString();}
