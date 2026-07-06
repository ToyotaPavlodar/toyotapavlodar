-- Account-level WhatsApp/messaging starts per month (source of truth for dashboard).
CREATE TABLE IF NOT EXISTS public.meta_messaging_monthly (
  month TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  meta_account_id TEXT NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  conversations_started INT NOT NULL DEFAULT 0 CHECK (conversations_started >= 0),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (month, meta_account_id)
);

CREATE INDEX IF NOT EXISTS meta_messaging_monthly_brand_month_idx
  ON public.meta_messaging_monthly (brand_id, month);

ALTER TABLE public.meta_messaging_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read messaging monthly"
  ON public.meta_messaging_monthly FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.meta_messaging_monthly IS
  'Meta account-level messaging starts per calendar month. Only WhatsApp-lead ad accounts (brand Сервис).';
