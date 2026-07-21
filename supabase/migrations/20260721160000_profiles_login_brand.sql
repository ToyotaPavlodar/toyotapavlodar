-- Логин + привязка к бренду для сотрудников (админ без brand_id видит всё).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS login TEXT,
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_login_unique
  ON public.profiles (lower(login))
  WHERE login IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_brand_id_idx ON public.profiles (brand_id);

COMMENT ON COLUMN public.profiles.login IS 'Логин для входа (отображается пользователю; auth email = login@crm.internal)';
COMMENT ON COLUMN public.profiles.brand_id IS 'NULL = все бренды (админ). UUID = только этот бренд.';

CREATE OR REPLACE FUNCTION public.get_user_brand_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT brand_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.user_sees_all_brands(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
    OR public.get_user_brand_id(_user_id) IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.lead_visible_to_user(_user_id UUID, _brand_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_sees_all_brands(_user_id)
    OR _brand_id = public.get_user_brand_id(_user_id);
$$;

-- Leads: brand scope
DROP POLICY IF EXISTS "leads read authed" ON public.leads;
CREATE POLICY "leads read authed" ON public.leads FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'marketer')
      OR public.has_role(auth.uid(), 'operator')
    )
    AND public.lead_visible_to_user(auth.uid(), brand_id)
  );

DROP POLICY IF EXISTS "leads update manager/admin" ON public.leads;
CREATE POLICY "leads update manager/admin" ON public.leads FOR UPDATE TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'operator')
    )
    AND public.lead_visible_to_user(auth.uid(), brand_id)
  )
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'operator')
    )
    AND public.lead_visible_to_user(auth.uid(), brand_id)
  );

DROP POLICY IF EXISTS "leads insert manager/admin" ON public.leads;
CREATE POLICY "leads insert manager/admin" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (
    (
      public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'operator')
    )
    AND public.lead_visible_to_user(auth.uid(), brand_id)
  );

-- Brands: scoped users see only their brand
DROP POLICY IF EXISTS "brands read manager/admin" ON public.brands;
CREATE POLICY "brands read scoped" ON public.brands FOR SELECT TO authenticated
  USING (
    (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'manager')
      OR public.has_role(auth.uid(), 'marketer')
      OR public.has_role(auth.uid(), 'operator')
    )
    AND (
      public.user_sees_all_brands(auth.uid())
      OR id = public.get_user_brand_id(auth.uid())
    )
  );
