export type AppointmentActivity={status?:string;cancelled_by_type?:string|null;cancelled_by_name?:string|null;cancelled_at?:string|null;changed_by_name?:string|null;changed_at?:string|null};
export function appointmentActivityLabel(a:AppointmentActivity){
 if(a.status==='cancelado')return a.cancelled_by_name?`Cancelado por: ${a.cancelled_by_name}`:'Cancelamento anterior ao registro de autoria';
 return a.changed_by_name?`Atualizado por: ${a.changed_by_name}`:'';
}
