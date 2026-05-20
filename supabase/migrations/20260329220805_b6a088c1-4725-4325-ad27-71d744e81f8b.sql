CREATE POLICY "Authenticated can insert customers via booking"
ON public.customers FOR INSERT TO authenticated
WITH CHECK (true);

CREATE POLICY "Anon can read customers"
ON public.customers FOR SELECT TO anon
USING (true);