-- Update client_portal_history to include plan usage records
DROP FUNCTION IF EXISTS public.client_portal_history(uuid);

CREATE OR REPLACE FUNCTION public.client_portal_history(p_customer_id uuid)
RETURNS TABLE(
  record_type text,
  record_date timestamptz,
  description text,
  amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT * FROM (
    -- Cortes realizados
    SELECT 'cut'::text AS record_type,
           cu.created_at AS record_date,
           ('Corte com ' || COALESCE(pr.name, '—'))::text AS description,
           0::numeric AS amount
    FROM cuts cu LEFT JOIN professionals pr ON pr.id = cu.professional_id
    WHERE cu.customer_id = p_customer_id

    UNION ALL

    -- Transações (compras, créditos, etc)
    SELECT t.type AS record_type,
           t.created_at AS record_date,
           COALESCE(t.notes, t.type)::text AS description,
           COALESCE(t.total, 0) AS amount
    FROM transactions t
    WHERE t.customer_id = p_customer_id

    UNION ALL

    -- Usos do plano (plan_usage_records)
    SELECT 'plan_usage'::text AS record_type,
           pur.created_at AS record_date,
           ('Uso do plano'
            || CASE WHEN a.date IS NOT NULL THEN ' em ' || a.date::text ELSE '' END
            || CASE WHEN svc.name IS NOT NULL THEN ' - ' || svc.name ELSE '' END
           )::text AS description,
           0::numeric AS amount
    FROM plan_usage_records pur
    LEFT JOIN appointments a ON a.id = pur.appointment_id
    LEFT JOIN services svc ON svc.id = a.service_id
    WHERE pur.customer_plan_id IN (
      SELECT id FROM customer_plans WHERE customer_id = p_customer_id
    )

  ) sub
  ORDER BY sub.record_date DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.client_portal_history(uuid) TO anon, authenticated;
