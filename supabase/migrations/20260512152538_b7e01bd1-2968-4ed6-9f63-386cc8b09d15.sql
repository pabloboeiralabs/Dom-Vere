
-- Add reminder template columns to settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS auto_reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_reminder_return_template text DEFAULT 'Oi {nome}! Aqui é da {barbearia} 💈

Notei que faz um tempinho desde seu último corte e amanhã ({data_retorno}) já dá pra dar aquela renovada no visual.

Quer que eu já reserve um horário pra você? É só me chamar! 😉',
  ADD COLUMN IF NOT EXISTS auto_reminder_expiry_template text DEFAULT 'Oi {nome}, tudo bem? 😊

Passando aqui pra te lembrar que amanhã ({data_vencimento}) é o último dia pra você aproveitar seu plano da {barbearia}.

Bora marcar um horário rapidinho? Posso te encaixar! 💈';

-- Reminder log to avoid duplicates
CREATE TABLE IF NOT EXISTS public.reminder_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  customer_plan_id uuid,
  reminder_type text NOT NULL,
  reminder_for date NOT NULL,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (customer_plan_id, reminder_type, reminder_for)
);

ALTER TABLE public.reminder_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own reminder_logs"
  ON public.reminder_logs FOR SELECT
  USING (auth.uid() = user_id);
