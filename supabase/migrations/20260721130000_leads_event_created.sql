ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS event_created BOOLEAN;
