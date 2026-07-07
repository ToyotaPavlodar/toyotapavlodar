
-- 1) handle_new_user: назначать роль manager (не operator)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'manager')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

-- 2) Мигрировать существующих operator → manager (если у пользователя ещё нет manager)
INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'manager'::app_role
FROM public.user_roles ur
WHERE ur.role = 'operator'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'manager'
  )
ON CONFLICT DO NOTHING;

DELETE FROM public.user_roles WHERE role = 'operator';

-- 3) Seed rows id=1 для интеграций
INSERT INTO public.meta_integration (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
INSERT INTO public.whatsapp_integration (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
