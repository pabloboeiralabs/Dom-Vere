CREATE OR REPLACE FUNCTION public.get_customer_history(p_user_id uuid, p_customer_id uuid)
 RETURNS TABLE(type text, amount integer, total numeric, notes text, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT * FROM (
    -- Transactions (purchases, payments)
    SELECT type, amount, total, notes, created_at
    FROM transactions
    WHERE user_id = p_user_id AND customer_id = p_customer_id

    UNION ALL

    -- Plan usage records
    SELECT
      'uso'::text as type,
      1::integer as amount,
      0::numeric as total,
      ('Uso de plano · ' || string_agg(pus.service_name, ', '))::text as notes,
      pur.created_at
    FROM plan_usage_records pur
    JOIN customer_plans cp ON cp.id = pur.customer_plan_id
    LEFT JOIN plan_usage_services pus ON pus.usage_record_id = pur.id
    WHERE cp.user_id = p_user_id AND cp.customer_id = p_customer_id
    GROUP BY pur.id, pur.created_at
  ) sub
  ORDER BY created_at DESC
  LIMIT 50;
$$;