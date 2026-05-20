CREATE POLICY "Professionals can update own appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (professional_id IN (
  SELECT profiles.professional_id
  FROM profiles
  WHERE profiles.id = auth.uid() AND profiles.professional_id IS NOT NULL
))
WITH CHECK (professional_id IN (
  SELECT profiles.professional_id
  FROM profiles
  WHERE profiles.id = auth.uid() AND profiles.professional_id IS NOT NULL
));