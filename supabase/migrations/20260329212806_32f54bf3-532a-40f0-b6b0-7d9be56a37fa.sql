CREATE POLICY "Admins manage all whatsapp_config"
ON public.whatsapp_config
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));