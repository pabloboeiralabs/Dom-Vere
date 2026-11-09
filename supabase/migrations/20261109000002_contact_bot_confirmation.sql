BEGIN;

DO $migration$
DECLARE
  definition text := pg_get_functiondef('public.secretary_confirm_profile_base(uuid,text)'::regprocedure);
  old_condition text := 'WHERE user_id=p_owner AND bot_enabled AND bot_mode=''ai''';
  new_condition text := $condition$WHERE user_id=p_owner AND bot_mode='ai'
   AND (bot_enabled OR EXISTS (
     SELECT 1 FROM public.crm_leads
     WHERE user_id=p_owner AND wa_chatid=p_chat AND bot_enabled_when_global_off
   ))$condition$;
BEGIN
  -- Preserve the deployed confirmation logic and its existing manual pause check.
  IF strpos(definition, old_condition) > 0 THEN
    EXECUTE replace(definition, old_condition, new_condition);
  ELSIF strpos(definition, new_condition) = 0 THEN
    RAISE EXCEPTION 'Unexpected secretary confirmation guard';
  END IF;
END;
$migration$;

COMMIT;
