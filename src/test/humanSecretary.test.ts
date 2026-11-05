import {fixtureRecord} from './fixtureValues';
import {describe,it,expect,vi} from 'vitest';
import {brasiliaCalendar} from '../../supabase/functions/_shared/secretary-intent';
import {secretaryReply,explicitConfirmation,canonicalPhone} from '../../supabase/functions/_shared/human-secretary';
const service='11111111-1111-4111-8111-111111111111';
function setup(memory:unknown=null){
 const writes:Record<string, unknown>[]=[],rpcs:Record<string, unknown>[]=[];
 const db={rpc:vi.fn<(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message:string}|null}>>(async(name:string,args)=>{rpcs.push({name,args});return{data:name==='secretary_customer'?null:name==='secretary_confirm'?{created:true,date:'2026-12-20',time:'10:00',professional_name:'Profissional',service_name:'Corte'}:name==='secretary_slots'?[{professional_id:service,professional_name:'Profissional',date:'2026-12-20',time:'10:00'}]:{date:'2026-12-20',time:'10:00',professional_name:'Profissional',service_name:'Corte'},error:null};}),from:(table:string)=>{let operation='select';const q={select:()=>q,eq:(_key?:string,_value?:unknown)=>q,update:(data:unknown)=>{operation='update';writes.push({table,data});return q;},upsert:(data:unknown)=>{operation='upsert';writes.push({table,data});return q;},maybeSingle:()=>Promise.resolve({data:memory,error:null}),then:(yes:(value:unknown)=>unknown)=>Promise.resolve({data:operation==='select'?memory:null,error:null}).then(yes)};return q;}};
 const context={db,owner:'owner',chat:'chat',phone:'27999990000',text:'Quero corte amanhã',settings:{secretary_name:'Sofia'},professionals:[],services:[],history:[]};return{context,writes,rpcs};
}
describe('human secretary',()=>{
 it('accepts only a separate explicit confirmation',()=>{
  expect(explicitConfirmation('Confirmo!')).toBe(true);
  expect(explicitConfirmation('Sim')).toBe(true);
  expect(explicitConfirmation('Ta')).toBe(true);
  expect(explicitConfirmation('Tá')).toBe(true);
  expect(explicitConfirmation('ta bom')).toBe(true);
  expect(explicitConfirmation('beleza')).toBe(true);
  expect(explicitConfirmation('blz')).toBe(true);
  expect(explicitConfirmation('fechado')).toBe(true);
  expect(explicitConfirmation('não confirmo')).toBe(false);
  expect(explicitConfirmation('sim, mas quero outro dia')).toBe(false);
  expect(canonicalPhone('(27) 99999-0000')).toBe('5527999990000');
 });
 it('confirms persisted proposals without letting the model perform a mutation',async()=>{const{context,rpcs}=setup({pending:{},customer_name:'Cliente'});context.text='Ta';const complete=vi.fn();const result=await secretaryReply(context,complete);expect(complete).not.toHaveBeenCalled();expect(rpcs.at(-1)?.name).toBe('secretary_confirm');expect(result.text).toContain('Já está na agenda');});
 it('clears an old proposal if the customer changes their request',async()=>{const{context,writes}=setup({pending:{},customer_name:'Cliente'});await secretaryReply(context,async()=>({choices:[{message:{content:'Qual período você prefere?'}}]}));expect(writes.some(w=>fixtureRecord(w.data).pending===null)).toBe(true);});
 it('uses the configured name and only supplied catalogue',async()=>{const{context}=setup();const complete=vi.fn().mockResolvedValue({choices:[{message:{content:'Olá, sou Sofia.'}}]});await secretaryReply(context,complete);expect(complete.mock.calls[0][0][0].content).toContain('Você é Sofia');expect(complete.mock.calls[0][0][0].content).toContain('Nunca revele dados de outras pessoas');});
 it('returns a confirmation question after preparing a booking, without creating it',async()=>{const{context,rpcs}=setup({customer_name:'Cliente Teste',customer_birth_date:'1990-05-15'});const complete=vi.fn().mockResolvedValue({choices:[{message:{tool_calls:[{id:'t',function:{name:'propose_booking',arguments:JSON.stringify({service_id:service,professional_id:service,date:'2026-12-20',time:'10:00'})}}]}}]});const result=await secretaryReply(context,complete);expect(result.text).toContain('Pode ser?');expect(rpcs.some(r=>r.name==='secretary_propose')).toBe(true);expect(rpcs.some(r=>r.name==='secretary_confirm')).toBe(false);});
 it('hands off to a real attendant when requested',async()=>{const{context}=setup();context.text='quero falar com atendente';const result=await secretaryReply(context,async()=>({choices:[{message:{tool_calls:[{id:'t',function:{name:'handoff',arguments:'{}'}}]}}]}));expect(result.handoff).toBe(true);});
 it('binds availability queries to the authenticated shop, ignoring injected owner IDs',async()=>{const{context,rpcs}=setup();const complete=vi.fn().mockResolvedValueOnce({choices:[{message:{tool_calls:[{id:'t',function:{name:'availability',arguments:JSON.stringify({service_id:service,owner:'other-shop'})}}]}}]}).mockResolvedValueOnce({choices:[{message:{content:'Tenho um horário às 10h.'}}]});await secretaryReply(context,complete);expect(fixtureRecord(rpcs.find(r=>r.name==='secretary_slots')?.args).p_owner).toBe('owner');});
});
it('greets a returning customer without repeating earlier handoff or calling AI',async()=>{const{context}=setup({customer_name:'Cliente Teste'});context.text='oi';context.history=[{text:'Vou chamar um atendente',from_me:true}];const complete=vi.fn();const result=await secretaryReply(context,complete);expect(complete).not.toHaveBeenCalled();expect(result.handoff).not.toBe(true);expect(result.text).toContain('Oi, Cliente');});
it('does not let AI hand off an ordinary haircut request without human request',async()=>{const{context}=setup();context.text='quero cortar o cabelo';const result=await secretaryReply(context,async()=>({choices:[{message:{tool_calls:[{id:'t',function:{name:'handoff',arguments:'{}'}}]}}]}));expect(result.handoff).not.toBe(true);});
it('uses the explicit tomorrow preference even when AI selects a different date',async()=>{const{context,rpcs}=setup({customer_name:'Cliente',requested_date:brasiliaCalendar().tomorrow});context.text='às 10h45';await secretaryReply(context,async()=>({choices:[{message:{tool_calls:[{id:'t',function:{name:'propose_booking',arguments:JSON.stringify({service_id:service,professional_id:service,date:'2026-10-19',time:'10:45'})}}]}}]}));const expected=brasiliaCalendar().tomorrow;expect(fixtureRecord(rpcs.find(r=>r.name==='secretary_propose')?.args).p_date).toBe(expected);});
it('accepts an offered alternative only after the customer chooses it',async()=>{const next=brasiliaCalendar().afterTomorrow;const{context,writes,rpcs}=setup({customer_name:'Cliente',requested_date:brasiliaCalendar().tomorrow,offered_date:next,offered_at:new Date().toISOString(),offered_slots:[{time:'10:00:00'}]});context.text='10h pode ser';await secretaryReply(context,async()=>({choices:[{message:{tool_calls:[{id:'t',function:{name:'propose_booking',arguments:JSON.stringify({service_id:service,professional_id:service,date:'2026-10-19',time:'10:00'})}}]}}]}));expect(writes.some(w=>fixtureRecord(w.data).requested_date===next&&fixtureRecord(w.data).offered_date===null)).toBe(true);expect(fixtureRecord(rpcs.find(r=>r.name==='secretary_propose')?.args).p_date).toBe(next);expect(rpcs.some(r=>r.name==='secretary_confirm')).toBe(false);});
it('saves the reminder interval after booking without consulting AI',async()=>{const{context,rpcs}=setup({customer_name:'Cliente',awaiting_reminder:true});context.text='meia hora antes';const complete=vi.fn();const result=await secretaryReply(context,complete);expect(complete).not.toHaveBeenCalled();expect(fixtureRecord(rpcs.find(r=>r.name==='secretary_set_reminder')?.args).p_hours).toBe(.5);expect(result.text).toContain('30 minutos antes');});
it('lets the customer decline a reminder',async()=>{const{context,rpcs}=setup({awaiting_reminder:true});context.text='não precisa';const result=await secretaryReply(context,vi.fn());expect(fixtureRecord(rpcs.find(r=>r.name==='secretary_set_reminder')?.args).p_hours).toBe(0);expect(result.text).toContain('sem lembrete');});

it('prefers the registered customer first name over an old remembered name',async()=>{
 const {context}=setup({customer_name:'Apelido antigo'});context.text='oi';
 context.db.rpc.mockResolvedValue({data:'registered-customer',error:null});
 const original=context.db.from;const filters:unknown[][]=[];
 context.db.from=(table:string)=>{if(table!=='customers')return original(table);
 const q={...original(table),select:()=>q,eq:(key:string,value:string)=>{filters.push([key,value]);return q;},maybeSingle:async()=>({data:{name:'João Silva'},error:null})};return q;};
 const result=await secretaryReply(context,vi.fn());
 expect(result.text).toContain('Oi, João!');expect(result.text).not.toContain('Apelido');
 expect(filters).toContainEqual(['user_id','owner']);expect(filters).toContainEqual(['id','registered-customer']);
});
it('saves a catalogue offer for the sender and sends the client app URL, without activating it',async()=>{
 const {context,rpcs}=setup({customer_name:'Pablo'});context.owner='3ec3d3cd-4788-4d8d-bd70-837fc4eff887';context.text='quero esse plano';
 context.db.rpc.mockImplementation(async(name:string,args:Record<string,unknown>)=>{rpcs.push({name,args});return{data:name==='secretary_customer'?null:{id:'offer',plan_name:'Cabelo 4x',price:145,status:'pending'},error:null};});
 const result=await secretaryReply(context,async()=>({choices:[{message:{tool_calls:[{id:'offer',function:{name:'offer_plan',arguments:JSON.stringify({plan_id:service,customer_id:'outro'})}}]}}]}));
 expect(rpcs.find(r=>r.name==='secretary_offer_plan')?.args).toEqual({p_owner:context.owner,p_phone:'5527999990000',p_plan:service});
 expect(result.text).toContain('https://agendar.zlabs.com.br/cliente');expect(result.text).toContain('R$');expect(result.text).toContain('145');
 expect(rpcs.some(r=>r.name==='shop_activate_plan_offer')).toBe(false);
});
it('does not claim it saved a plan when no persistence tool ran',async()=>{
 const {context}=setup();context.text='quero o plano';
 const result=await secretaryReply(context,async()=>({choices:[{message:{content:'Preparei o plano, confirme no aplicativo.'}}]}));
 expect(result.text).toContain('Ainda não preparei');expect(result.text).not.toContain('Preparei o plano');
});
it('keeps both chosen services in the real proposal even if the model sends only beard',async()=>{
 const brow='22222222-2222-4222-8222-222222222222';
 const {context,rpcs}=setup({requested_services:[service,brow],customer_name:'Cliente Teste',customer_birth_date:'1990-05-15'});
 context.text='às 10h';
 await secretaryReply(context,async()=>({choices:[{message:{tool_calls:[{id:'t',function:{name:'propose_booking',arguments:JSON.stringify({service_id:service,professional_id:service,date:brasiliaCalendar().tomorrow,time:'10:00'})}}]}}]}));
 expect(fixtureRecord(rpcs.find(r=>r.name==='secretary_propose_multi')?.args).p_services).toEqual([service,brow]);
 expect(rpcs.some(r=>r.name==='secretary_propose')).toBe(false);
});
it('asks the eyebrow technique before selecting an arbitrary variant',async()=>{
 const {context}=setup();context.text='Quero barba e sobrancelha';
 context.services=[{id:service,name:'Barba'}];
 const complete=vi.fn();const reply=await secretaryReply(context,complete);
 expect(reply.text).toContain('lâmina ou na pinça');expect(complete).not.toHaveBeenCalled();
});
