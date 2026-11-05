type OpeningSettings={secretary_name?:string|null;shop_name?:string|null};
const SESSION_MS=6*60*60*1000;
const normalized=(v:unknown)=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export function secretaryIdentity(settings:OpeningSettings){return JSON.stringify([String(settings.secretary_name||'Lia').trim().slice(0,40),String(settings.shop_name||'barbearia').trim()]);}
export function secretaryOpening({text,reply,settings,customerName,history,memory,now=Date.now()}:{text:string;reply:string;settings:OpeningSettings;customerName?:string;history:{text?:string|null;from_me?:boolean|null;wa_timestamp?:number;created_at?:string}[];memory?:{introduction_at?:string|null;introduction_identity?:string|null}|null;now?:number}){
 const identity=secretaryIdentity(settings),last=history.filter(m=>m.from_me).at(-1);
 const timestamp=Number(last?.wa_timestamp)||new Date(last?.created_at||0).getTime();
 const introduced=new Date(memory?.introduction_at||0).getTime();
 const ongoing=timestamp>0&&now-timestamp<SESSION_MS&&now-timestamp>=0;
 if(ongoing&&introduced>0&&now-introduced<SESSION_MS&&timestamp>=introduced&&memory?.introduction_identity===identity)return{text:reply,introduced:false,identity};
 const name=String(settings.secretary_name||'Lia').trim().slice(0,40),shop=String(settings.shop_name||'barbearia').trim();
 // Preserve a complete, contextual introduction already supplied by the secretary.
 const answer=normalized(reply);
 if(answer.includes(normalized(name))&&answer.includes(normalized(shop))&&/\b(aqui e|sou|me chamo)\b/.test(answer))return{text:reply,introduced:true,identity};
 const first=String(customerName||'').trim().split(/\s+/)[0];
 const hour=Number(new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'numeric',hourCycle:'h23'}).format(new Date(now)));
 const incoming=normalized(text),salutation=/\bbom dia\b/.test(incoming)?'Bom dia':/\bboa tarde\b/.test(incoming)?'Boa tarde':/\bboa noite\b/.test(incoming)?'Boa noite':hour>=5&&hour<12?'Bom dia':hour<18&&hour>=12?'Boa tarde':'Boa noite';
 let body=reply.trim().replace(/^(?:oi+|olá|ola|bom dia|boa tarde|boa noite)(?:\s*,\s*[^!\n,.?]{1,60})?[!,.\s]+/iu,'');
 if(first){const escaped=first.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');body=body.replace(new RegExp('^'+escaped+'[,!:.]\\s*','iu'),'');body=body.replace(/^(?:oi+|olá|ola|bom dia|boa tarde|boa noite)[!,.\s]+/iu,'');body=body.replace(new RegExp('^'+escaped+'[,!:.]\\s*','iu'),'');}
 // Remove an incomplete model introduction, then provide the full configured identity.
 const escapedName=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 body=body.replace(new RegExp('^(?:aqui é|sou|me chamo) (?:a |o )?'+escapedName+'[.!]\\s*','iu'),'');
 body=body?body.charAt(0).toLocaleUpperCase()+body.slice(1):'Como posso te ajudar?';
 return{text:`${salutation}${first?', '+first:''}! Aqui é ${name}, da ${shop}. ${body}`,introduced:true,identity};
}
