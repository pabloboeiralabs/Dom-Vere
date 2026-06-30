-- Anon policies for client portal plan bookings
CREATE POLICY "Anon can read customer_plans" ON public.customer_plans FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can update customer_plans" ON public.customer_plans FOR UPDATE TO anon USING (true);
CREATE POLICY "Anon can insert plan_usage_records" ON public.plan_usage_records FOR INSERT TO anon WITH CHECK (true);
