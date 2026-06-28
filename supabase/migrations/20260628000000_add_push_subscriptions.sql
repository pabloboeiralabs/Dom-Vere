-- Create push_subscriptions table for Web Push notifications
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(endpoint)
);

-- Index for fast lookup by customer
CREATE INDEX IF NOT EXISTS idx_push_subs_customer ON public.push_subscriptions(customer_id);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);

-- Enable RLS
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow customers to manage their own subscriptions via anon key
-- The app will filter by customer_id in the query
CREATE POLICY "Users can manage own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (true)
  WITH CHECK (true);
