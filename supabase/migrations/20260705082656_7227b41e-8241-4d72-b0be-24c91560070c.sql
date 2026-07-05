
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'operator', 'marketer');
CREATE TYPE public.lead_source AS ENUM ('meta_lead_form', 'whatsapp', 'manual');

-- ============ updated_at helper ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  dashboard_access BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

CREATE OR REPLACE FUNCTION public.has_dashboard_access(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND dashboard_access = true)
$$;

-- profile policies
CREATE POLICY "own profile read" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- user_roles policies (read only; admin manages via service_role fn)
CREATE POLICY "roles read own or admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- profile auto-create trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  -- default role: operator
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'operator')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ BRANDS ============
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#0B2340',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.brands TO authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "brands read all authed" ON public.brands FOR SELECT TO authenticated USING (true);
CREATE POLICY "brands admin write" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER brands_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.brands (code, name, color, sort_order) VALUES
  ('toyota', 'Toyota', '#EB0A1E', 1),
  ('lexus',  'Lexus',  '#1A1A1A', 2),
  ('asp',    'АСП',    '#0B2340', 3),
  ('service','Сервис', '#2E7D32', 4);

-- ============ LEADS ============
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT,
  phone TEXT,
  interest TEXT,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  source public.lead_source NOT NULL DEFAULT 'manual',
  source_ref TEXT,
  meta_account_id TEXT,
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  meta_form_id TEXT,
  ctwa_clid TEXT,
  called BOOLEAN,
  qualified BOOLEAN,
  sent_to_1c BOOLEAN NOT NULL DEFAULT false,
  comment TEXT,
  raw_payload JSONB,
  UNIQUE (source, source_ref)
);
CREATE INDEX leads_created_at_idx ON public.leads (created_at DESC);
CREATE INDEX leads_brand_created_idx ON public.leads (brand_id, created_at DESC);
CREATE INDEX leads_phone_idx ON public.leads (phone);
GRANT SELECT, INSERT, UPDATE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads read authed" ON public.leads FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marketer'));
CREATE POLICY "leads insert operator/admin" ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "leads update operator/admin" ON public.leads FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'operator') OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER leads_updated_at BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable realtime
ALTER TABLE public.leads REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;

-- ============ CAMPAIGN → BRAND MAP ============
CREATE TABLE public.campaign_brand_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (meta_account_id, campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_brand_map TO authenticated;
GRANT ALL ON public.campaign_brand_map TO service_role;
ALTER TABLE public.campaign_brand_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cbmap read authed" ON public.campaign_brand_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "cbmap admin write" ON public.campaign_brand_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER cbmap_updated_at BEFORE UPDATE ON public.campaign_brand_map
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ AD SPEND DAILY ============
CREATE TABLE public.ad_spend_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  meta_account_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT,
  brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  spend_usd NUMERIC(14,4) NOT NULL DEFAULT 0,
  impressions BIGINT DEFAULT 0,
  clicks BIGINT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, campaign_id)
);
CREATE INDEX ad_spend_date_idx ON public.ad_spend_daily (date);
CREATE INDEX ad_spend_brand_date_idx ON public.ad_spend_daily (brand_id, date);
GRANT SELECT ON public.ad_spend_daily TO authenticated;
GRANT ALL ON public.ad_spend_daily TO service_role;
ALTER TABLE public.ad_spend_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spend dashboard read" ON public.ad_spend_daily FOR SELECT TO authenticated
  USING (public.has_dashboard_access(auth.uid()));
CREATE TRIGGER ad_spend_updated_at BEFORE UPDATE ON public.ad_spend_daily
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ FX RATES ============
CREATE TABLE public.fx_rates (
  date DATE PRIMARY KEY,
  usd_kzt NUMERIC(12,4) NOT NULL,
  source TEXT NOT NULL DEFAULT 'nbrk',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fx_rates TO authenticated;
GRANT ALL ON public.fx_rates TO service_role;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fx dashboard read" ON public.fx_rates FOR SELECT TO authenticated
  USING (public.has_dashboard_access(auth.uid()));

-- ============ META INTEGRATION ============
CREATE TABLE public.meta_integration (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token TEXT,
  meta_user_id TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  ad_accounts JSONB DEFAULT '[]'::jsonb,
  selected_forms JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.meta_integration TO authenticated;
GRANT ALL ON public.meta_integration TO service_role;
ALTER TABLE public.meta_integration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "meta admin all" ON public.meta_integration FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.meta_integration (id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TRIGGER meta_int_updated_at BEFORE UPDATE ON public.meta_integration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ WHATSAPP INTEGRATION ============
CREATE TABLE public.whatsapp_integration (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phone_number_id TEXT,
  waba_id TEXT,
  access_token TEXT,
  verify_token TEXT,
  connected_at TIMESTAMPTZ,
  default_brand_id UUID REFERENCES public.brands(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.whatsapp_integration TO authenticated;
GRANT ALL ON public.whatsapp_integration TO service_role;
ALTER TABLE public.whatsapp_integration ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa admin all" ON public.whatsapp_integration FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.whatsapp_integration (id) VALUES (1) ON CONFLICT DO NOTHING;
CREATE TRIGGER wa_int_updated_at BEFORE UPDATE ON public.whatsapp_integration
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SYNC LOG ============
CREATE TABLE public.sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  meta JSONB,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sync_log TO authenticated;
GRANT ALL ON public.sync_log TO service_role;
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_log admin read" ON public.sync_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
