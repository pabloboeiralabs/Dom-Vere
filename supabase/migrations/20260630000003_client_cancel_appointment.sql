-- Allow clients (anon) to cancel their own appointments via RPC
CREATE OR REPLACE FUNCTION public.client_portal_cancel_appointment(p_appointment_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid;
  v_professional_id uuid;
  v_date date;
  v_start_time time;
  v_customer_name text;
  v_service_name text;
  v_prof_user_id uuid;
  v_project_url text;
  v_service_key text;
  v_notif_body text;
  v_updated boolean;
BEGIN
  -- Get appointment details before update
  SELECT a.user_id, a.professional_id, a.date, a.start_time, c.name, s.name
  INTO v_user_id, v_professional_id, v_date, v_start_time, v_customer_name, v_service_name
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN services s ON s.id = a.service_id
  WHERE a.id = p_appointment_id;

  -- Update appointment status
  UPDATE appointments
  SET status = 'cancelado'
  WHERE id = p_appointment_id AND status != 'cancelado';
  
  v_updated := FOUND;

  IF v_updated THEN
    -- Get professional's profile user ID
    SELECT id INTO v_prof_user_id FROM profiles WHERE professional_id = v_professional_id LIMIT 1;

    -- Build notification body
    v_notif_body := 'O cliente ' || COALESCE(v_customer_name, 'Não informado') || 
                    ' cancelou o agendamento de ' || COALESCE(v_service_name, 'Não informado') || 
                    ' para o dia ' || to_char(v_date, 'DD/MM') || ' às ' || substring(v_start_time::text from 1 for 5);

    -- Insert in-app notifications
    -- 1. For shop owner
    INSERT INTO client_notifications (customer_id, user_id, title, body, url)
    VALUES (null, v_user_id, '❌ Agendamento Cancelado', v_notif_body, 'https://barber.zlabs.com.br');

    -- 2. For professional (if different)
    IF v_prof_user_id IS NOT NULL AND v_prof_user_id != v_user_id THEN
      INSERT INTO client_notifications (customer_id, user_id, title, body, url)
      VALUES (null, v_prof_user_id, '❌ Agendamento Cancelado', v_notif_body, 'https://barber.zlabs.com.br');
    END IF;

    -- Send Web Push notifications via Edge Function
    v_project_url := current_setting('app.supabase_url', true);
    v_service_key := current_setting('app.service_role_key', true);

    IF v_project_url IS NOT NULL AND v_service_key IS NOT NULL THEN
      -- Push for shop owner
      PERFORM net.http_post(
        url := v_project_url || '/functions/v1/send-push-notification',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'user_id', v_user_id,
          'title', '❌ Agendamento Cancelado',
          'body', v_notif_body,
          'url', 'https://barber.zlabs.com.br'
        )
      );

      -- Push for professional
      IF v_prof_user_id IS NOT NULL AND v_prof_user_id != v_user_id THEN
        PERFORM net.http_post(
          url := v_project_url || '/functions/v1/send-push-notification',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
          ),
          body := jsonb_build_object(
            'user_id', v_prof_user_id,
            'title', '❌ Agendamento Cancelado',
            'body', v_notif_body,
            'url', 'https://barber.zlabs.com.br'
          )
        );
      END IF;
    END IF;
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.client_portal_cancel_appointment(uuid) TO anon, authenticated;
