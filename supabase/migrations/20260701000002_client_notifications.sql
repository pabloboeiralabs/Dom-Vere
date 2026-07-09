-- In-app notifications for client portal
CREATE TABLE IF NOT EXISTS public.client_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notifs_customer ON public.client_notifications(customer_id, read);
CREATE INDEX IF NOT EXISTS idx_client_notifs_user ON public.client_notifications(user_id);

ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Anyone can read notifications (filtered by customer_id in RPC)
CREATE POLICY "Anyone can read notifications" ON public.client_notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can insert notifications" ON public.client_notifications FOR INSERT WITH CHECK (true);

-- RPC: get unread count
CREATE OR REPLACE FUNCTION public.client_unread_count(p_customer_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public
AS $$
  SELECT COUNT(*) FROM client_notifications WHERE customer_id = p_customer_id AND read = false;
$$;
GRANT EXECUTE ON FUNCTION public.client_unread_count(uuid) TO anon, authenticated;

-- RPC: get notifications
CREATE OR REPLACE FUNCTION public.client_notifications_list(p_customer_id uuid)
RETURNS TABLE(
  id uuid, title text, body text, url text, read boolean, created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public
AS $$
  SELECT id, title, body, url, read, created_at
  FROM client_notifications
  WHERE customer_id = p_customer_id
  ORDER BY created_at DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.client_notifications_list(uuid) TO anon, authenticated;

-- RPC: mark as read
CREATE OR REPLACE FUNCTION public.client_mark_read(p_notification_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO public
AS $$
  UPDATE client_notifications SET read = true WHERE id = p_notification_id;
$$;
GRANT EXECUTE ON FUNCTION public.client_mark_read(uuid) TO anon, authenticated;

-- RPC: mark all as read
CREATE OR REPLACE FUNCTION public.client_mark_all_read(p_customer_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path TO public
AS $$
  UPDATE client_notifications SET read = true WHERE customer_id = p_customer_id AND read = false;
$$;
GRANT EXECUTE ON FUNCTION public.client_mark_all_read(uuid) TO anon, authenticated;
