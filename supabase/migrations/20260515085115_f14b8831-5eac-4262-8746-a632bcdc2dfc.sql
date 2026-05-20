CREATE POLICY "Professionals manage own schedules"
ON public.professional_schedules
FOR ALL
TO authenticated
USING (
  professional_id IN (
    SELECT profiles.professional_id
    FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.professional_id IS NOT NULL
  )
)
WITH CHECK (
  professional_id IN (
    SELECT profiles.professional_id
    FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.professional_id IS NOT NULL
  )
);