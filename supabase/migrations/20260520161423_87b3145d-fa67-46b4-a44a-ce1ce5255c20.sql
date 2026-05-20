-- Ensure the handle_new_user function is correct and up to date
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into profiles if it doesn't exist
  INSERT INTO public.profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'barbearia')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert into settings if it doesn't exist
  INSERT INTO public.settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Drop trigger if it exists (though previous check showed it didn't)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the trigger on auth.users
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles and settings for existing users
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id, email, raw_user_meta_data FROM auth.users LOOP
    -- Backfill profile
    INSERT INTO public.profiles (id, email, name, role)
    VALUES (
      r.id,
      r.email,
      COALESCE(r.raw_user_meta_data->>'name', split_part(r.email, '@', 1)),
      COALESCE(r.raw_user_meta_data->>'role', 'barbearia')
    )
    ON CONFLICT (id) DO NOTHING;

    -- Backfill settings
    INSERT INTO public.settings (user_id)
    VALUES (r.id)
    ON CONFLICT (user_id) DO NOTHING;
  END LOOP;
END;
$$;
