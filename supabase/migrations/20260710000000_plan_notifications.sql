-- Migration: tabela de controle de notificações de planos
-- Evita enviar duplicatas no mesmo dia/ciclo

CREATE TABLE IF NOT EXISTS public.plan_notifications (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_plan_id uuid NOT NULL REFERENCES public.customer_plans(id) ON DELETE CASCADE,
  type        text NOT NULL CHECK (type IN ('return', 'expiry')),
  sent_at     timestamptz NOT NULL DEFAULT now(),
  sent_date   date NOT NULL DEFAULT CURRENT_DATE
);

-- Index para lookup rápido por plano + tipo + data
CREATE INDEX IF NOT EXISTS idx_plan_notif_plan_type_date
  ON public.plan_notifications(customer_plan_id, type, sent_date);

-- RLS: service_role acessa tudo (usada pela edge function via service key)
ALTER TABLE public.plan_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access"
  ON public.plan_notifications
  USING (true)
  WITH CHECK (true);

-- RPC helper: retorna clientes com plano ativo que precisam de notificação
CREATE OR REPLACE FUNCTION public.get_plan_notification_targets(
  p_user_id    uuid,
  p_notif_type text,  -- 'return' ou 'expiry'
  p_expiry_days_threshold int DEFAULT 3
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
    -- Filtro por tipo
    AND CASE
      WHEN p_notif_type = 'expiry' THEN
        (cp.expires_at::date - v_today) BETWEEN 0 AND p_expiry_days_threshold
      WHEN p_notif_type = 'return' THEN
        -- retorno está no dia ou atrasado, e plano ainda válido
        (v_today - (
          COALESCE(
            (SELECT (MAX(pur.created_at) AT TIME ZONE 'America/Sao_Paulo')::date
             FROM plan_usage_records pur WHERE pur.customer_plan_id = cp.id),
            cp.starts_at::date
          )
          + (FLOOR(COALESCE(p.validity_days, 30)::numeric / GREATEST(COALESCE(p.usage_limit, 1), 1)) * INTERVAL '1 day')
        )::date) >= 0
        AND cp.expires_at::date >= v_today
      ELSE false
    END;
END;
$$;
