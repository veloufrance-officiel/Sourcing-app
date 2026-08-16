-- =====================================================================
-- PR1 — Schéma Evidence + Eligibility (FINAL DECISION MODEL GATE)
--
-- Décision d'architecture explicite, à documenter dans le rapport de PR :
-- l'éligibilité est calculée PAR (candidat, mission), jamais globalement
-- pour un candidat seul. evidence.criterion_id référence brief_criteria,
-- qui est intrinsèquement lié à une mission — un même candidat peut être
-- ELIGIBLE pour une mission et NOT_QUALIFIED pour une autre, selon les
-- preuves disponibles pour CETTE mission précise. eligibility_status vit
-- donc sur mission_candidates, pas sur candidates.
-- =====================================================================

-- Prérequis pour la FK composite d'evidence vers brief_criteria — n'existait
-- pas encore (seule missions/candidates avaient déjà ce pattern).
alter table brief_criteria add constraint brief_criteria_tenant_id_id_key unique (tenant_id, id);

-- =====================================================================
-- Table evidence
-- =====================================================================
create table evidence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  candidate_id uuid not null,
  criterion_id uuid not null,
  status text not null check (status in ('VERIFIED', 'NOT_VERIFIED', 'CONTRADICTED', 'INFERRED_UNCONFIRMED')),
  is_inference boolean not null default false,
  evidence_text text,
  source_type text not null check (source_type in ('self_declared', 'cv_upload', 'recruiter_note', 'third_party_reference', 'web_search')),
  source_priority smallint not null check (source_priority between 1 and 3),
  source_url text,
  retrieved_at timestamptz not null default now(),
  confidence numeric(3,2) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Historique : une preuve n'est jamais écrasée. Une nouvelle information
  -- crée une nouvelle ligne et pointe l'ancienne vers elle via
  -- superseded_by — la trace complète reste interrogeable.
  superseded_by uuid references evidence(id),
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id),

  -- Contrainte non négociable, structurelle : une inférence ne peut
  -- JAMAIS atteindre VERIFIED. Posée en CHECK, pas seulement en
  -- convention applicative — aucun code futur ne peut l'oublier.
  constraint evidence_inference_never_verified check (not (is_inference and status = 'VERIFIED')),

  constraint evidence_tenant_candidate_fkey foreign key (tenant_id, candidate_id) references candidates(tenant_id, id) on delete cascade,
  constraint evidence_tenant_criterion_fkey foreign key (tenant_id, criterion_id) references brief_criteria(tenant_id, id) on delete cascade
);

create index idx_evidence_tenant_id on evidence(tenant_id);
create index idx_evidence_candidate_criterion on evidence(candidate_id, criterion_id) where superseded_by is null;

alter table evidence enable row level security;

create policy evidence_select on evidence for select
  using (tenant_id = internal.current_tenant_id());

create policy evidence_insert on evidence for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

create policy evidence_update on evidence for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

create policy evidence_delete on evidence for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

grant select, insert, update, delete on evidence to authenticated;

-- =====================================================================
-- mission_candidates.eligibility_status — agrégat calculé, jamais saisi
-- directement par le client (aucun grant d'update direct sur ces
-- colonnes n'est nécessaire ici puisque seul le trigger les écrit).
-- =====================================================================
alter table mission_candidates add column eligibility_status text not null default 'NOT_QUALIFIED'
  check (eligibility_status in ('INELIGIBLE', 'NOT_QUALIFIED', 'ELIGIBLE'));
alter table mission_candidates add column eligibility_flags text[] not null default '{}';
alter table mission_candidates add column eligibility_calculated_at timestamptz;

-- =====================================================================
-- shortlist_candidates — Décision 2 : un candidat déjà shortlisté qui
-- devient INELIGIBLE n'est jamais retiré automatiquement. Signalé pour
-- revue humaine, historique conservé intact.
-- =====================================================================
alter table shortlist_candidates add column requires_review boolean not null default false;
alter table shortlist_candidates add column requires_review_reason text;
alter table shortlist_candidates add column requires_review_since timestamptz;

-- =====================================================================
-- Fonction pure de décision (miroir SQL de src/lib/eligibility.ts) —
-- aucun effet de bord, ne lit que ses paramètres. Séparée de la fonction
-- de persistance ci-dessous pour que la logique de décision soit isolée
-- et testable indépendamment de l'écriture en base.
-- =====================================================================
create or replace function internal.compute_eligibility_status(p_obligatoire_statuses text[])
returns table(status text, flags text[])
language plpgsql
immutable
as $$
begin
  if p_obligatoire_statuses is null or array_length(p_obligatoire_statuses, 1) is null then
    return query select 'ELIGIBLE'::text, array['NO_HARD_CONSTRAINTS']::text[];
    return;
  end if;

  -- INFERRED_UNCONFIRMED ne compte jamais comme VERIFIED — contrainte non
  -- négociable, appliquée ici aussi (pas seulement au niveau de la table).
  if exists (
    select 1 from unnest(p_obligatoire_statuses) s
    where s = 'CONTRADICTED'
  ) then
    return query select 'INELIGIBLE'::text, array[]::text[];
    return;
  end if;

  if exists (
    select 1 from unnest(p_obligatoire_statuses) s
    where s is distinct from 'VERIFIED'
  ) then
    return query select 'NOT_QUALIFIED'::text, array[]::text[];
    return;
  end if;

  return query select 'ELIGIBLE'::text, array[]::text[];
end;
$$;

-- =====================================================================
-- Fonction de persistance : agrège les preuves réelles d'un (candidat,
-- mission), appelle la fonction pure ci-dessus, écrit le résultat,
-- applique la Décision 2 (requires_review) si applicable.
-- =====================================================================
create or replace function internal.recalculate_eligibility(p_candidate_id uuid, p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_statuses text[];
  v_result record;
begin
  if not exists (select 1 from mission_candidates where candidate_id = p_candidate_id and mission_id = p_mission_id) then
    return; -- ce candidat n'est pas (ou plus) dans le pipeline de cette mission
  end if;

  -- Statut effectif par critère obligatoire : la preuve la plus récente
  -- non supersédée (superseded_by is null). Sans preuve du tout -> NULL,
  -- traité comme NOT_VERIFIED par compute_eligibility_status (distinct
  -- de VERIFIED, jamais CONTRADICTED).
  select array_agg(
    coalesce(
      (select case when e.status = 'INFERRED_UNCONFIRMED' then 'NOT_VERIFIED' else e.status end
       from evidence e
       where e.candidate_id = p_candidate_id and e.criterion_id = bc.id and e.superseded_by is null
       order by e.retrieved_at desc limit 1),
      'NOT_VERIFIED'
    )
  )
  into v_statuses
  from brief_criteria bc
  where bc.mission_id = p_mission_id and bc.weight = 3;

  select * into v_result from internal.compute_eligibility_status(v_statuses);

  update mission_candidates
  set eligibility_status = v_result.status,
      eligibility_flags = v_result.flags,
      eligibility_calculated_at = now()
  where candidate_id = p_candidate_id and mission_id = p_mission_id;

  -- Décision 2 : signalement, jamais de retrait automatique de l'historique.
  if v_result.status = 'INELIGIBLE' then
    update shortlist_candidates sc
    set requires_review = true,
        requires_review_reason = 'Devenu INELIGIBLE après ajout à la shortlist (nouvelle preuve contradictoire sur un critère obligatoire)',
        requires_review_since = coalesce(sc.requires_review_since, now())
    from shortlists s
    where sc.shortlist_id = s.id
      and s.mission_id = p_mission_id
      and sc.candidate_id = p_candidate_id
      and sc.requires_review = false;
  end if;
end;
$$;

-- =====================================================================
-- Triggers de recalcul déterministe : evidence change, nouveau candidat
-- ajouté au pipeline, ou les critères eux-mêmes changent (un critère qui
-- devient obligatoire doit invalider l'éligibilité déjà calculée —
-- ajouté au-delà de la demande littérale car nécessaire à la garantie de
-- déterminisme, signalé explicitement dans le rapport de PR).
-- =====================================================================
create or replace function internal.trg_evidence_change()
returns trigger
language plpgsql
as $$
declare
  v_candidate_id uuid;
  v_criterion_id uuid;
  v_mission_id uuid;
begin
  v_candidate_id := coalesce(new.candidate_id, old.candidate_id);
  v_criterion_id := coalesce(new.criterion_id, old.criterion_id);
  select mission_id into v_mission_id from brief_criteria where id = v_criterion_id;
  if v_mission_id is not null then
    perform internal.recalculate_eligibility(v_candidate_id, v_mission_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger trg_recalculate_eligibility_on_evidence
  after insert or update or delete on evidence
  for each row execute function internal.trg_evidence_change();

create or replace function internal.trg_mission_candidate_insert()
returns trigger
language plpgsql
as $$
begin
  perform internal.recalculate_eligibility(new.candidate_id, new.mission_id);
  return new;
end;
$$;

create trigger trg_recalculate_eligibility_on_mission_candidate_insert
  after insert on mission_candidates
  for each row execute function internal.trg_mission_candidate_insert();

create or replace function internal.trg_criteria_change()
returns trigger
language plpgsql
as $$
declare
  v_mission_id uuid;
  r record;
begin
  v_mission_id := coalesce(new.mission_id, old.mission_id);
  for r in select candidate_id from mission_candidates where mission_id = v_mission_id loop
    perform internal.recalculate_eligibility(r.candidate_id, v_mission_id);
  end loop;
  return coalesce(new, old);
end;
$$;

create trigger trg_recalculate_eligibility_on_criteria_change
  after insert or update or delete on brief_criteria
  for each row execute function internal.trg_criteria_change();

-- =====================================================================
-- Backfill : les mission_candidates déjà existants ont eligibility_status
-- au défaut statique 'NOT_QUALIFIED', potentiellement incorrect (ex: une
-- mission sans critère obligatoire devrait être ELIGIBLE+NO_HARD_CONSTRAINTS
-- dès aujourd'hui, pas seulement pour les futurs ajouts). Recalcul réel
-- pour que "déterministe" soit vrai immédiatement, pas seulement pour
-- l'avenir.
-- =====================================================================
do $$
declare
  r record;
begin
  for r in select distinct candidate_id, mission_id from mission_candidates loop
    perform internal.recalculate_eligibility(r.candidate_id, r.mission_id);
  end loop;
end $$;
