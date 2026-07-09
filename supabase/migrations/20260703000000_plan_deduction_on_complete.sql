-- Plan deduction only when barber marks "concluido"
-- No-show: 2h after appointment, auto-return credit
CREATE OR REPLACE FUNCTION public.handle_plan_on_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_customer_plan_id uuid;
BEGIN
  -- When marked as "concluido": deduct from plan
  IF NEW.status = 'concluido' AND OLD.status != 'concluido' THEN
    IF NEW.notes LIKE '%[PLAN_ID:%' THEN
      v_customer_plan_id := (regexp_match(NEW.notes, '\[PLAN_ID:([0-9a-f\-]+)\]'))[1]::uuid;
      IF v_customer_plan_id IS NOT NULL THEN
        -- Create plan usage record (only if not already exists)
        INSERT INTO plan_usage_records (customer_plan_id, professional_id, appointment_id)
        SELECT v_customer_plan_id, NEW.professional_id, NEW.id
        WHERE NOT EXISTS (
          SELECT 1 FROM plan_usage_records WHERE appointment_id = NEW.id
        );
        -- Increment usage count
        UPDATE customer_plans SET usage_count = usage_count + 1 WHERE id = v_customer_plan_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old trigger if exists and create new one
DROP TRIGGER IF EXISTS trg_plan_on_status_change ON public.appointments;
CREATE TRIGGER trg_plan_on_status_change
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_plan_on_status_change();

-- Update crm-reminder cron to also check for no-shows:
-- This function is called by the cron to auto-cancel no-shows
CREATE OR REPLACE FUNCTION public.check_no_shows()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.id, a.notes
    FROM appointments a
    WHERE a.status = 'agendado'
      AND (a.date + a.start_time::interval) < (now() - interval '2 hours')
      AND a.notes LIKE '%[PLAN_ID:%'
  LOOP
    -- Mark as no-show (cancelado)
    UPDATE appointments SET status = 'cancelado', notes = notes || E'\n[NO-SHOW automático]'
    WHERE id = r.id;
  END LOOP;
END;
$$;
