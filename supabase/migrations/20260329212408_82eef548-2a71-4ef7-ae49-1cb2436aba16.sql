
CREATE OR REPLACE FUNCTION public.get_professional_history(p_user_id uuid, p_professional_id uuid)
RETURNS TABLE(
  record_type text,
  record_date timestamptz,
  customer_name text,
  service_name text,
  amount numeric,
  notes text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT * FROM (
    SELECT
      'appointment'::text as record_type,
      (a.date::text || ' ' || a.start_time::text)::timestamptz as record_date,
      COALESCE(c.name, 'Anônimo') as customer_name,
      COALESCE(s.name, '—') as service_name,
      COALESCE(s.price, 0)::numeric as amount,
      (a.status || CASE WHEN a.notes IS NOT NULL AND a.notes <> '' THEN ' · ' || a.notes ELSE '' END)::text as notes
    FROM appointments a
    LEFT JOIN customers c ON c.id = a.customer_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.user_id = p_user_id AND a.professional_id = p_professional_id

    UNION ALL

    SELECT
      'cut'::text,
      cu.created_at,
      COALESCE(c.name, 'Anônimo'),
      '—',
      0::numeric,
      cu.notes
    FROM cuts cu
    LEFT JOIN customers c ON c.id = cu.customer_id
    WHERE cu.user_id = p_user_id AND cu.professional_id = p_professional_id

    UNION ALL

    SELECT
      'plan_usage'::text,
      pur.created_at,
      COALESCE(cust.name, 'Anônimo'),
      string_agg(pus.service_name, ', '),
      0::numeric,
      ('Uso de plano: ' || COALESCE(pl.name, '—'))::text
    FROM plan_usage_records pur
    JOIN customer_plans cp ON cp.id = pur.customer_plan_id
    LEFT JOIN customers cust ON cust.id = cp.customer_id
    LEFT JOIN plans pl ON pl.id = cp.plan_id
    LEFT JOIN plan_usage_services pus ON pus.usage_record_id = pur.id
    WHERE cp.user_id = p_user_id AND pur.professional_id = p_professional_id
    GROUP BY pur.id, pur.created_at, cust.name, pl.name

    UNION ALL

    SELECT
      'transaction'::text,
      t.created_at,
      COALESCE(c.name, 'Anônimo'),
      '—',
      COALESCE(t.total, 0)::numeric,
      (t.type || CASE WHEN t.notes IS NOT NULL AND t.notes <> '' THEN ' · ' || t.notes ELSE '' END)::text
    FROM transactions t
    LEFT JOIN customers c ON c.id = t.customer_id
    WHERE t.user_id = p_user_id AND t.professional_id = p_professional_id
  ) sub
  ORDER BY sub.record_date DESC
  LIMIT 500;
$$;
