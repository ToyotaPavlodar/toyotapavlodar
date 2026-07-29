-- Ответственный = сотрудник CRM: логин/пароль через profiles + привязка user_id.

ALTER TABLE public.lead_assignees
  ADD COLUMN IF NOT EXISTS user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lead_assignees_user_id_idx
  ON public.lead_assignees (user_id)
  WHERE user_id IS NOT NULL;

COMMENT ON COLUMN public.lead_assignees.user_id IS
  'Связь с профилем CRM: вход по логину/паролю, бренд = lead_assignees.brand_id';

-- Видимость справочника: свой бренд или всё (админ / без brand_id).
DROP POLICY IF EXISTS "lead_assignees read authed" ON public.lead_assignees;
CREATE POLICY "lead_assignees read scoped" ON public.lead_assignees
  FOR SELECT TO authenticated
  USING (
    public.user_sees_all_brands(auth.uid())
    OR brand_id = public.get_user_brand_id(auth.uid())
    OR user_id = auth.uid()
  );

-- Жёсткое разделение лидов: менеджер с brand_id видит только свой бренд
-- (уже есть lead_visible_to_user). Дополнительно: оператор/менеджер, привязанный
-- к assignee, на UPDATE может работать только со своими лидами? Нет — видит все
-- лиды бренда, чтобы брать неназначенные; статистика на дашборде — только своя.
