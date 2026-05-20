CREATE TABLE public.whatsapp_json_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'carousel',
  json_content jsonb NOT NULL DEFAULT '{}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.whatsapp_json_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own whatsapp_json_configs" ON public.whatsapp_json_configs
  FOR ALL USING (auth.uid() = user_id);