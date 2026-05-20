DROP FUNCTION IF EXISTS public.get_expirations(uuid);

CREATE OR REPLACE FUNCTION public.get_expirations(p_user_id uuid)
 RETURNS TABLE(
   customer_id uuid,
   customer_name text,
   customer_phone text,
   credit_balance integer,
   plan_expires_at date,
   plan_starts_at date,
   total_price numeric,
   paid_amount numeric,
   usage_count integer,
   usage_limit integer,
   plan_name text,
   validity_days integer,
   last_usage_at timestamptz
 )
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.name,
    c.phone,
    c.credit_balance,
    cp.expires_at,
    cp.starts_at,
    cp.total_price,
    cp.paid_amount,
    cp.usage_count,
    cp.usage_limit,
    p.name,
    COALESCE(p.validity_days, 30),
    (SELECT MAX(pur.created_at) FROM plan_usage_records pur WHERE pur.customer_plan_id = cp.id)
  FROM customers c
  INNER JOIN customer_plans cp ON cp.customer_id = c.id AND cp.active = true
  INNER JOIN plans p ON p.id = cp.plan_id
  WHERE c.user_id = p_user_id
  ORDER BY cp.expires_at ASC;
$function$