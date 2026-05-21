
-- 1) Trigger: ao concluir um agendamento, registra a transação de serviço
CREATE OR REPLACE FUNCTION public.sync_appointment_revenue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_name text;
BEGIN
  -- Concluiu agora: insere transação se ainda não existir
  IF NEW.status = 'concluido' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'concluido') THEN
    SELECT COALESCE(price, 0), name INTO v_price, v_name
      FROM services WHERE id = NEW.service_id;

    IF NOT EXISTS (
      SELECT 1 FROM transactions
      WHERE user_id = NEW.user_id AND notes LIKE ('appt:' || NEW.id::text || '%')
    ) THEN
      INSERT INTO transactions (user_id, customer_id, professional_id, type, amount, unit_price, total, notes)
      VALUES (
        NEW.user_id,
        NEW.customer_id,
        NEW.professional_id,
        'service',
        1,
        COALESCE(v_price, 0),
        COALESCE(v_price, 0),
        'appt:' || NEW.id::text || ' · Serviço: ' || COALESCE(v_name, '—')
      );
    END IF;
  END IF;

  -- Saiu de concluido: remove transação
  IF TG_OP = 'UPDATE' AND OLD.status = 'concluido' AND NEW.status <> 'concluido' THEN
    DELETE FROM transactions
    WHERE user_id = NEW.user_id AND notes LIKE ('appt:' || NEW.id::text || '%');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_appointment_revenue ON public.appointments;
CREATE TRIGGER trg_sync_appointment_revenue
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_revenue();

-- 2) get_report_summary: inclui serviços concluídos + vendas de produtos
CREATE OR REPLACE FUNCTION public.get_report_summary(p_user_id uuid, p_from text, p_to text)
RETURNS TABLE(revenue numeric, tx_count bigint, cuts bigint, clients bigint)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT
    (
      (SELECT COALESCE(SUM(total), 0) FROM transactions
        WHERE user_id = p_user_id
          AND type IN ('purchase','service')
          AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz)
      +
      (SELECT COALESCE(SUM(total_price), 0) FROM product_sales
        WHERE user_id = p_user_id
          AND sale_type = 'venda'
          AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz)
    ),
    (
      (SELECT COUNT(*) FROM transactions
        WHERE user_id = p_user_id
          AND type IN ('purchase','service')
          AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz)
      +
      (SELECT COUNT(*) FROM product_sales
        WHERE user_id = p_user_id
          AND sale_type = 'venda'
          AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz)
    ),
    (SELECT COUNT(*) FROM cuts
      WHERE user_id = p_user_id
        AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz),
    (SELECT COUNT(*) FROM customers
      WHERE user_id = p_user_id
        AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz);
$$;

-- 3) get_sales_chart: inclui serviços e produtos
CREATE OR REPLACE FUNCTION public.get_sales_chart(p_user_id uuid, p_from text, p_to text)
RETURNS TABLE(day date, total numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT day, SUM(total) FROM (
    SELECT DATE(created_at) AS day, total
      FROM transactions
      WHERE user_id = p_user_id
        AND type IN ('purchase','service')
        AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz
    UNION ALL
    SELECT DATE(created_at), total_price
      FROM product_sales
      WHERE user_id = p_user_id
        AND sale_type = 'venda'
        AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz
  ) s
  GROUP BY day ORDER BY day;
$$;

-- 4) get_professional_stats: inclui vendas de produtos no faturamento e comissão
CREATE OR REPLACE FUNCTION public.get_professional_stats(p_user_id uuid, p_days integer)
RETURNS TABLE(professional_id uuid, name text, commission_percent integer, total_appointments bigint, completed bigint, revenue numeric)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.name,
    p.commission_percent,
    COALESCE(ap.total_appointments, 0),
    COALESCE(ap.completed, 0),
    COALESCE(ap.revenue, 0) + COALESCE(ps.revenue, 0)
  FROM professionals p
  LEFT JOIN (
    SELECT a.professional_id,
           COUNT(a.id) AS total_appointments,
           COUNT(a.id) FILTER (WHERE a.status = 'concluido') AS completed,
           COALESCE(SUM(CASE WHEN a.status = 'concluido' THEN s.price ELSE 0 END), 0) AS revenue
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.user_id = p_user_id
        AND a.date >= (CURRENT_DATE - (p_days || ' days')::interval)::date
      GROUP BY a.professional_id
  ) ap ON ap.professional_id = p.id
  LEFT JOIN (
    SELECT professional_id, COALESCE(SUM(total_price), 0) AS revenue
      FROM product_sales
      WHERE user_id = p_user_id
        AND sale_type = 'venda'
        AND created_at >= (CURRENT_DATE - (p_days || ' days')::interval)
      GROUP BY professional_id
  ) ps ON ps.professional_id = p.id
  WHERE p.user_id = p_user_id
  ORDER BY (COALESCE(ap.revenue, 0) + COALESCE(ps.revenue, 0)) DESC;
$$;
