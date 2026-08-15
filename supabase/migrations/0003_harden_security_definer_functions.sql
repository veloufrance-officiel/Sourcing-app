-- L'advisor de sécurité Supabase (get_advisors) signale que current_tenant_id()
-- et seed_default_pipeline_stages() sont des fonctions SECURITY DEFINER
-- appelables directement via l'API REST publique (/rest/v1/rpc/...), alors
-- qu'elles ne sont censées être utilisées qu'en interne (policies RLS pour
-- la première, trigger pour la seconde). On les déplace dans un schéma
-- `internal`, non exposé par PostgREST — la fonction reste utilisable dans
-- les policies et le trigger, mais plus appelable depuis l'extérieur.

create schema if not exists internal;

create or replace function internal.current_tenant_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select tenant_id from app_users where id = auth.uid();
$$;

drop policy "tenants - lecture propre tenant" on tenants;
create policy "tenants - lecture propre tenant" on tenants for select
  using (id = internal.current_tenant_id());

drop policy "app_users - isolation tenant" on app_users;
create policy "app_users - isolation tenant" on app_users for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "pipeline_stages - isolation tenant" on pipeline_stages;
create policy "pipeline_stages - isolation tenant" on pipeline_stages for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "missions - isolation tenant" on missions;
create policy "missions - isolation tenant" on missions for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "brief_criteria - isolation tenant" on brief_criteria;
create policy "brief_criteria - isolation tenant" on brief_criteria for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "candidates - isolation tenant" on candidates;
create policy "candidates - isolation tenant" on candidates for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "mission_candidates - isolation tenant" on mission_candidates;
create policy "mission_candidates - isolation tenant" on mission_candidates for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "shortlists - isolation tenant" on shortlists;
create policy "shortlists - isolation tenant" on shortlists for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "shortlist_candidates - isolation tenant" on shortlist_candidates;
create policy "shortlist_candidates - isolation tenant" on shortlist_candidates for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "activity_log - isolation tenant" on activity_log;
create policy "activity_log - isolation tenant" on activity_log for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop policy "subscriptions - isolation tenant" on subscriptions;
create policy "subscriptions - isolation tenant" on subscriptions for all
  using (tenant_id = internal.current_tenant_id())
  with check (tenant_id = internal.current_tenant_id());

drop function if exists public.current_tenant_id();

create or replace function internal.seed_default_pipeline_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pipeline_stages (tenant_id, label, sort_order, is_default) values
    (new.id, 'Nouveau', 1, true),
    (new.id, 'À vérifier', 2, true),
    (new.id, 'Contacté', 3, true),
    (new.id, 'Qualifié', 4, true),
    (new.id, 'Shortlist', 5, true),
    (new.id, 'Présenté', 6, true),
    (new.id, 'Placé', 7, true);
  return new;
end;
$$;

drop trigger if exists trg_seed_default_pipeline_stages on tenants;
create trigger trg_seed_default_pipeline_stages
  after insert on tenants
  for each row
  execute function internal.seed_default_pipeline_stages();

drop function if exists public.seed_default_pipeline_stages();
