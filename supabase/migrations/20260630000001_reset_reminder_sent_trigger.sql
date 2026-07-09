-- Update sync_appointment_to_crm to reset reminder_sent = false when rescheduling or creating a new appointment
CREATE OR REPLACE FUNCTION public.sync_appointment_to_crm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_name text;
  v_phone text;
  v_stage text;
  v_lead_id uuid;
BEGIN
  SELECT name, phone INTO v_name, v_phone FROM customers WHERE id = NEW.customer_id;
  IF v_name IS NULL THEN v_name := 'Cliente'; END IF;

  v_stage := CASE NEW.status
    WHEN 'agendado'   THEN 'agendado'
    WHEN 'confirmado' THEN 'confirmado'
    WHEN 'concluido'  THEN 'compareceu'
    WHEN 'cancelado'  THEN 'nao_compareceu'
    WHEN 'no_show'    THEN 'nao_compareceu'
    ELSE 'agendado'
  END;

  -- Look up existing lead by appointment_id, customer_id, OR phone
  SELECT id INTO v_lead_id FROM crm_leads
  WHERE user_id = NEW.user_id
    AND (
      appointment_id = NEW.id
      OR (NEW.customer_id IS NOT NULL AND customer_id = NEW.customer_id)
      OR (v_phone IS NOT NULL AND phone = v_phone)
    )
  ORDER BY created_at DESC LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    UPDATE crm_leads SET
      stage = v_stage,
      appointment_id = NEW.id,
      customer_id = COALESCE(customer_id, NEW.customer_id),
      phone = COALESCE(phone, v_phone),
      name = COALESCE(NULLIF(name,'Novo Lead'), v_name),
      last_interaction_at = now(),
      reminder_sent = CASE WHEN v_stage = 'agendado' THEN false ELSE reminder_sent END
    WHERE id = v_lead_id;
  ELSE
    INSERT INTO crm_leads (user_id, name, phone, stage, customer_id, appointment_id, last_interaction_at)
    VALUES (NEW.user_id, v_name, v_phone, v_stage, NEW.customer_id, NEW.id, now());
  END IF;

  RETURN NEW;
END;
$function$;
