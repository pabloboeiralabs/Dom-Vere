
-- RPC: Sales transactions with customer names
CREATE OR REPLACE FUNCTION public.get_sales_history(p_user_id uuid)
RETURNS TABLE(id uuid, customer_name text, amount int, total numeric, notes text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT t.id, c.name, t.amount, t.total, t.notes, t.created_at
  FROM transactions t JOIN customers c ON t.customer_id = c.id
  WHERE t.user_id = p_user_id AND t.type = 'purchase'
  ORDER BY t.created_at DESC LIMIT 50;
$$;

-- RPC: Dashboard metrics
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_user_id uuid)
RETURNS TABLE(revenue numeric, active_clients bigint, total_cuts bigint, pending_credits bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    (SELECT COALESCE(SUM(total), 0) FROM transactions WHERE user_id = p_user_id AND type = 'purchase'),
    (SELECT COUNT(*) FROM customers WHERE user_id = p_user_id),
    (SELECT COUNT(*) FROM cuts WHERE user_id = p_user_id),
    (SELECT COALESCE(SUM(credit_balance), 0) FROM customers WHERE user_id = p_user_id);
$$;

-- RPC: Chart data grouped by date
CREATE OR REPLACE FUNCTION public.get_sales_chart(p_user_id uuid, p_from text, p_to text)
RETURNS TABLE(day date, total numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DATE(created_at), SUM(total)
  FROM transactions
  WHERE user_id = p_user_id AND type = 'purchase'
    AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz
  GROUP BY DATE(created_at) ORDER BY DATE(created_at);
$$;

-- RPC: Report cuts by date
CREATE OR REPLACE FUNCTION public.get_cuts_chart(p_user_id uuid, p_from text, p_to text)
RETURNS TABLE(day date, cuts bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DATE(created_at), COUNT(*)
  FROM cuts WHERE user_id = p_user_id
    AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz
  GROUP BY DATE(created_at) ORDER BY DATE(created_at);
$$;

-- RPC: Report new clients by date
CREATE OR REPLACE FUNCTION public.get_new_clients_chart(p_user_id uuid, p_from text, p_to text)
RETURNS TABLE(day date, new_clients bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT DATE(created_at), COUNT(*)
  FROM customers WHERE user_id = p_user_id
    AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz
  GROUP BY DATE(created_at) ORDER BY DATE(created_at);
$$;

-- RPC: Report summary (revenue, count, cuts, clients)
CREATE OR REPLACE FUNCTION public.get_report_summary(p_user_id uuid, p_from text, p_to text)
RETURNS TABLE(revenue numeric, tx_count bigint, cuts bigint, clients bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    (SELECT COALESCE(SUM(total), 0) FROM transactions WHERE user_id = p_user_id AND type = 'purchase' AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz),
    (SELECT COUNT(*) FROM transactions WHERE user_id = p_user_id AND type = 'purchase' AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz),
    (SELECT COUNT(*) FROM cuts WHERE user_id = p_user_id AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz),
    (SELECT COUNT(*) FROM customers WHERE user_id = p_user_id AND created_at >= p_from::timestamptz AND created_at <= p_to::timestamptz);
$$;

-- RPC: Clients list with plan name
CREATE OR REPLACE FUNCTION public.get_clients_with_plans(p_user_id uuid)
RETURNS TABLE(id uuid, name text, phone text, birth_date date, credit_balance int, plan_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.id, c.name, c.phone, c.birth_date, c.credit_balance,
    (SELECT p.name FROM customer_plans cp JOIN plans p ON p.id = cp.plan_id WHERE cp.customer_id = c.id AND cp.active = true LIMIT 1)
  FROM customers c WHERE c.user_id = p_user_id ORDER BY c.name;
$$;

-- RPC: Expirations data
CREATE OR REPLACE FUNCTION public.get_expirations(p_user_id uuid)
RETURNS TABLE(customer_id uuid, customer_name text, customer_phone text, credit_balance int, plan_expires_at date, total_price numeric, paid_amount numeric, usage_count int, usage_limit int, plan_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT c.id, c.name, c.phone, c.credit_balance, cp.expires_at, cp.total_price, cp.paid_amount, cp.usage_count, cp.usage_limit, p.name
  FROM customers c
  INNER JOIN customer_plans cp ON cp.customer_id = c.id AND cp.active = true
  INNER JOIN plans p ON p.id = cp.plan_id
  WHERE c.user_id = p_user_id
  ORDER BY cp.expires_at ASC;
$$;

-- RPC: Plan popularity
CREATE OR REPLACE FUNCTION public.get_plan_popularity(p_user_id uuid)
RETURNS TABLE(plan_id uuid, plan_name text, client_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT cp.plan_id, p.name, COUNT(DISTINCT cp.customer_id)
  FROM customer_plans cp JOIN plans p ON p.id = cp.plan_id
  WHERE cp.user_id = p_user_id AND cp.active = true
  GROUP BY cp.plan_id, p.name
  ORDER BY COUNT(DISTINCT cp.customer_id) DESC;
$$;

-- RPC: Professional stats
CREATE OR REPLACE FUNCTION public.get_professional_stats(p_user_id uuid, p_days int)
RETURNS TABLE(professional_id uuid, name text, commission_percent int, total_appointments bigint, completed bigint, revenue numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT p.id, p.name, p.commission_percent,
    COUNT(a.id),
    COUNT(a.id) FILTER (WHERE a.status = 'concluido'),
    COALESCE(SUM(CASE WHEN a.status = 'concluido' THEN s.price ELSE 0 END), 0)
  FROM professionals p
  LEFT JOIN appointments a ON a.professional_id = p.id AND a.date >= (CURRENT_DATE - (p_days || ' days')::interval)::date
  LEFT JOIN services s ON s.id = a.service_id
  WHERE p.user_id = p_user_id
  GROUP BY p.id, p.name, p.commission_percent
  ORDER BY COALESCE(SUM(CASE WHEN a.status = 'concluido' THEN s.price ELSE 0 END), 0) DESC;
$$;

-- RPC: Admin overview stats
CREATE OR REPLACE FUNCTION public.get_admin_stats()
RETURNS TABLE(total_users bigint, total_shops bigint, total_revenue numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT
    (SELECT COUNT(*) FROM profiles),
    (SELECT COUNT(*) FROM profiles WHERE role = 'barbearia'),
    (SELECT COALESCE(SUM(total), 0) FROM transactions WHERE type = 'purchase');
$$;

-- RPC: Customer plans with plan details
CREATE OR REPLACE FUNCTION public.get_customer_plan_details(p_user_id uuid, p_customer_id uuid)
RETURNS TABLE(id uuid, plan_id uuid, plan_name text, plan_price numeric, usage_count int, usage_limit int, period text, total_price numeric, paid_amount numeric, starts_at date, expires_at date, active boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT cp.id, cp.plan_id, p.name, p.price, cp.usage_count, cp.usage_limit, cp.period, cp.total_price, cp.paid_amount, cp.starts_at, cp.expires_at, cp.active
  FROM customer_plans cp JOIN plans p ON p.id = cp.plan_id
  WHERE cp.user_id = p_user_id AND cp.customer_id = p_customer_id
  ORDER BY cp.active DESC, cp.expires_at DESC;
$$;

-- RPC: Pending usage services for a customer
CREATE OR REPLACE FUNCTION public.get_pending_services(p_user_id uuid, p_customer_id uuid)
RETURNS TABLE(id uuid, customer_plan_id uuid, service_name text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT pus.id, pur.customer_plan_id, pus.service_name, pur.created_at
  FROM plan_usage_services pus
  JOIN plan_usage_records pur ON pus.usage_record_id = pur.id
  JOIN customer_plans cp ON cp.id = pur.customer_plan_id
  WHERE cp.user_id = p_user_id AND cp.customer_id = p_customer_id AND pus.completed = false
  ORDER BY pur.created_at DESC;
$$;

-- RPC: Plan services with names (for plan_services join)
CREATE OR REPLACE FUNCTION public.get_plan_services_with_names(p_plan_ids uuid[])
RETURNS TABLE(plan_id uuid, service_id uuid, service_name text, quantity int)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT ps.plan_id, ps.service_id, s.name, ps.quantity
  FROM plan_services ps JOIN services s ON ps.service_id = s.id
  WHERE ps.plan_id = ANY(p_plan_ids);
$$;

-- RPC: Plan usage dialog - pending services
CREATE OR REPLACE FUNCTION public.get_usage_pending_services(p_customer_plan_id uuid)
RETURNS TABLE(id uuid, usage_record_id uuid, service_id uuid, service_name text, completed boolean, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT pus.id, pus.usage_record_id, pus.service_id, pus.service_name, pus.completed, pur.created_at
  FROM plan_usage_services pus
  JOIN plan_usage_records pur ON pus.usage_record_id = pur.id
  WHERE pur.customer_plan_id = p_customer_plan_id AND pus.completed = false
  ORDER BY pur.created_at DESC;
$$;

-- RPC: Customer transaction history
CREATE OR REPLACE FUNCTION public.get_customer_history(p_user_id uuid, p_customer_id uuid)
RETURNS TABLE(type text, amount int, total numeric, notes text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT type, amount, total, notes, created_at
  FROM transactions
  WHERE user_id = p_user_id AND customer_id = p_customer_id
  ORDER BY created_at DESC LIMIT 50;
$$;

-- RPC: Repair plan transactions
CREATE OR REPLACE FUNCTION public.repair_plan_transactions(p_user_id uuid)
RETURNS int
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  broken RECORD;
  plan_row RECORD;
  cnt int := 0;
BEGIN
  FOR broken IN
    SELECT id, amount, notes FROM transactions
    WHERE user_id = p_user_id AND type = 'purchase'
      AND COALESCE(total, 0) = 0 AND notes LIKE 'Créditos do plano: %'
  LOOP
    SELECT price INTO plan_row FROM plans
    WHERE user_id = p_user_id AND name = trim(replace(broken.notes, 'Créditos do plano: ', ''))
    ORDER BY created_at DESC LIMIT 1;

    IF plan_row IS NOT NULL THEN
      UPDATE transactions SET
        total = plan_row.price,
        unit_price = CASE WHEN broken.amount > 0 THEN plan_row.price / broken.amount ELSE 0 END
      WHERE id = broken.id;
      cnt := cnt + 1;
    END IF;
  END LOOP;
  RETURN cnt;
END;
$$;

-- RPC: Get scheduled appointments with details
CREATE OR REPLACE FUNCTION public.get_appointments_with_details(p_user_id uuid, p_from date, p_to date)
RETURNS TABLE(id uuid, professional_id uuid, customer_id uuid, customer_name text, service_id uuid, service_name text, date date, start_time time, end_time time, status text, notes text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT a.id, a.professional_id, a.customer_id, c.name, a.service_id, s.name, a.date, a.start_time, a.end_time, a.status, a.notes
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.user_id = p_user_id AND a.date >= p_from AND a.date <= p_to
  ORDER BY a.date, a.start_time;
$$;
