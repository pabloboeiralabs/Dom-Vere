import type {DatabaseClient} from './database-client.ts';
export async function handleChatEvent(db:DatabaseClient,owner:string,body:any,eventType:string) {
 const event=body.data || (typeof body.event==='object'?body.event:body);
 const message=event.Message||event.message||body.message||{};
 const info=event.Info||event.info||{};
 const chat=event.Chat||info.Chat||event.key?.remoteJid||body.remoteJid||body.event?.Chat;
 if(typeof chat==='string' && /@(g\.us|newsletter|broadcast)$/.test(chat))return true;
 const check=(r:any)=>{if(r.error)throw r.error;};
 if(['receipt','status_update','messages.update','messages_update'].includes(eventType)) {
  const receipt=body.event&&typeof body.event==='object'?body.event:event;
  const ids=receipt.MessageIDs||event.MessageIDs||(event.key?.id?[event.key.id]:body.messageId?[body.messageId]:[]);
  const state=String(body.state||receipt.Type||receipt.type||event.status||'').toLowerCase();
  const status=['read','read-self','played'].includes(state)?'read':['delivered','delivery','ack','2'].includes(state)?'delivered':null;
  if(status&&ids.length){let query=db.from('whatsapp_messages').update({delivery_status:status}).eq('user_id',owner).eq('from_me',true).in('wa_message_id',ids.slice(0,200));if(status==='delivered')query=query.neq('delivery_status','read');check(await query);}
  return true;
 }
 if(typeof chat==='string'&&!chat.endsWith('@s.whatsapp.net'))return true;
 if(eventType==='chatpresence') {
  if(chat&&typeof event.State==='string')check(await db.from('crm_leads').update({presence_state:event.State==='composing'&&event.Media==='audio'?'recording':event.State,presence_updated_at:new Date().toISOString()}).eq('user_id',owner).eq('wa_chatid',chat));return true;
 }
 if(message.pollUpdateMessage)return true;
 const reaction=message.reactionMessage;
 if(reaction?.key?.remoteJid && !reaction.key.remoteJid.endsWith("@s.whatsapp.net"))return true;
 if(reaction?.key?.id){
  const{data}=await db.from('whatsapp_messages').select('id,reactions').eq('user_id',owner).eq('wa_message_id',reaction.key.id).maybeSingle();
  if(data){const reactions:Record<string,string>={};if(data.reactions&&typeof data.reactions==='object'&&!Array.isArray(data.reactions))for(const [key,value] of Object.entries(data.reactions))if(typeof value==='string')reactions[key]=value;const sender=info.IsFromMe||event.key?.fromMe?'self':String(info.Sender||event.Sender||'contact');if(reaction.text)reactions[sender]=reaction.text;else delete reactions[sender];check(await db.from('whatsapp_messages').update({reactions}).eq('user_id',owner).eq('id',data.id));}return true;
 }
 if(eventType==='historysync') {
  const history=event.Data||event.data||event;
  const conversations=history.conversations||history.Conversations||[];
  const rows=[];
  for(const conversation of conversations.slice(0,100)){
   const jid=conversation.id||conversation.ID;
   if(typeof jid!=='string'||!/^\d+@s\.whatsapp\.net$/.test(jid))continue;
   for(const wrapper of (conversation.messages||conversation.Messages||[]).slice(0,500)){
    const item=wrapper.message||wrapper.Message||wrapper;const key=item.key||item.Key||{};const content=item.message||item.Message||{};const id=key.id||key.ID;
    if(!id)continue;
    const timestamp=Number(item.messageTimestamp||item.MessageTimestamp||Date.now()/1000)*1000;
    const media=content.imageMessage||content.videoMessage||content.audioMessage||content.documentMessage||content.stickerMessage;
    const type=content.imageMessage?'image':content.videoMessage?'video':content.audioMessage?'audio':content.documentMessage?'document':content.stickerMessage?'sticker':null;
    rows.push({user_id:owner,wa_chatid:jid,wa_message_id:id,text:content.conversation||content.extendedTextMessage?.text||media?.caption||'',from_me:!!(key.fromMe||key.FromMe),wa_timestamp:timestamp,push_name:item.pushName||null,media_type:type,media_url:null,media_mimetype:media?.mimetype||null,media_payload:type?content:null,media_filename:media?.fileName||null});
    if(rows.length>=2000)break;
   }
   if(rows.length>=2000)break;
  }
  // Existing IDs are deliberately left untouched: receipts/edits must not be overwritten by import.
  for(let index=0;index<rows.length;index+=100){const result=await db.from('whatsapp_messages').upsert(rows.slice(index,index+100),{onConflict:'user_id,wa_message_id',ignoreDuplicates:true});if(result.error){for(const row of rows.slice(index,index+100)){const inserted=await db.from('whatsapp_messages').insert(row);if(inserted.error&&inserted.error.code!=='23505')throw inserted.error;}}}
  return true;
 }
 const protocol=message.protocolMessage;
 if(protocol?.key?.remoteJid && !protocol.key.remoteJid.endsWith("@s.whatsapp.net"))return true;
 if(protocol?.key?.id){
  if(!protocol.editedMessage && ![0,'REVOKE','revoke'].includes(protocol.type))return true;
  const update=protocol.editedMessage?{text:protocol.editedMessage.conversation||protocol.editedMessage.extendedTextMessage?.text||'',edited_at:new Date().toISOString()}:{text:'Mensagem apagada',deleted_at:new Date().toISOString(),media_url:null,media_path:null};check(await db.from('whatsapp_messages').update(update).eq('user_id',owner).eq('wa_message_id',protocol.key.id));return true;
 }
 return false;
}
