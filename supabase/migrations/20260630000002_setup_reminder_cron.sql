-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a helper function to invoke edge functions via pg_net
-- This allows scheduled cron jobs to call our Supabase Edge Functions
CREATE OR REPLACE FUNCTION public.invoke_edge_function(function_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_project_url text;
  v_service_key text;
BEGIN
  -- Read from current_setting to get Supabase URL and service role key
  -- These are set as environment variables in the Supabase project
  v_project_url := current_setting('app.supabase_url', true);
  v_service_key := current_setting('app.service_role_key', true);
  
  IF v_project_url IS NULL OR v_service_key IS NULL THEN
    RAISE NOTICE 'Supabase URL or service role key not configured. Skipping edge function invocation: %', function_name;
    RETURN;
  END IF;

  -- Use pg_net to make the HTTP POST request
  PERFORM net.http_post(
    url := v_project_url || '/functions/v1/' || function_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := '{}'::jsonb
  );
END;
$$;

-- Schedule crm-reminder to run every 5 minutes
-- This checks for appointments that need reminders based on customer preferences
SELECT cron.schedule(
  'crm-reminder-every-5min',
  '*/5 * * * *',
  $$SELECT public.invoke_edge_function('crm-reminder');$$
);

-- Schedule send-auto-reminders to run every hour
-- This checks for plan-based return/expiry reminders
SELECT cron.schedule(
  'send-auto-reminders-hourly',
  '0 * * * *',
  $$SELECT public.invoke_edge_function('send-auto-reminders');$$
);

-- Enable pg_net extension if not already enabled (required for HTTP calls)
CREATE EXTENSION IF NOT EXISTS pg_net;