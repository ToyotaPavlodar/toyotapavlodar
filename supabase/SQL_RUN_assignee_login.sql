-- Выполнить в Supabase → SQL Editor (проект zzpvjtpysscoqtuwhmoi)
-- Логин/пароль для ответственных + жёсткое разделение по бренду

ALTER TABLE public.lead_assignees
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lead_assignees_user_id_idx
  ON public.lead_assignees (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.lead_assignees.user_id IS
  'Связь с профилем CRM: вход по логину/паролю, бренд = lead_assignees.brand_id';

DROP POLICY IF EXISTS "lead_assignees read authed" ON public.lead_assignees;
DROP POLICY IF EXISTS "lead_assignees read scoped" ON public.lead_assignees;
CREATE POLICY "lead_assignees read scoped" ON public.lead_assignees
  FOR SELECT TO authenticated
  USING (
    public.user_sees_all_brands(auth.uid())
    OR brand_id = public.get_user_brand_id(auth.uid())
    OR user_id = auth.uid()
  );
