import type {DatabaseClient} from './database-client.ts';
import type {Database} from './database-schema.ts';
type Functions=Database['public']['Functions'];
export type SecretarySlot={professional_id:string;professional_name:string;date:string;time:string};
export type SecretaryRecord={error?:string;needs_profile?:boolean;created?:boolean;cancelled?:boolean;date?:string;time?:string;professional_name?:string;service_name?:string;operation?:string;price?:number;status?:string;plan_name?:string};
type SlotRpc='secretary_slots'|'secretary_slots_multi'|'secretary_next_slots'|'secretary_next_slots_multi';
type RecordRpc='secretary_propose'|'secretary_propose_multi'|'secretary_propose_change'|'secretary_confirm'|'secretary_set_reminder'|'secretary_set_reminder_at'|'secretary_offer_plan';
type Name=SlotRpc|RecordRpc|'secretary_customer'|'secretary_has_work_period'|'client_plan_offers_list';
type Reply<N extends Name>=N extends SlotRpc?SecretarySlot[]:N extends 'secretary_customer'?string|null:N extends 'secretary_has_work_period'?boolean:N extends 'client_plan_offers_list'?unknown[]:SecretaryRecord;
function record(value:unknown):Record<string,unknown>{if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Resposta inválida da agenda.');return value as Record<string,unknown>;}
export async function secretaryRpc<N extends Name>(db:DatabaseClient,name:N,args:Functions[N]['Args']):Promise<Reply<N>>{
 const {data,error}=await db.rpc(name,args);if(error)throw Error('Consulta indisponível');let result:unknown=data;
 if(name==='secretary_customer'){if(data!==null&&typeof data!=='string')throw Error('Cadastro inválido.');}
 else if(name==='secretary_has_work_period'){if(typeof data!=='boolean')throw Error('Horário inválido.');}
 else if(name==='client_plan_offers_list'){if(!Array.isArray(data))throw Error('Propostas inválidas.');}
 else if(['secretary_slots','secretary_slots_multi','secretary_next_slots','secretary_next_slots_multi'].includes(name)){
  if(!Array.isArray(data))throw Error('Lista de horários inválida.');result=data.map(value=>{const v=record(value);for(const field of ['professional_id','professional_name','date','time'])if(typeof v[field]!=='string')throw Error('Horário recebido incompleto.');return v;});
 }else{const v=record(data);for(const k of ['error','date','time','professional_name','service_name','operation','status','plan_name'])if(v[k]!=null&&typeof v[k]!=='string')throw Error('Resposta da agenda inconsistente.');for(const k of ['needs_profile','created','cancelled'])if(v[k]!=null&&typeof v[k]!=='boolean')throw Error('Resposta da agenda inconsistente.');if(v.price!=null&&typeof v.price!=='number')throw Error('Valor do plano inválido.');result=v;}
 // Each RPC family is validated above before exposing the name-specific contract.
 return result as Reply<N>;
}
