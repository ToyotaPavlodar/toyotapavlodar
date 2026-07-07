DROP POLICY IF EXISTS "meta_messaging_monthly_read" ON public.meta_messaging_monthly;
DROP POLICY IF EXISTS "Authenticated read" ON public.meta_messaging_monthly;
DROP POLICY IF EXISTS "read" ON public.meta_messaging_monthly;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='meta_messaging_monthly' AND cmd='SELECT' LOOP
    EXECUTE format('DROP POLICY %I ON public.meta_messaging_monthly', p.policyname);
  END LOOP;
END $$;
CREATE POLICY "Dashboard users can read messaging metrics"
  ON public.meta_messaging_monthly FOR SELECT
  TO authenticated
  USING (public.has_dashboard_access(auth.uid()));