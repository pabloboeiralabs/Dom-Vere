
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
    SELECT 'cut'::text AS record_type,
           cu.created_at AS record_date,
           ('Corte com ' || COALESCE(pr.name, '—'))::text AS description,
           0::numeric AS amount
    FROM cuts cu LEFT JOIN professionals pr ON pr.id = cu.professional_id
    WHERE cu.customer_id = p_customer_id
    UNION ALL
    SELECT t.type AS record_type,
           t.created_at AS record_date,
           COALESCE(t.notes, t.type)::text AS description,
           COALESCE(t.total, 0) AS amount
    FROM transactions t
    WHERE t.customer_id = p_customer_id
  ) sub
  ORDER BY sub.record_date DESC
  LIMIT 100;
$$;

GRANT EXECUTE ON FUNCTION public.client_portal_history(uuid) TO anon, authenticated;
