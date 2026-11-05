type CustomerProfile={name?:string|null;birth_date?:string|null}|null;
type ProfileDraft={customer_name?:string|null;customer_birth_date?:string|null;registration_stage?:string|null}|null;
import type {DatabaseClient} from './database-client.ts';
export function registrationName(value:string){
 return String(value||'').normalize('NFC').replace(/\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b/g,'').replace(/\b(?:nasci|nascido|nascida|nascimento|aniversário|aniversario)\b.*$/i,'').replace(/^(?:meu nome [ée]|me chamo|eu sou|sou|nome\s*:|pode me chamar de)\s*/i,'').replace(/[,.\s]+$/,'').replace(/^[,.\s]+/,'').replace(/\s+/g,' ').trim();
}
export function validRegistrationName(value:string,full=true){
 value=value.normalize('NFC');
 if(/^(corte(?: de cabelo)?|barba|cabelo|corte e barba|barba e cabelo)$/i.test(value))return false;
 if(/^(tudo bem|pode ser|bom dia|boa tarde|boa noite|por favor|ok)$/i.test(value))return false;
 if(value.length<2||value.length>150||!/^\p{L}[\p{L}\p{M} '\u2019-]*\p{L}$/u.test(value))return false;
 if(/\b(quero|agendar|agendamento|horário|horario|amanhã|amanha|preço|preco|quanto|cancela|cancelar|obrigado|obrigada|atendente|sim|não|nao|oi|olá|ola)\b/i.test(value))return false;
 const parts=value.split(/\s+/).filter(x=>!['de','da','do','das','dos','e'].includes(x.toLowerCase()));
 return !full||parts.length>=2;
}
export function registrationBirthDate(text:string,today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())){
 const match=text.match(/\b(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}))\b/);
 if(!match)return {found:false,date:null};
 const year=match[1]||match[6],month=(match[2]||match[5]).padStart(2,'0'),day=(match[3]||match[4]).padStart(2,'0'),date=year+'-'+month+'-'+day;
 const parsed=new Date(date+'T12:00:00Z');
 return {found:true,date:Number(year)>=1900&&date<today&&Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===date?date:null};
}
export function profileMissing(customer:CustomerProfile,memory:ProfileDraft){
 if(!customer&&!validRegistrationName(String(memory?.customer_name||'')))return 'name';
 if(!customer?.birth_date&&!registrationBirthDate(String(memory?.customer_birth_date||'')).date)return 'birth_date';
 return null;
}
export function registrationCancelled(text:string){return /^(?:(?:pode\s+)?cancel(?:a|ar)\b|desisti\b|deixa pra l[áa]\b|n[aã]o quero(?:\s+(?:mais|agendar|continuar|me cadastrar|informar))?\b|agora n[aã]o\b|sair\b|n[aã]o[.!\s]*$)/i.test(text.trim());}
export async function collectSecretaryProfile(db:DatabaseClient,owner:string,chat:string,customer:CustomerProfile,memory:ProfileDraft,text?:string){
 const next={...memory};const stage=next.registration_stage;
 if(text!==undefined){
  const birth=registrationBirthDate(text);
  if(birth.found){if(!birth.date)return {text:'Essa data não parece válida. Qual é sua data de nascimento completa? Pode mandar no formato DD/MM/AAAA.'};if(!customer?.birth_date)next.customer_birth_date=birth.date;}
  if(!customer&&stage!=='birth_date'){
   let name=registrationName(text);
   if(stage==='surname'&&validRegistrationName(name,false)){const first=String(next.customer_name||'').split(/\s+/)[0];if(!name.toLowerCase().startsWith(first.toLowerCase()+' '))name=first+' '+name;}
   if(validRegistrationName(name,false))next.customer_name=name;
  }
 }
 let prompt:string|null=null;
 if(!customer&&!validRegistrationName(String(next.customer_name||''))){
  if(validRegistrationName(String(next.customer_name||''),false)){next.registration_stage='surname';prompt='E qual é seu sobrenome, '+String(next.customer_name).split(/\s+/)[0]+'?';}
  else{next.registration_stage='name';prompt='Para finalizar seu agendamento, qual é seu nome e sobrenome?';}
 }else if(!customer?.birth_date&&!registrationBirthDate(String(next.customer_birth_date||'')).date){
  next.registration_stage='birth_date';prompt='Qual é sua data de nascimento? Pode mandar DD/MM/AAAA. Vou deixar no cadastro para seu acesso ao app e os aniversários.';
 }else next.registration_stage=null;
 const update={customer_name:customer?.name||next.customer_name||null,customer_birth_date:customer?.birth_date?null:next.customer_birth_date||null,registration_stage:next.registration_stage,awaiting_reminder:false,updated_at:new Date().toISOString()};
 const{error}=await db.from('secretary_memory').update(update).eq('user_id',owner).eq('chat',chat);if(error)throw Error('Não foi possível preparar seu cadastro');
 return {text:prompt,complete:!prompt};
}
