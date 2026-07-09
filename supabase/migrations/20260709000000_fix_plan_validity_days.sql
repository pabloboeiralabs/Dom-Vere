-- Fix plan validity_days based on period
-- A plan's validity_days should reflect the real duration of the period:
-- mensal=30, quinzenal=15, semanal=7, trimestral=90

-- 1. Correct validity_days for existing plans based on their period
UPDATE public.plans
SET validity_days = CASE
  WHEN period = 'mensal'      THEN 30
  WHEN period = 'quinzenal'   THEN 15
  WHEN period = 'semanal'     THEN 7
  WHEN period = 'trimestral'  THEN 90
  ELSE 30
END
WHERE active = true;

-- 2. Recalculate expires_at for active customer_plans based on corrected validity_days
UPDATE public.customer_plans cp
SET expires_at = cp.starts_at + (
  SELECT COALESCE(p.validity_days, 30)
  FROM public.plans p
  WHERE p.id = cp.plan_id
) * INTERVAL '1 day'
WHERE cp.active = true;
