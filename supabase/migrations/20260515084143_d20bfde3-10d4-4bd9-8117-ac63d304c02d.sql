CREATE POLICY "Owners can view linked professional profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (owner_id = auth.uid());