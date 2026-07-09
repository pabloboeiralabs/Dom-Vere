DROP FUNCTION IF EXISTS public.client_portal_login(text, date);

CREATE OR REPLACE FUNCTION public.client_portal_login(p_phone text, p_birth_date date)
RETURNS TABLE(
  customer_id uuid, user_id uuid, name text, phone text,
  credit_balance integer, shop_name text,
  plan_id uuid, customer_plan_id uuid, plan_name text,
  plan_usage_count integer, plan_usage_limit integer, plan_expires_at date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public
AS $$
  SELECT c.id, c.user_id, c.name, c.phone,
    COALESCE(c.credit_balance, 0),
    COALESCE(s.shop_name, 'Barbearia'),
    cp.plan_id, cp.id, pl.name,
    cp.usage_count, cp.usage_limit, cp.expires_at
  FROM customers c
  LEFT JOIN settings s ON s.user_id = c.user_id
  LEFT JOIN LATERAL (
    SELECT * FROM customer_plans
    WHERE customer_id = c.id AND active = true
    ORDER BY expires_at DESC LIMIT 1
  ) cp ON true
  LEFT JOIN plans pl ON pl.id = cp.plan_id
  WHERE regexp_replace(COALESCE(c.phone,''), E'[^0-9]', '', 'g') = regexp_replace(p_phone, E'[^0-9]', '', 'g')
    AND c.birth_date = p_birth_date
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.client_portal_login(text, date) TO anon, authenticated;
