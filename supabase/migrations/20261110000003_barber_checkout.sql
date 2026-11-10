BEGIN;

CREATE FUNCTION public.complete_barber_appointment(p_appointment_id uuid, p_service_ids uuid[], p_splits jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
  entry_id uuid;
  register_id uuid;
  split_id uuid;
  split record;
  total numeric;
  method text;
  client_name text;
  barber_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Acesso negado.'; END IF;
  SELECT * INTO appointment FROM public.appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento indisponível.'; END IF;
  PERFORM public.assert_shop(appointment.user_id);
  IF appointment.status = 'concluido' THEN RETURN; END IF;
  IF appointment.status NOT IN ('agendado', 'confirmado') THEN RAISE EXCEPTION 'Atendimento indisponível.'; END IF;

  IF coalesce(cardinality(p_service_ids), 0) NOT BETWEEN 1 AND 10 OR
    (SELECT count(*) FROM public.services s WHERE s.user_id = appointment.user_id AND s.id = ANY(p_service_ids)) <> cardinality(p_service_ids)
  THEN RAISE EXCEPTION 'Selecione de 1 a 10 serviços válidos da barbearia.'; END IF;

  IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Informe o pagamento.'; END IF;
  IF jsonb_array_length(p_splits) NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'Informe o pagamento.'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_splits) AS s(payment_method text, amount numeric, cash_received numeric)
    WHERE s.payment_method IS NULL OR s.payment_method NOT IN ('pix','dinheiro','cartao_credito','cartao_debito','outro')
      OR s.amount IS NULL OR NOT (s.amount BETWEEN 0 AND 99999999.99) OR round(s.amount, 2) <> s.amount
      OR (s.payment_method = 'dinheiro' AND s.cash_received IS NOT NULL
        AND (NOT (s.cash_received BETWEEN s.amount AND 99999999.99) OR round(s.cash_received, 2) <> s.cash_received))
  ) THEN RAISE EXCEPTION 'Confira os valores e as formas de pagamento.'; END IF;

  SELECT sum(s.amount) INTO total FROM jsonb_to_recordset(p_splits) AS s(amount numeric);
  IF total > 99999999.99 THEN RAISE EXCEPTION 'Valor total inválido.'; END IF;
  method := p_splits->0->>'payment_method';

  UPDATE public.appointments SET service_ids = p_service_ids, status = 'concluido'
  WHERE id = appointment.id RETURNING * INTO appointment;

  SELECT name INTO client_name FROM public.customers WHERE id = appointment.customer_id;
  SELECT name INTO barber_name FROM public.professionals WHERE id = appointment.professional_id;
  UPDATE public.financial_entries
  SET amount = total, payment_method = method,
      description = concat('Serviço: ', appointment.service_names, ' | Cliente: ', coalesce(client_name, 'Anônimo'),
        ' | Profissional: ', coalesce(barber_name, '—'))
  WHERE appointment_id = appointment.id AND user_id = appointment.user_id
  RETURNING id INTO STRICT entry_id;

  SELECT id INTO register_id FROM public.cash_register_sessions
  WHERE user_id = appointment.user_id AND status = 'open' FOR UPDATE;
  FOR split IN SELECT s.payment_method, s.amount,
      CASE WHEN s.payment_method = 'dinheiro' THEN coalesce(s.cash_received, s.amount) END AS received
    FROM jsonb_to_recordset(p_splits) AS s(payment_method text, amount numeric, cash_received numeric)
  LOOP
    INSERT INTO public.payment_splits (financial_entry_id, payment_method, amount, cash_received, cash_change)
    VALUES (entry_id, split.payment_method, split.amount, split.received, split.received - split.amount)
    RETURNING id INTO split_id;
    IF register_id IS NOT NULL AND split.payment_method = 'dinheiro' AND split.received > 0 THEN
      INSERT INTO public.cash_movements
        (cash_register_id, user_id, type, category, amount, payment_method, payment_split_id, financial_entry_id, description)
      VALUES (register_id, appointment.user_id, 'entrada', 'recebimento', split.received, 'dinheiro', split_id, entry_id,
        concat('Recebido de ', coalesce(client_name, 'Anônimo'), ' · ', appointment.service_names));
      IF split.received > split.amount THEN
        INSERT INTO public.cash_movements
          (cash_register_id, user_id, type, category, amount, payment_method, payment_split_id, financial_entry_id, description)
        VALUES (register_id, appointment.user_id, 'saida', 'troco', split.received - split.amount, 'dinheiro', split_id, entry_id,
          concat('Troco para ', coalesce(client_name, 'Anônimo')));
      END IF;
    END IF;
  END LOOP;
  IF register_id IS NOT NULL THEN
    UPDATE public.cash_register_sessions
    SET expected_closing_balance = opening_balance + (
      SELECT coalesce(sum(CASE WHEN type = 'entrada' THEN amount ELSE -amount END), 0)
      FROM public.cash_movements WHERE cash_register_id = register_id
    )
    WHERE id = register_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_barber_appointment(uuid, uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_barber_appointment(uuid, uuid[], jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.restricted_client_portal_history(p_customer_id uuid)
RETURNS TABLE(record_type text, record_date timestamptz, description text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT h.* FROM (
    SELECT * FROM public.client_portal_history_before_performed_services(p_customer_id)
    UNION ALL
    SELECT 'service'::text, (a.date + a.start_time) AT TIME ZONE 'America/Sao_Paulo',
      a.service_names, 0::numeric
    FROM public.appointments a WHERE a.customer_id = p_customer_id
      AND a.status = 'concluido' AND a.service_names IS NOT NULL
    UNION ALL
    SELECT 'service'::text, s.performed_at, s.service_name, 0::numeric
    FROM public.appointment_performed_services s
    JOIN public.appointments a ON a.id = s.appointment_id
    WHERE s.customer_id = p_customer_id AND a.status = 'concluido'
      AND NOT coalesce(s.service_id = ANY(a.service_ids), false)
  ) h
  ORDER BY h.record_date DESC
  LIMIT 100;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
