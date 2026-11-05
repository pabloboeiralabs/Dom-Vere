import {availabilityMessage,professionalDisplayName} from './secretary-availability.ts';
import {friendlyBookingDate} from './secretary-intent.ts';
export type SlotMenu={id:string;created_at:number;services:string[];slots:any[];intro?:string;alternative?:boolean};
export type SlotSelection={title:string;buttonText:string;footerText:string;sections:{title:string;rows:{title:string;description:string;rowId:string}[]}[];fallbackText:string};
const PAGE_SIZE=21;
export function slotSelectionId(body:any):string{
 const msg=body?.data?.Message||body?.data?.message||body?.message||body;
 let id=msg?.listResponseMessage?.singleSelectReply?.selectedRowId||msg?.listResponseMessage?.singleSelectReply?.selectedRowID||msg?.buttonsResponseMessage?.selectedButtonId||msg?.buttonsResponseMessage?.selectedButtonID||msg?.buttonOrListid||msg?.content?.buttonOrListid||'';
 if(!id){try{const flow=msg?.interactiveResponseMessage?.nativeFlowResponseMessage;const params=flow?.paramsJson||flow?.paramsJSON;if(typeof params==='string'&&params.length<4096)id=JSON.parse(params).id||'';}catch{ /* Best-effort fallback: the caller keeps the last valid state. */ }}
 return typeof id==='string'&&/^hs:[0-9a-f-]{36}:[sp]:\d{1,5}$/.test(id)?id:'';
}
export function parseSlotSelection(text:string,menu:SlotMenu|null|undefined,now=Date.now()){
 const match=/^hs:([0-9a-f-]{36}):([sp]):(\d{1,5})$/.exec(text.trim());if(!match)return null;
 if(!menu||match[1]!==menu.id||!Number.isFinite(menu.created_at)||now-menu.created_at>15*60000||menu.created_at>now||!Array.isArray(menu.slots))return{error:'Essa lista de horários expirou. Me diga o dia novamente para eu consultar os horários atuais.'};
 const index=Number(match[3]);if(match[2]==='p')return index<Math.ceil(menu.slots.length/PAGE_SIZE)?{page:index}:{error:'Essa página de horários não está disponível.'};
 return menu.slots[index]?{slot:menu.slots[index]}:{error:'Esse horário não está nesta lista. Vamos consultar novamente?'};
}
export function slotSelectionPage(menu:SlotMenu,professionals:any[],page=0):{text:string;slotSelection:SlotSelection}{
 const pages=Math.ceil(menu.slots.length/PAGE_SIZE);if(!Number.isInteger(page)||page<0||page>=pages)throw Error('invalid_slot_page');
 const rows=menu.slots.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map((slot,index)=>({title:slot.time.slice(0,5),description:`${professionalDisplayName(slot.professional_name||professionals.find(p=>p.id===slot.professional_id)?.name||'',professionals)} · ${friendlyBookingDate(slot.date)}`.slice(0,72),rowId:`hs:${menu.id}:s:${page*PAGE_SIZE+index}`}));
 if(pages>1)rows.push({title:page+1<pages?'Mais horários':'Primeiros horários',description:'Ver outras opções disponíveis',rowId:`hs:${menu.id}:p:${(page+1)%pages}`});
 const text=(menu.intro?menu.intro+"\n":"")+`Para ${friendlyBookingDate(menu.slots[0].date)}, toque no botão do horário que fica melhor para você.${pages>1?` Página ${page+1} de ${pages}.`:''}`;
 const fallbackHeader=menu.intro?(menu.intro.includes('disponibilidade')||menu.intro.includes('livres:')?'':menu.alternative?'A próxima disponibilidade é:':'Tenho estes horários livres:'):menu.alternative?'A próxima disponibilidade é:':'Tenho estes horários livres:';
 return{text,slotSelection:{title:'Horários disponíveis',buttonText:'Escolher horário',footerText:'O horário será conferido antes de confirmar.',sections:[{title:'Selecione seu horário',rows}],fallbackText:(menu.intro?menu.intro+"\n":"")+availabilityMessage(menu.slots,professionals,fallbackHeader)}};
}
export async function saveSlotSelection(c:{db:any;owner:string;chat:string;professionals:any[]},slots:any[],services:string[],options:{intro?:string;alternative?:boolean}={}):Promise<{text:string;slotSelection?:SlotSelection}>{
 const valid=slots.filter(s=>/^\d{4}-\d{2}-\d{2}$/.test(s.date)&&/^(?:[01]\d|2[0-3]):[0-5]\d/.test(s.time));
 const seen=new Set<string>();const unique=valid.filter(s=>{const key=s.date+':'+s.professional_id+':'+s.time.slice(0,5);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>(a.date+a.time+a.professional_id).localeCompare(b.date+b.time+b.professional_id));
 if(!unique.length)return{text:'Não encontrei horários disponíveis para essa escolha. Quer consultar outro dia?'};
 const menu:SlotMenu={id:crypto.randomUUID(),created_at:Date.now(),services:[...services],slots:unique,...options};
 const{error}=await c.db.from('secretary_memory').update({slot_selection:menu,...(!options.alternative?{requested_date:unique[0].date}:{}),requested_services:services}).eq('user_id',c.owner).eq('chat',c.chat);if(error)throw Error('Não foi possível preparar os horários');return slotSelectionPage(menu,c.professionals);
}
export async function sendSlotSelection(apiUrl:string,token:string,number:string,text:string,selection:SlotSelection,sendText:(text:string)=>Promise<any>,fetcher:typeof fetch=fetch){
 const rows=selection.sections.flatMap(section=>section.rows);
 const cards=[];
 for(let index=0;index<rows.length;index+=3){
  const group=rows.slice(index,index+3);
  cards.push({header:{title:selection.title,subtitle:'Escolha seu horário'},body:{text:group.map(row=>`${row.title} — ${row.description}`).join('\n')},buttons:group.map(row=>({type:'REPLY',displayText:(row.rowId.includes(':s:')?row.title+' · '+row.description.split(' · ')[0]:row.title).slice(0,24),id:row.rowId}))});
 }
 if(!cards.length||cards.length>10)throw Error('invalid_time_cards');
 const res=await fetcher(apiUrl+'/send/carousel',{method:'POST',headers:{'Content-Type':'application/json',apikey:token.split(':').pop()!,token,'User-Agent':'Mozilla/5.0'},body:JSON.stringify({number,body:text.slice(0,1000),footer:selection.footerText,cards}),signal:AbortSignal.timeout(25000)});

 // Only a definitive rejection permits text fallback. Unknown delivery is never repeated.
 let upstreamRejected=false;
 if(res.status===500){const failure=await res.clone().json().catch(()=>null);upstreamRejected=typeof failure?.error==='string'&&/^server returned error 405$/.test(failure.error.trim());}
 if([400,404,405,422].includes(res.status)||upstreamRejected){console.warn('[secretary] Time options rejected',res.status,upstreamRejected?'whatsapp_405':'http_rejected');return sendText(selection.fallbackText);}
 if(!res.ok)throw Error(`WhatsApp time buttons API error: ${res.status}`);
 return res.json().catch(()=>({}));
}

// Enable native sending only after delivery and rendering are verified for this connector.
export function nativeTimeReply<T extends {text:string;slotSelection?:SlotSelection}>(reply:T,enabled=false):T{
 return reply.slotSelection&&!enabled?{...reply,text:reply.slotSelection.fallbackText,slotSelection:undefined}:reply;
}
