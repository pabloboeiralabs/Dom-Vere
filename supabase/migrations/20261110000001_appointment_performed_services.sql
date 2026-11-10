BEGIN;

CREATE TABLE public.appointment_performed_services (
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  service_id uuid NOT NULL,
  user_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_name text NOT NULL,
  performed_at timestamptz NOT NULL,
  PRIMARY KEY (appointment_id, service_id)
);

CREATE INDEX appointment_performed_services_customer_idx
  ON public.appointment_performed_services (user_id, customer_id, performed_at DESC);

ALTER TABLE public.appointment_performed_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.appointment_performed_services FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.appointment_performed_services TO authenticated;
CREATE POLICY appointment_performed_services_owner_read ON public.appointment_performed_services
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

CREATE FUNCTION public.add_appointment_performed_services(p_appointment_id uuid, p_service_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
BEGIN
  SELECT * INTO appointment FROM public.appointments
  WHERE id = p_appointment_id AND user_id = auth.uid()
    AND status IN ('agendado', 'confirmado', 'concluido') AND customer_id IS NOT NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Atendimento indisponível.';
  END IF;

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

  INSERT INTO public.appointment_performed_services (
    appointment_id, service_id, user_id, customer_id, service_name, performed_at
  )
  SELECT appointment.id, s.id, appointment.user_id, appointment.customer_id, s.name,
    (appointment.date + appointment.start_time) AT TIME ZONE 'America/Sao_Paulo'
  FROM public.services s
  WHERE s.id = ANY(p_service_ids) AND s.user_id = appointment.user_id AND s.active
  ON CONFLICT (appointment_id, service_id) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.add_appointment_performed_services(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_appointment_performed_services(uuid, uuid[]) TO authenticated;

ALTER FUNCTION public.restricted_client_portal_history(uuid) RENAME TO client_portal_history_before_performed_services;
REVOKE ALL ON FUNCTION public.client_portal_history_before_performed_services(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.restricted_client_portal_history(p_customer_id uuid)
RETURNS TABLE(record_type text, record_date timestamptz, description text, amount numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT h.* FROM (
    SELECT * FROM public.client_portal_history_before_performed_services(p_customer_id)
    UNION ALL
    SELECT 'service'::text, s.performed_at, s.service_name, 0::numeric
    FROM public.appointment_performed_services s WHERE s.customer_id = p_customer_id
  ) h
  ORDER BY h.record_date DESC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.restricted_client_portal_history(uuid) FROM PUBLIC, anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
