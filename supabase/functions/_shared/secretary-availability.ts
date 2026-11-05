import{friendlyBookingDate}from'./secretary-intent.ts';
export const firstName=(name:string)=>String(name||'').trim().split(/\s+/)[0];
export function professionalDisplayName(name:string,professionals:{id?:string;name:string}[]){const normalize=(s:string)=>firstName(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const matches=professionals.filter(p=>normalize(p.name)===normalize(name));return matches.length>1?name:firstName(name);}
export function availabilityMessage(slots:{date:string;time:string;professional_id?:string;professional_name?:string}[],professionals:{id?:string;name:string}[],alternative=false){
 const groups=new Map<string,{date:string;name:string;times:Set<string>}>();
 for(const slot of slots){const key=slot.date+':'+slot.professional_id;let group=groups.get(key);if(!group){group={date:slot.date,name:professionalDisplayName(slot.professional_name||professionals.find(p=>p.id===slot.professional_id)?.name||'',professionals),times:new Set()};groups.set(key,group);}group.times.add(slot.time.slice(0,5));}
 const lines=[...groups.values()].map(g=>`${g.name?g.name+' — ':''}${friendlyBookingDate(g.date)}: \n${[...g.times].sort().map(t=>'• '+t).join('\n')}`);
 return `${alternative?'A próxima disponibilidade é:':'Tenho estes horários livres:'}\n${lines.join('\n')}\nQual horário fica melhor para você?`;
}
