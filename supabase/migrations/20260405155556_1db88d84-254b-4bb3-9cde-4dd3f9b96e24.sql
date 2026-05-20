ALTER TABLE public.subscription_pricing ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '';
ALTER TABLE public.subscription_pricing ADD COLUMN IF NOT EXISTS subtitle text NOT NULL DEFAULT '';

UPDATE public.subscription_pricing SET icon = 'Scissors', subtitle = 'Gestão completa de créditos' WHERE type = 'normal' AND icon = '';
UPDATE public.subscription_pricing SET icon = 'Bot', subtitle = 'Automação via WhatsApp' WHERE type = 'com_bot' AND icon = '';