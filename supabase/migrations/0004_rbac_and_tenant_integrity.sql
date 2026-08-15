-- =====================================================================
-- 0004 : RBAC réel + verrouillage app_users/subscriptions/activity_log +
--        intégrité tenant_id (FK composites) + indexes tenant_id
--
-- Corrige un trou trouvé à l'audit : app_users, subscriptions et
-- activity_log avaient la même policy FOR ALL que les tables métier,
-- ce qui permettait à n'importe quel membre d'un tenant de : se
-- promouvoir owner, modifier son propre abonnement sans passer par
-- Stripe, et supprimer des lignes de son propre journal d'audit.
-- =====================================================================

-- Rôle de l'utilisateur courant (même schéma internal que current_tenant_id)
create or replace function internal.current_user_role()
returns text
language sql stable
security definer
set search_path = public
as $$
  select role from app_users where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- app_users : FOR ALL -> SELECT/INSERT/UPDATE/DELETE séparés
-- ---------------------------------------------------------------------
drop policy "app_users - isolation tenant" on app_users;

create policy "app_users - select membres du tenant" on app_users for select
  using (tenant_id = internal.current_tenant_id());

create policy "app_users - insert par owner/admin" on app_users for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'));

create policy "app_users - update par owner/admin" on app_users for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'));

create policy "app_users - delete par owner/admin" on app_users for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'));

-- Un utilisateur ne peut jamais changer son propre rôle ni son tenant_id,
-- même owner/admin sur sa propre ligne. Trigger (pas seulement policy) :
-- s'applique à toute session, y compris service_role.
create or replace function internal.prevent_self_role_or_tenant_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'tenant_id ne peut pas être modifié par cette voie';
  end if;
  if auth.uid() = old.id and new.role is distinct from old.role then
    raise exception 'un utilisateur ne peut pas modifier son propre rôle';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_self_role_or_tenant_change on app_users;
create trigger trg_prevent_self_role_or_tenant_change
  before update on app_users
  for each row
  execute function internal.prevent_self_role_or_tenant_change();

create or replace function internal.prevent_self_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id then
    raise exception 'un utilisateur ne peut pas se supprimer lui-même';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_self_delete on app_users;
create trigger trg_prevent_self_delete
  before delete on app_users
  for each row
  execute function internal.prevent_self_delete();

-- ---------------------------------------------------------------------
-- pipeline_stages : lecture pour tous, écriture owner/admin (config du
-- pipeline, pas une action de recrutement au jour le jour)
-- ---------------------------------------------------------------------
drop policy "pipeline_stages - isolation tenant" on pipeline_stages;
create policy "pipeline_stages - select membres du tenant" on pipeline_stages for select
  using (tenant_id = internal.current_tenant_id());
create policy "pipeline_stages - insert owner/admin" on pipeline_stages for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'));
create policy "pipeline_stages - update owner/admin" on pipeline_stages for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'));
create policy "pipeline_stages - delete owner/admin" on pipeline_stages for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin'));

-- ---------------------------------------------------------------------
-- Tables métier : lecture pour tous les membres, écriture owner/admin/
-- recruiter (pas viewer)
-- ---------------------------------------------------------------------
-- missions
drop policy "missions - isolation tenant" on missions;
create policy "missions - select membres du tenant" on missions for select
  using (tenant_id = internal.current_tenant_id());
create policy "missions - insert recruiter+" on missions for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "missions - update recruiter+" on missions for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "missions - delete recruiter+" on missions for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

-- brief_criteria
drop policy "brief_criteria - isolation tenant" on brief_criteria;
create policy "brief_criteria - select membres du tenant" on brief_criteria for select
  using (tenant_id = internal.current_tenant_id());
create policy "brief_criteria - insert recruiter+" on brief_criteria for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "brief_criteria - update recruiter+" on brief_criteria for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "brief_criteria - delete recruiter+" on brief_criteria for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

-- candidates
drop policy "candidates - isolation tenant" on candidates;
create policy "candidates - select membres du tenant" on candidates for select
  using (tenant_id = internal.current_tenant_id());
create policy "candidates - insert recruiter+" on candidates for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "candidates - update recruiter+" on candidates for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "candidates - delete recruiter+" on candidates for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

-- mission_candidates
drop policy "mission_candidates - isolation tenant" on mission_candidates;
create policy "mission_candidates - select membres du tenant" on mission_candidates for select
  using (tenant_id = internal.current_tenant_id());
create policy "mission_candidates - insert recruiter+" on mission_candidates for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "mission_candidates - update recruiter+" on mission_candidates for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "mission_candidates - delete recruiter+" on mission_candidates for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

-- shortlists
drop policy "shortlists - isolation tenant" on shortlists;
create policy "shortlists - select membres du tenant" on shortlists for select
  using (tenant_id = internal.current_tenant_id());
create policy "shortlists - insert recruiter+" on shortlists for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "shortlists - update recruiter+" on shortlists for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "shortlists - delete recruiter+" on shortlists for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

-- shortlist_candidates (pas d'update : table de jointure pure)
drop policy "shortlist_candidates - isolation tenant" on shortlist_candidates;
create policy "shortlist_candidates - select membres du tenant" on shortlist_candidates for select
  using (tenant_id = internal.current_tenant_id());
create policy "shortlist_candidates - insert recruiter+" on shortlist_candidates for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "shortlist_candidates - delete recruiter+" on shortlist_candidates for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

-- ---------------------------------------------------------------------
-- activity_log : append-only. INSERT + SELECT pour tous les membres,
-- aucune policy UPDATE/DELETE (absence de policy = interdit par défaut).
-- ---------------------------------------------------------------------
drop policy "activity_log - isolation tenant" on activity_log;
create policy "activity_log - select membres du tenant" on activity_log for select
  using (tenant_id = internal.current_tenant_id());
create policy "activity_log - insert membres du tenant" on activity_log for insert
  with check (tenant_id = internal.current_tenant_id());

-- ---------------------------------------------------------------------
-- subscriptions : lecture seule côté client. Écritures réservées à un
-- futur webhook Stripe server-side (clé secrète, hors RLS).
-- ---------------------------------------------------------------------
drop policy "subscriptions - isolation tenant" on subscriptions;
create policy "subscriptions - select membres du tenant" on subscriptions for select
  using (tenant_id = internal.current_tenant_id());

-- ---------------------------------------------------------------------
-- Intégrité tenant_id : contraintes composites, défense en profondeur
-- indépendante de RLS (tient même si RLS est contourné par erreur).
-- ---------------------------------------------------------------------
alter table app_users add constraint app_users_tenant_id_id_key unique (tenant_id, id);
alter table missions add constraint missions_tenant_id_id_key unique (tenant_id, id);
alter table candidates add constraint candidates_tenant_id_id_key unique (tenant_id, id);
alter table pipeline_stages add constraint pipeline_stages_tenant_id_id_key unique (tenant_id, id);
alter table shortlists add constraint shortlists_tenant_id_id_key unique (tenant_id, id);

alter table missions drop constraint missions_created_by_fkey;
alter table missions add constraint missions_tenant_created_by_fkey
  foreign key (tenant_id, created_by) references app_users (tenant_id, id);

alter table brief_criteria drop constraint brief_criteria_mission_id_fkey;
alter table brief_criteria add constraint brief_criteria_tenant_mission_fkey
  foreign key (tenant_id, mission_id) references missions (tenant_id, id);

alter table mission_candidates drop constraint mission_candidates_mission_id_fkey;
alter table mission_candidates drop constraint mission_candidates_candidate_id_fkey;
alter table mission_candidates drop constraint mission_candidates_stage_id_fkey;
alter table mission_candidates add constraint mission_candidates_tenant_mission_fkey
  foreign key (tenant_id, mission_id) references missions (tenant_id, id);
alter table mission_candidates add constraint mission_candidates_tenant_candidate_fkey
  foreign key (tenant_id, candidate_id) references candidates (tenant_id, id);
alter table mission_candidates add constraint mission_candidates_tenant_stage_fkey
  foreign key (tenant_id, stage_id) references pipeline_stages (tenant_id, id);

alter table shortlists drop constraint shortlists_mission_id_fkey;
alter table shortlists add constraint shortlists_tenant_mission_fkey
  foreign key (tenant_id, mission_id) references missions (tenant_id, id);

alter table shortlist_candidates drop constraint shortlist_candidates_shortlist_id_fkey;
alter table shortlist_candidates drop constraint shortlist_candidates_candidate_id_fkey;
alter table shortlist_candidates add constraint shortlist_candidates_tenant_shortlist_fkey
  foreign key (tenant_id, shortlist_id) references shortlists (tenant_id, id);
alter table shortlist_candidates add constraint shortlist_candidates_tenant_candidate_fkey
  foreign key (tenant_id, candidate_id) references candidates (tenant_id, id);

alter table activity_log drop constraint activity_log_actor_id_fkey;
alter table activity_log add constraint activity_log_tenant_actor_fkey
  foreign key (tenant_id, actor_id) references app_users (tenant_id, id);

-- ---------------------------------------------------------------------
-- Indexes : tenant_id sur toutes les tables (RLS filtre dessus à chaque
-- requête -> sans index, full scan systématique), + composites sur les
-- patterns de requête réels de l'app (missions triées par date, pipeline
-- par mission, etc.)
-- ---------------------------------------------------------------------
create index if not exists idx_app_users_tenant_id on app_users (tenant_id);
create index if not exists idx_missions_tenant_id_created_at on missions (tenant_id, created_at desc);
create index if not exists idx_candidates_tenant_id on candidates (tenant_id);
create index if not exists idx_pipeline_stages_tenant_id on pipeline_stages (tenant_id, sort_order);
create index if not exists idx_mission_candidates_tenant_mission on mission_candidates (tenant_id, mission_id);
create index if not exists idx_mission_candidates_tenant_stage on mission_candidates (tenant_id, stage_id);
create index if not exists idx_shortlists_tenant_mission on shortlists (tenant_id, mission_id);
create index if not exists idx_shortlist_candidates_tenant on shortlist_candidates (tenant_id);
create index if not exists idx_brief_criteria_tenant_mission on brief_criteria (tenant_id, mission_id);
create index if not exists idx_activity_log_tenant_created_at on activity_log (tenant_id, created_at desc);
