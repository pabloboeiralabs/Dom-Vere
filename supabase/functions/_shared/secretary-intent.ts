export function brasiliaCalendar(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const take=(type:string)=>parts.find(p=>p.type===type)?.value;
 const today=`${take('year')}-${take('month')}-${take('day')}`;
 const plus=(n:number)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 return{today,tomorrow:plus(1),afterTomorrow:plus(2),plus};
}
export function secretaryDateIntent(text:string,now=new Date()){
 const t=text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();const calendar=brasiliaCalendar(now);
 let date:string|undefined,period:string|undefined;
 if(/\bdepois de amanha\b/.test(t))date=calendar.afterTomorrow;
 else if(/\bamanha\b/.test(t))date=calendar.tomorrow;
 else if(/\bhoje\b/.test(t))date=calendar.today;
 if(/\b(de|pela|na|a) manha\b|\bperiodo da manha\b/.test(t))period='morning';
 if(/\b(de|pela|na|a) tarde\b|\bperiodo da tarde\b/.test(t))period='afternoon';
 if(/\b(de|pela|na|a) noite\b/.test(t))period='evening';
 const ambiguous=!date&&!period&&/\b(pra|para) manha\b/.test(t);
 const iso=t.match(/\b(\d{4}-\d{2}-\d{2})\b/),short=t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
 if(iso)date=iso[1];else if(short)date=`${short[3]||calendar.today.slice(0,4)}-${short[2].padStart(2,'0')}-${short[1].padStart(2,'0')}`;
 if(!date){const days=['domingo','segunda','terca','quarta','quinta','sexta','sabado'];const day=days.findIndex(d=>new RegExp(`\\b${d}(?:-feira)?\\b`).test(t));if(day>=0){let offset=(day-new Date(calendar.today+'T12:00:00Z').getUTCDay()+7)%7;if(offset===0)offset=7;date=calendar.plus(offset);}}
 return{date,period,ambiguous,calendar};
}
export function friendlyBookingDate(date:string,now=new Date()){
 const calendar=brasiliaCalendar(now);const weekday=new Intl.DateTimeFormat('pt-BR',{weekday:'long',timeZone:'America/Sao_Paulo'}).format(new Date(date+'T12:00:00Z'));
 const day=date.slice(8,10)+'/'+date.slice(5,7);
 return`${date===calendar.tomorrow?'amanhã, ':date===calendar.today?'hoje, ':''}${weekday} (${day})`;
}
