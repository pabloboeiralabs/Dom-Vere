import {secretaryDateIntent} from "./secretary-intent.ts";
export function parseReminderChoice(text:string):number|null{
 const t=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 if(/^(nao|sem lembrete|nao quero|nao precisa|nenhum|nao quero lembrete)[.!\s]*$/.test(t))return 0;
 if(/\b(as|amanha|hoje|remarcar|agendar)\b/.test(t))return null;
 if(/\b(uma?|1) hora e meia\b/.test(t))return 1.5;
 const combined=t.match(/\b(\d{1,2})h([0-5]\d)\b/);if(combined)return Number(combined[1])+Number(combined[2])/60;
 if(/\b(meia hora)\b/.test(t))return .5;
 if(/\b(um|1) dia\b/.test(t))return 24;
 const words:Record<string,number>={uma:1,um:1,duas:2,dois:2,tres:3,quatro:4,seis:6,quinze:15,vinte:20,trinta:30};
 const m=t.match(/\b(\d+(?:[.,]\d+)?|uma|um|duas|dois|tres|quatro|seis|quinze|vinte|trinta)\s*(minutos?|min|horas?|h|dias?)\b/);if(!m)return null;
 const value=words[m[1]]||Number(m[1].replace(',','.'));const hours=m[2].startsWith('min')?value/60:m[2].startsWith('dia')?value*24:value;
 return hours>=5/60&&hours<=168?hours:null;
}
export function reminderLabel(hours:number){return hours<1?`${Math.round(hours*60)} minutos`:hours===1?'1 hora':`${hours} horas`;}

export function parseReminderClock(text:string,now=new Date()){
 const normalized=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(antes|remarcar|agendar|cortar)\b/.test(normalized))return null;
 if(/^\d{1,2}h[0-5]\d$/.test(normalized))return null;
 const clock=normalized.match(/\b([01]?\d|2[0-3])[:h]([0-5]\d)\b/)||normalized.match(/\bas\s+([01]?\d|2[0-3])(?:h|\s*horas?)?\b/);
 if(!clock)return null;const intent=secretaryDateIntent(text,now);const date=intent.date||intent.calendar.today;const time=clock[1].padStart(2,'0')+':'+(clock[2]||'00');const when=date+'T'+time+':00-03:00';
 return{date,time,when,past:new Date(when).getTime()<=now.getTime()};
}
