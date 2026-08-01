REVOKE INSERT, UPDATE, DELETE ON public.meta_messaging_monthly FROM anon, authenticated;
GRANT SELECT ON public.meta_messaging_monthly TO authenticated;
GRANT ALL ON public.meta_messaging_monthly TO service_role;

DROP POLICY IF EXISTS "Admins can insert messaging metrics" ON public.meta_messaging_monthly;
CREATE POLICY "Admins can insert messaging metrics"
ON public.meta_messaging_monthly FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update messaging metrics" ON public.meta_messaging_monthly;
CREATE POLICY "Admins can update messaging metrics"
ON public.meta_messaging_monthly FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete messaging metrics" ON public.meta_messaging_monthly;
CREATE POLICY "Admins can delete messaging metrics"
ON public.meta_messaging_monthly FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));