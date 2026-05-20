
-- Allow professionals to read their own record
CREATE POLICY "Professionals can read own record"
ON public.professionals FOR SELECT
TO authenticated
USING (
  id IN (SELECT professional_id FROM public.profiles WHERE id = auth.uid() AND professional_id IS NOT NULL)
);

-- Allow professionals to read appointments where they are assigned
CREATE POLICY "Professionals can read own appointments"
ON public.appointments FOR SELECT
TO authenticated
USING (
  professional_id IN (SELECT professional_id FROM public.profiles WHERE id = auth.uid() AND professional_id IS NOT NULL)
);

-- Allow professionals to read services (needed for appointment details)
CREATE POLICY "Professionals can read services"
ON public.services FOR SELECT
TO authenticated
USING (true);

-- Allow professionals to read customers (needed for appointment details)
CREATE POLICY "Professionals can read customers"
ON public.customers FOR SELECT
TO authenticated
USING (true);
