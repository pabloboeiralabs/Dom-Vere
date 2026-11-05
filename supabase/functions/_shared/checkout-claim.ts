/** Validate the JSON contract before using a checkout lease for money movement. */
export function checkoutClaim(value: unknown) {
 if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Resposta de pagamento inválida.');
 const claim=value as Record<string,unknown>;
 const raw=claim.attempt;
 if(typeof claim.existing!=='boolean'||raw===null||typeof raw!=='object'||Array.isArray(raw))throw Error('Reserva de pagamento inválida.');
 const attempt=raw as Record<string,unknown>;
 if(typeof attempt.id!=='string'||!attempt.id||typeof attempt.method!=='string'||typeof attempt.state!=='string')throw Error('Reserva de pagamento incompleta.');
 if(attempt.provider_id!=null&&typeof attempt.provider_id!=='string')throw Error('Identificador de pagamento inválido.');
 return {existing:claim.existing,attempt:{...attempt,id:attempt.id,method:attempt.method,state:attempt.state,provider_id:attempt.provider_id as string|null|undefined}};
}
export function preparedOrder(value:unknown){
 if(value===null||typeof value!=='object'||Array.isArray(value))throw Error('Pedido de pagamento inválido.');
 const order=value as Record<string,unknown>;
 if(typeof order.id!=='string'||!order.id||typeof order.status!=='string')throw Error('Pedido de pagamento incompleto.');
 if(order.checkout_url!=null&&typeof order.checkout_url!=='string')throw Error('Endereço de pagamento inválido.');
 return {...order,id:order.id,status:order.status,checkout_url:typeof order.checkout_url==='string'?order.checkout_url:null};
}
