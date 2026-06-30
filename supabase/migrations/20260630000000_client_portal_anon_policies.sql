-- Allow anyone (anon or authenticated) to create appointments, read/update plans, and log plan usage
DROP POLICY IF EXISTS "Anon can insert appointments" ON public.appointments;
DROP POLICY IF EXISTS "Anon can read customer_plans" ON public.customer_plans;
DROP POLICY IF EXISTS "Anon can update customer_plans" ON public.customer_plans;
DROP POLICY IF EXISTS "Anon can insert plan_usage_records" ON public.plan_usage_records;

CREATE POLICY "Anyone can insert appointments" ON public.appointments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read customer_plans" ON public.customer_plans FOR SELECT USING (true);
CREATE POLICY "Anyone can update customer_plans" ON public.customer_plans FOR UPDATE USING (true);
CREATE POLICY "Anyone can insert plan_usage_records" ON public.plan_usage_records FOR INSERT WITH CHECK (true);
