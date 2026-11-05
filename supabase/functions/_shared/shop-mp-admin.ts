import type {DatabaseClient} from './database-client.ts';
import{sealShopSecret,openShopSecret,shopMp,shopPaymentWebhook}from'./shop-payments.ts';
export async function manageShopMp(db:DatabaseClient,actor:string,tenant:any,body:any){
 const{data:old,error}=await db.from('shop_mp_connections').select('*').eq('user_id',tenant.owner_id).maybeSingle();if(error)throw Error('Não foi possível consultar a conexão.');
 const status=(row:any)=>({configured:!!row,public_key:row?.public_key||null,enabled:!!row?.enabled,recurring_enabled:!!row?.recurring_enabled,live_mode:row?.live_mode??true,account_label:row?.account_label||'',collector_id:row?.collector_id||'',webhook_url:shopPaymentWebhook+'?tenant='+tenant.id,updated_at:row?.updated_at||null});
 if(body.action==='admin_mp_status')return status(old);
 if(body.action==='admin_mp_save'){
  const publicKey=String(body.public_key||old?.public_key||'').trim();if(publicKey&&!/^(APP_USR|TEST)-[a-zA-Z0-9-]{10,200}$/.test(publicKey))throw Error('Public Key inválida.');
  const inputToken=String(body.access_token||'').trim(),inputSecret=String(body.webhook_secret||'').trim();
  if(inputToken.length>2000||inputSecret.length>512||(inputSecret.length>0&&inputSecret.length<16)||(!old&&(!inputToken||inputSecret.length<16)))throw Error('Informe o Access Token e a chave secreta do webhook da barbearia.');
  if(body.live_mode!==true)throw Error('Este ambiente recebe pagamentos de produção. Use as credenciais de produção da própria barbearia.');
  if(typeof body.enabled!=='boolean'||typeof body.recurring_enabled!=='boolean'||typeof body.live_mode!=='boolean')throw Error('Configuração inválida');
  const token=inputToken||(old?await openShopSecret(old.token_cipher,tenant.owner_id):'');
  const account=await shopMp(token,'/users/me');if(!account.id||account.site_id!=='MLB')throw Error('Use uma conta Mercado Pago do Brasil.');
  if(old&&(String(account.id)!==old.collector_id||body.live_mode!==old.live_mode)){const{count}=await db.from('shop_plan_orders').select('id',{head:true,count:'exact'}).eq('connection_id',old.id);if(count)throw Error('Esta conexão tem histórico de pagamentos. Não é possível trocar a conta recebedora; atualize apenas credenciais da mesma conta.');}
  if(!inputSecret&&!old)throw Error('Informe a chave secreta do webhook.');
  const webhookCipher=inputSecret?await sealShopSecret(inputSecret,tenant.owner_id):old?.webhook_cipher;if(!webhookCipher)throw Error('Chave do webhook indisponível.');
  const row={public_key:publicKey||null,user_id:tenant.owner_id,tenant_id:tenant.id,collector_id:String(account.id),account_label:String(account.nickname||account.email||account.id),token_cipher:await sealShopSecret(token,tenant.owner_id),webhook_cipher:webhookCipher,enabled:body.enabled,recurring_enabled:body.recurring_enabled,live_mode:body.live_mode,updated_at:new Date().toISOString()};
  const{data:saved,error:saveError}=await db.from('shop_mp_connections').upsert(row,{onConflict:'user_id'}).select('*').single();if(saveError)throw Error('Não foi possível salvar a conexão.');
  await db.from('tenant_admin_events').insert({tenant_id:tenant.id,actor_id:actor,action:'payments.connection_updated',details:{enabled:row.enabled,recurring_enabled:row.recurring_enabled,live_mode:row.live_mode,collector_id:row.collector_id}});
  return status(saved);
 }
 throw Error('Operação indisponível');
}
