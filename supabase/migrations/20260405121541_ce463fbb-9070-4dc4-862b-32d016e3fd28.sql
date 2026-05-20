ALTER TABLE public.subscription_pricing ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Seed default features for existing plans
UPDATE public.subscription_pricing SET features = '["Gestão de clientes", "Controle de planos", "Relatórios completos"]'::jsonb WHERE type = 'normal' AND features = '[]'::jsonb;
UPDATE public.subscription_pricing SET features = '["Tudo do plano Básico", "Bot de WhatsApp integrado", "Mensagens automáticas"]'::jsonb WHERE type = 'com_bot' AND features = '[]'::jsonb;