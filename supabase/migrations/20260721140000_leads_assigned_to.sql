ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_assignable BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON public.leads (assigned_to);
