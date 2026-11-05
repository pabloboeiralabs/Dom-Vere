export class TemporaryAIError extends Error{constructor(public retryAfterSeconds=5){super('IA temporariamente indisponível');this.name='TemporaryAIError';}}
const cooldown=new Map<string,number>();
export async function completeGroq(messages:unknown[],tools:unknown[],key:string,preferred='openai/gpt-oss-120b',transport:typeof fetch=fetch,beforeRequest?:()=>Promise<void>){
 if(!key)throw new Error('Configuração da IA ausente');
 const models=[...new Set([preferred,'openai/gpt-oss-20b'])];
 let transient=false;let retryAfterSeconds=5;
 for(const model of models){
  if((cooldown.get(model)||0)>Date.now()){transient=true;retryAfterSeconds=Math.max(retryAfterSeconds,Math.ceil(((cooldown.get(model)||0)-Date.now())/1000));continue;}
  let response:Response;
  if(beforeRequest)await beforeRequest();
  try{response=await transport('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(14000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','User-Agent':'Mozilla/5.0'},body:JSON.stringify({model,messages,tools,max_tokens:700,parallel_tool_calls:false,temperature:0.3,...(model.startsWith('openai/gpt-oss')?{reasoning_effort:'low'}:{})})});}catch{transient=true;continue;}
  if(response.status===429||response.status>=500){transient=true;const raw=response.headers.get('retry-after');const delay=raw?(Number.isFinite(Number(raw))?Number(raw):Math.max(0,(Date.parse(raw)-Date.now())/1000)):5;const wait=Number.isFinite(delay)?Math.min(86400,Math.max(5,delay)):5;retryAfterSeconds=Math.max(retryAfterSeconds,wait);cooldown.set(model,Date.now()+wait*1000);await response.body?.cancel();console.warn('[AI] Temporary provider failure',response.status,model);continue;}
  if(!response.ok){await response.body?.cancel();throw new Error(`Falha na configuração da IA (${response.status})`);}
  const result=await response.json();const message=result.choices?.[0]?.message;
  if(!message?.content&&!message?.tool_calls?.length){transient=true;continue;}
  return result;
 }
 if(transient)throw new TemporaryAIError(retryAfterSeconds);throw new Error('IA indisponível');
}
