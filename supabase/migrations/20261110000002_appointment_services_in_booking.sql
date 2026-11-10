BEGIN;

CREATE OR REPLACE FUNCTION public.add_appointment_performed_services(p_appointment_id uuid, p_service_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
  combined uuid[];
BEGIN
  SELECT * INTO appointment FROM public.appointments
  WHERE id = p_appointment_id AND user_id = auth.uid()
    AND status IN ('agendado', 'confirmado', 'concluido') AND customer_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atendimento indisponível.'; END IF;
  PERFORM public.assert_shop(appointment.user_id);

  IF coalesce(cardinality(p_service_ids), 0) = 0 OR EXISTS (
    SELECT 1 FROM unnest(p_service_ids) AS picked(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.services s
      WHERE s.id = picked.id AND s.user_id = appointment.user_id AND s.active
    )
  ) THEN
    RAISE EXCEPTION 'Selecione serviços ativos desta barbearia.';
  END IF;

  SELECT array_agg(id ORDER BY first_position) INTO combined
  FROM (
    SELECT id, min(position) AS first_position
    FROM unnest(
      coalesce(nullif(appointment.service_ids, '{}'), array_remove(ARRAY[appointment.service_id], NULL))
      || p_service_ids
    ) WITH ORDINALITY AS picked(id, position)
    GROUP BY id
  ) ordered;
  IF combined IS DISTINCT FROM appointment.service_ids THEN
    UPDATE public.appointments SET service_ids = combined WHERE id = appointment.id;
  END IF;
END;
$$;

-- Merge previous additions where the existing appointment validation accepts the services.
WITH merged AS (
  SELECT a.id, ARRAY(
    SELECT service_id FROM (
      SELECT service_id, min(position) AS first_position
      FROM unnest(coalesce(nullif(a.service_ids, '{}'), array_remove(ARRAY[a.service_id], NULL)) ||
        ARRAY(SELECT s.service_id FROM public.appointment_performed_services s
          WHERE s.appointment_id = a.id ORDER BY s.performed_at, s.service_id))
      WITH ORDINALITY AS picked(service_id, position)
      GROUP BY service_id
    ) ordered ORDER BY first_position
  ) AS service_ids
  FROM public.appointments a
  WHERE a.status IN ('agendado', 'confirmado', 'concluido')
    AND EXISTS (SELECT 1 FROM public.appointment_performed_services s WHERE s.appointment_id = a.id)
)
UPDATE public.appointments a SET service_ids = merged.service_ids
FROM merged WHERE a.id = merged.id AND a.service_ids IS DISTINCT FROM merged.service_ids
  AND cardinality(merged.service_ids) <= 10
  AND NOT EXISTS (
    SELECT 1 FROM unnest(merged.service_ids) AS picked(id)
    WHERE NOT EXISTS (SELECT 1 FROM public.services s WHERE s.id = picked.id AND s.user_id = a.user_id)
  );

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
    WHERE s.customer_id = p_customer_id
      AND NOT coalesce(s.service_id = ANY(a.service_ids), false)
  ) h
  ORDER BY h.record_date DESC
  LIMIT 100;
$$;

COMMIT;
NOTIFY pgrst, 'reload schema';
