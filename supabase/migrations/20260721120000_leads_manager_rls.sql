-- Role was migrated operator → manager, but RLS policies still checked operator.
-- Managers could read nothing / updates silently affected 0 rows.

DROP POLICY IF EXISTS "leads read authed" ON public.leads;
CREATE POLICY "leads read authed" ON public.leads FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'marketer')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "leads insert operator/admin" ON public.leads;
DROP POLICY IF EXISTS "leads insert manager/admin" ON public.leads;
CREATE POLICY "leads insert manager/admin" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "leads update operator/admin" ON public.leads;
DROP POLICY IF EXISTS "leads update manager/admin" ON public.leads;
CREATE POLICY "leads update manager/admin" ON public.leads FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'operator')
  );

DROP POLICY IF EXISTS "brands read admin or operator" ON public.brands;
DROP POLICY IF EXISTS "brands read admin or manager" ON public.brands;
CREATE POLICY "brands read manager/admin" ON public.brands FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'manager')
    OR public.has_role(auth.uid(), 'operator')
  );
