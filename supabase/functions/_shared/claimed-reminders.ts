export function claimedReminders(value:unknown){
 if(!Array.isArray(value))throw Error('Fila de lembretes inválida.');
 return value.map(item=>{
  if(item===null||typeof item!=='object'||Array.isArray(item))throw Error('Lembrete inválido.');
  const row=item as Record<string,unknown>;
  if(typeof row.appointment_id!=='string'||typeof row.user_id!=='string'||row.phone!=null&&typeof row.phone!=='string'||row.name!=null&&typeof row.name!=='string')throw Error('Destinatário do lembrete inválido.');
  return {appointment_id:row.appointment_id,user_id:row.user_id,phone:typeof row.phone==='string'?row.phone:null,name:typeof row.name==='string'?row.name:''};
 });
}
export function claimedFollowups(value:unknown){
 if(value==null)return[];
 if(!Array.isArray(value))throw Error('Fila de acompanhamentos inválida.');
 return value.map(item=>{
  if(item===null||typeof item!=='object'||Array.isArray(item))throw Error('Acompanhamento inválido.');
  const row=item as Record<string,unknown>;
  if(typeof row.id!=='string'||typeof row.user_id!=='string'||typeof row.phone!=='string'||typeof row.name!=='string')throw Error('Destinatário do acompanhamento inválido.');
  return {id:row.id,user_id:row.user_id,phone:row.phone,name:row.name};
 });
}
