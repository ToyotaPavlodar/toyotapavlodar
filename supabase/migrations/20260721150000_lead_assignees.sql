-- Ответственные по лидам — отдельно от ролей пользователей CRM.
CREATE TABLE public.lead_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX lead_assignees_brand_idx ON public.lead_assignees (brand_id);
CREATE INDEX lead_assignees_active_idx ON public.lead_assignees (is_active);

GRANT SELECT ON public.lead_assignees TO authenticated;
GRANT ALL ON public.lead_assignees TO service_role;

ALTER TABLE public.lead_assignees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_assignees read authed" ON public.lead_assignees
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "lead_assignees admin write" ON public.lead_assignees
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER lead_assignees_updated_at BEFORE UPDATE ON public.lead_assignees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- leads.assigned_to → lead_assignees (раньше ссылался на profiles)
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;
UPDATE public.leads SET assigned_to = NULL WHERE assigned_to IS NOT NULL;
ALTER TABLE public.leads
  ADD CONSTRAINT leads_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.lead_assignees(id) ON DELETE SET NULL;
