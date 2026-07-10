-- Migration: ajusta get_plan_notification_targets para notificar exatamente 1 dia antes

CREATE OR REPLACE FUNCTION public.get_plan_notification_targets(
  p_user_id    uuid,
  p_notif_type text,  -- 'return' ou 'expiry'
  p_expiry_days_threshold int DEFAULT 1
)
RETURNS TABLE (
  customer_plan_id  uuid,
  customer_id       uuid,
  customer_name     text,
  customer_phone    text,
  plan_name         text,
  expires_at        date,
  days_until_expiry int,
  return_date       date,
  days_overdue      int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_today date := CURRENT_DATE;
BEGIN
  RETURN QUERY
  SELECT
    cp.id                                              AS customer_plan_id,
    c.id                                               AS customer_id,
    c.name                                             AS customer_name,
    c.phone                                            AS customer_phone,
    p.name                                             AS plan_name,
    cp.expires_at::date                                AS expires_at,
    (cp.expires_at::date - v_today)::int               AS days_until_expiry,

    -- Calcular data de retorno
    (
      COALESCE(
        -- last usage date (BRT = UTC-3)
        (SELECT (MAX(pur.created_at) AT TIME ZONE 'America/Sao_Paulo')::date
         FROM plan_usage_records pur WHERE pur.customer_plan_id = cp.id),
        -- fallback: starts_at
        cp.starts_at::date
      )
      + (FLOOR(COALESCE(p.validity_days, 30)::numeric / GREATEST(COALESCE(p.usage_limit, 1), 1)) * INTERVAL '1 day')
    )::date                                            AS return_date,

    -- dias de atraso no retorno (negativo = futuro)
    (v_today - (
      COALESCE(
        (SELECT (MAX(pur.created_at) AT TIME ZONE 'America/Sao_Paulo')::date
         FROM plan_usage_records pur WHERE pur.customer_plan_id = cp.id),
        cp.starts_at::date
      )
      + (FLOOR(COALESCE(p.validity_days, 30)::numeric / GREATEST(COALESCE(p.usage_limit, 1), 1)) * INTERVAL '1 day')
    )::date)::int                                      AS days_overdue

  FROM public.customer_plans cp
  JOIN public.customers c  ON c.id = cp.customer_id
  JOIN public.plans p      ON p.id = cp.plan_id
  WHERE
    cp.active       = true
    AND c.user_id   = p_user_id
    AND c.phone     IS NOT NULL
    AND c.phone     != ''
    -- Não enviou notificação deste tipo hoje
    AND NOT EXISTS (
      SELECT 1 FROM public.plan_notifications pn
      WHERE pn.customer_plan_id = cp.id
        AND pn.type             = p_notif_type
        AND pn.sent_date        = v_today
    )
    -- Filtro por tipo (Exatamente 1 dia antes)
    AND CASE
      WHEN p_notif_type = 'expiry' THEN
        (cp.expires_at::date - v_today) = 1
      WHEN p_notif_type = 'return' THEN
        -- data_retorno - hoje = 1 (falta 1 dia para a data ideal de retorno)
        ((
          COALESCE(
            (SELECT (MAX(pur.created_at) AT TIME ZONE 'America/Sao_Paulo')::date
             FROM plan_usage_records pur WHERE pur.customer_plan_id = cp.id),
            cp.starts_at::date
          )
          + (FLOOR(COALESCE(p.validity_days, 30)::numeric / GREATEST(COALESCE(p.usage_limit, 1), 1)) * INTERVAL '1 day')
        )::date - v_today) = 1
        AND cp.expires_at::date >= v_today
      ELSE false
    END;
END;
$$;
