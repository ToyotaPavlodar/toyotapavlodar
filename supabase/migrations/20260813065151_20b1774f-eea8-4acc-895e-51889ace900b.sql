CREATE TABLE IF NOT EXISTS public.cron_secret (
  id integer PRIMARY KEY DEFAULT 1,
  token text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cron_secret_single_row CHECK (id = 1)
);

REVOKE ALL ON public.cron_secret FROM anon, authenticated;
GRANT ALL ON public.cron_secret TO service_role;

ALTER TABLE public.cron_secret ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cron_secret (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  tok text;
  base text := 'https://project--c76646a2-360d-4cb0-a4bd-11e5fc63ea3e.lovable.app/api/public/hooks/';
  j record;
BEGIN
  SELECT token INTO tok FROM public.cron_secret WHERE id = 1;

  FOR j IN SELECT jobname FROM cron.job WHERE jobname IS NOT NULL LOOP
    PERFORM cron.unschedule(j.jobname);
  END LOOP;
  FOR j IN SELECT jobid FROM cron.job LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;

  PERFORM cron.schedule('nightly-sync-fx', '0 3 * * *', format(
    $q$SELECT net.http_post(url:='%ssync-fx', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'), body:='{}'::jsonb);$q$,
    base, tok));

  PERFORM cron.schedule('nightly-sync-meta-leads', '20 3 * * *', format(
    $q$SELECT net.http_post(url:='%ssync-meta-leads', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'), body:='{}'::jsonb);$q$,
    base, tok));

  PERFORM cron.schedule('nightly-sync-meta-spend', '40 3 * * *', format(
    $q$SELECT net.http_post(url:='%ssync-meta-spend', headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'), body:='{}'::jsonb);$q$,
    base, tok));
END $$;