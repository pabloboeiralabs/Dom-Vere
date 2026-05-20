
-- Trigger: ao criar agendamento, cria/atualiza lead no CRM
CREATE OR REPLACE FUNCTION public.sync_appointment_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_stage text;
  v_lead_id uuid;
BEGIN
  -- Buscar dados do cliente
  SELECT name, phone INTO v_name, v_phone
  FROM customers WHERE id = NEW.customer_id;

  IF v_name IS NULL THEN
    v_name := 'Cliente';
  END IF;

  -- Mapear status do agendamento para stage do CRM
  v_stage := CASE NEW.status
    WHEN 'agendado'   THEN 'agendado'
    WHEN 'confirmado' THEN 'confirmado'
    WHEN 'concluido'  THEN 'compareceu'
    WHEN 'cancelado'  THEN 'nao_compareceu'
    ELSE 'agendado'
  END;

  -- Procurar lead existente por appointment_id ou customer_id
  SELECT id INTO v_lead_id FROM crm_leads
  WHERE user_id = NEW.user_id
    AND (appointment_id = NEW.id OR (customer_id IS NOT NULL AND customer_id = NEW.customer_id))
  ORDER BY created_at DESC LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    UPDATE crm_leads SET
      stage = v_stage,
      appointment_id = NEW.id,
      customer_id = COALESCE(customer_id, NEW.customer_id),
      phone = COALESCE(phone, v_phone),
      name = COALESCE(NULLIF(name,'Novo Lead'), v_name),
      last_interaction_at = now()
    WHERE id = v_lead_id;
  ELSE
    INSERT INTO crm_leads (user_id, name, phone, stage, customer_id, appointment_id, last_interaction_at)
    VALUES (NEW.user_id, v_name, v_phone, v_stage, NEW.customer_id, NEW.id, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_to_crm ON public.appointments;
CREATE TRIGGER appointments_to_crm
AFTER INSERT OR UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.sync_appointment_to_crm();

-- Trigger: ao registrar atendimento (cuts), marca lead como compareceu
CREATE OR REPLACE FUNCTION public.sync_cut_to_crm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_phone text;
  v_lead_id uuid;
BEGIN
  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, phone INTO v_name, v_phone FROM customers WHERE id = NEW.customer_id;

  SELECT id INTO v_lead_id FROM crm_leads
  WHERE user_id = NEW.user_id AND customer_id = NEW.customer_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    UPDATE crm_leads SET
      stage = 'compareceu',
      last_interaction_at = now()
    WHERE id = v_lead_id;
  ELSE
    INSERT INTO crm_leads (user_id, name, phone, stage, customer_id, last_interaction_at)
    VALUES (NEW.user_id, COALESCE(v_name,'Cliente'), v_phone, 'compareceu', NEW.customer_id, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cuts_to_crm ON public.cuts;
CREATE TRIGGER cuts_to_crm
AFTER INSERT ON public.cuts
FOR EACH ROW EXECUTE FUNCTION public.sync_cut_to_crm();

-- Backfill: criar leads para agendamentos existentes que não têm lead
INSERT INTO crm_leads (user_id, name, phone, stage, customer_id, appointment_id, last_interaction_at, created_at)
SELECT
  a.user_id,
  COALESCE(c.name, 'Cliente'),
  c.phone,
  CASE a.status
    WHEN 'agendado'   THEN 'agendado'
    WHEN 'confirmado' THEN 'confirmado'
    WHEN 'concluido'  THEN 'compareceu'
    WHEN 'cancelado'  THEN 'nao_compareceu'
    ELSE 'agendado'
  END,
  a.customer_id,
  a.id,
  a.created_at,
  a.created_at
FROM appointments a
LEFT JOIN customers c ON c.id = a.customer_id
WHERE NOT EXISTS (
  SELECT 1 FROM crm_leads l
  WHERE l.user_id = a.user_id
    AND (l.appointment_id = a.id OR (a.customer_id IS NOT NULL AND l.customer_id = a.customer_id))
);
