BEGIN;

CREATE FUNCTION public.complete_panel_appointment(
  p_appointment_id uuid, p_service_ids uuid[], p_discount numeric, p_splits jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
  booked_services uuid[];
  subtotal numeric;
  paid numeric;
BEGIN
  SELECT * INTO appointment FROM public.appointments
  WHERE id = p_appointment_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento indisponível.'; END IF;
  PERFORM public.assert_shop(appointment.user_id);
  IF appointment.status = 'concluido' THEN RETURN; END IF;

  booked_services := coalesce(nullif(appointment.service_ids, '{}'), array_remove(ARRAY[appointment.service_id], NULL));
  IF booked_services IS DISTINCT FROM p_service_ids THEN
    RAISE EXCEPTION 'Os serviços do agendamento mudaram. Reabra o pagamento para atualizar.';
  END IF;

  SELECT coalesce(appointment.service_total_price, sum(s.price)) INTO subtotal
  FROM public.services s WHERE s.user_id = appointment.user_id AND s.id = ANY(booked_services);
  IF subtotal IS NULL OR p_discount IS NULL OR NOT (p_discount BETWEEN 0 AND subtotal)
    OR round(p_discount, 2) <> p_discount THEN
    RAISE EXCEPTION 'Informe um desconto válido, até o valor dos serviços.';
  END IF;
  IF jsonb_typeof(p_splits) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Informe o pagamento.'; END IF;
  SELECT sum(s.amount) INTO paid FROM jsonb_to_recordset(p_splits) AS s(amount numeric);
  IF paid IS DISTINCT FROM subtotal - p_discount THEN
    RAISE EXCEPTION 'O valor do pagamento diverge do total atual. Confira o desconto e o valor a cobrar.';
  END IF;

  PERFORM public.complete_barber_appointment(p_appointment_id, booked_services, p_splits);
  UPDATE public.financial_entries
  SET date = (now() AT TIME ZONE 'America/Sao_Paulo')::date,
      description = CASE WHEN p_discount > 0
        THEN concat(description, ' | Desconto: R$ ', to_char(p_discount, 'FM999999990.00'))
        ELSE description END
  WHERE appointment_id = appointment.id AND user_id = appointment.user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_panel_appointment(uuid, uuid[], numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_panel_appointment(uuid, uuid[], numeric, jsonb) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
