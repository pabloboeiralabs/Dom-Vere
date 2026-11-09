BEGIN;

ALTER TABLE public.crm_leads ADD COLUMN bot_enabled_when_global_off boolean NOT NULL DEFAULT false;

CREATE FUNCTION public.set_contact_bot_override(p_chat text, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner uuid := auth.uid();
  v_lead uuid;
BEGIN
  IF v_owner IS NULL OR p_chat IS NULL OR p_chat !~ '^[0-9]{7,15}@s\.whatsapp\.net$' OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Contato ou estado inválido';
  END IF;

  SELECT id INTO v_lead
  FROM public.ensure_whatsapp_lead(v_owner, p_chat, split_part(p_chat, '@', 1));

  UPDATE public.crm_leads
  SET bot_enabled_when_global_off = p_enabled,
      bot_paused = CASE WHEN p_enabled THEN false ELSE bot_paused END,
      manual_started_at = CASE WHEN p_enabled THEN NULL ELSE manual_started_at END,
      manual_finished_at = CASE WHEN p_enabled THEN NULL ELSE manual_finished_at END,
      assigned_staff_id = CASE WHEN p_enabled THEN NULL ELSE assigned_staff_id END
  WHERE id = v_lead AND user_id = v_owner;
END;
$$;

REVOKE ALL ON FUNCTION public.set_contact_bot_override(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_contact_bot_override(text, boolean) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
