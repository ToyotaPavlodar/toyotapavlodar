
drop policy if exists "brands read all authed" on public.brands;
create policy "brands read admin or operator" on public.brands
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role) or public.has_role(auth.uid(), 'operator'::app_role));

drop policy if exists "cbmap read authed" on public.campaign_brand_map;
create policy "cbmap read admin only" on public.campaign_brand_map
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin'::app_role));
