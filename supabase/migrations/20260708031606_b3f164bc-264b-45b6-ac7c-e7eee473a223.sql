INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.profiles
WHERE email = 'toyotapavlodar333444@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;