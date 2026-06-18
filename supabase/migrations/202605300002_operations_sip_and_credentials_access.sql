-- Operations visibility updates requested for SIP Tracker and portal credentials.

DROP POLICY IF EXISTS "Operations can view assigned SIP events" ON sip_events;
CREATE POLICY "Operations can view SIP events" ON sip_events
  FOR SELECT USING (public.is_admin() OR public.is_operations());

DROP POLICY IF EXISTS "Operations can update assigned SIP followups" ON sip_events;
CREATE POLICY "Operations can update SIP followups" ON sip_events
  FOR UPDATE USING (public.is_admin() OR public.is_operations())
  WITH CHECK (public.is_admin() OR public.is_operations());

DROP POLICY IF EXISTS "Operations can view company credentials" ON company_credentials;
CREATE POLICY "Operations can view company credentials" ON company_credentials
  FOR SELECT USING (public.is_admin() OR public.is_operations());

DROP POLICY IF EXISTS "Operations can update company credentials" ON company_credentials;
CREATE POLICY "Operations can update company credentials" ON company_credentials
  FOR UPDATE USING (public.is_admin() OR public.is_operations())
  WITH CHECK (public.is_admin() OR public.is_operations());
