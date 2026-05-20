
-- Allow anonymous read access for public booking page
CREATE POLICY "Anon can read settings" ON public.settings FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read professionals" ON public.professionals FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read services" ON public.services FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read professional_schedules" ON public.professional_schedules FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can read appointments" ON public.appointments FOR SELECT TO anon USING (true);
CREATE POLICY "Anon can insert customers" ON public.customers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon can insert appointments" ON public.appointments FOR INSERT TO anon WITH CHECK (true);
