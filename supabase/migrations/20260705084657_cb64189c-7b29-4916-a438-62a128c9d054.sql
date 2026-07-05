DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.app_role'::regtype AND enumlabel='manager') THEN
    ALTER TYPE public.app_role ADD VALUE 'manager';
  END IF;
END $$;