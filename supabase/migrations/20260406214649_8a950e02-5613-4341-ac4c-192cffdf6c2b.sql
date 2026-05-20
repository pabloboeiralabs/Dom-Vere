
-- crm_leads table
CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_id uuid,
  wa_chatid text,
  phone text,
  name text NOT NULL DEFAULT 'Novo Lead',
  stage text NOT NULL DEFAULT 'novo',
  notes text,
  appointment_id uuid,
  last_interaction_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  current_stage integer DEFAULT 1,
  reminder_sent boolean DEFAULT false,
  bot_paused boolean DEFAULT false,
  bot_msg_count integer DEFAULT 0
);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own crm_leads" ON public.crm_leads FOR ALL USING (auth.uid() = user_id);

-- bot_conversation_stages table
CREATE TABLE public.bot_conversation_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stage_order integer NOT NULL,
  name text NOT NULL,
  instruction text NOT NULL,
  active boolean DEFAULT true,
  skip_if_registered boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.bot_conversation_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bot_conversation_stages" ON public.bot_conversation_stages FOR ALL USING (auth.uid() = user_id);

-- bot_trigger_responses table
CREATE TABLE public.bot_trigger_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trigger_word text NOT NULL,
  response_text text NOT NULL,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.bot_trigger_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own bot_trigger_responses" ON public.bot_trigger_responses FOR ALL USING (auth.uid() = user_id);

-- Add columns to settings
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS bot_prompt text,
  ADD COLUMN IF NOT EXISTS bot_msg_limit integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS bot_trigger_words text[] DEFAULT ARRAY['oi','olá','ola','bom dia','boa tarde','boa noite','hey','eai','e aí','eae','hello','hi'],
  ADD COLUMN IF NOT EXISTS bot_human_transfer_msg text DEFAULT 'Vou te transferir para um atendente humano! Aguarde um momento 👋',
  ADD COLUMN IF NOT EXISTS clinic_address text,
  ADD COLUMN IF NOT EXISTS clinic_lat text,
  ADD COLUMN IF NOT EXISTS clinic_lng text;

-- Enable realtime for crm_leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.crm_leads;
