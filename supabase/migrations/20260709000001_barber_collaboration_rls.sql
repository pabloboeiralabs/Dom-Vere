-- Drop the recursive policies
DROP POLICY IF EXISTS "Professionals can read all professionals in the same shop" ON public.professionals;
DROP POLICY IF EXISTS "Professionals can read all schedules in the same shop" ON public.professional_schedules;
DROP POLICY IF EXISTS "Professionals can read all appointments in the same shop" ON public.appointments;

-- Create SECURITY DEFINER function to get the shop owner ID for a professional user
CREATE OR REPLACE FUNCTION public.get_barber_shop_owner_id(p_auth_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pr.user_id 
  FROM public.profiles p 
  JOIN public.professionals pr ON pr.id = p.professional_id 
  WHERE p.id = p_auth_id;
$$;

-- 1. Policy to let professionals read all professionals belonging to the same shop owner
CREATE POLICY "Professionals can read all professionals in the same shop"
ON public.professionals
FOR SELECT
TO authenticated
USING (
  user_id = public.get_barber_shop_owner_id(auth.uid())
);

-- 2. Policy to let professionals read schedules of any professional in the same shop
CREATE POLICY "Professionals can read all schedules in the same shop"
ON public.professional_schedules
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.professionals pr
    WHERE pr.id = professional_schedules.professional_id
      AND pr.user_id = public.get_barber_shop_owner_id(auth.uid())
  )
);

-- 3. Policy to let professionals read appointments of any professional in the same shop
CREATE POLICY "Professionals can read all appointments in the same shop"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.professionals pr
    WHERE pr.id = appointments.professional_id
      AND pr.user_id = public.get_barber_shop_owner_id(auth.uid())
  )
);
