import {useEffect,useState} from 'react';
import {Pause,Play,Loader2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {supabase} from '@/integrations/supabase/client';
import {toast} from 'sonner';
export function BotPauseButton({canManage}:{canManage:boolean}) {
 const [enabled,setEnabled]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!canManage)return;let active=true;const load=async()=>{const {data,error}=await supabase.functions.invoke('staff-whatsapp',{body:{action:'bot_settings'}});if(!active)return;if(error||data?.error||typeof data?.enabled!=='boolean'){setFailed(true);return;}setEnabled(data.enabled);setFailed(false);};void load();window.addEventListener('focus',load);return()=>{active=false;window.removeEventListener('focus',load);};},[canManage]);
 if(!canManage)return null;
 const toggle=async()=>{setBusy(true);try{const {data,error}=await supabase.functions.invoke('staff-whatsapp',{body:{action:'bot_settings',...(enabled!==null?{enabled:!enabled}:{})}});if(error||data?.error||typeof data?.enabled!=='boolean')throw Error(data?.error||'Não foi possível atualizar o bot.');setEnabled(data.enabled);setFailed(false);if(enabled!==null)toast.success(data.enabled?'Bot retomado':'Bot geral pausado');}catch{toast.error('Não foi possível atualizar o bot. Tente novamente.');}finally{setBusy(false);}};
 return <div className="flex items-center gap-2"><span role="status" className={`text-xs ${enabled===false?'text-amber-600':'text-muted-foreground'}`}>{enabled===null?failed?'Estado indisponível':'Consultando bot…':enabled?'Bot ativo':'Bot pausado'}</span><Button size="sm" variant="outline" disabled={busy||(enabled===null&&!failed)} onClick={()=>void toggle()} title="Pausar ou retomar as respostas automáticas gerais">{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:enabled===false?<Play className="mr-2 h-4 w-4"/>:<Pause className="mr-2 h-4 w-4"/>}{busy?'Aguarde…':enabled===null?'Consultar bot':enabled?'Pausar bot':'Retomar bot'}</Button></div>;
}
