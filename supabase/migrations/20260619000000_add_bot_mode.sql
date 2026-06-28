ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS bot_mode text NOT NULL DEFAULT 'ai';
