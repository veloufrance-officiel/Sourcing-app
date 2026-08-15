-- =====================================================================
-- OrakL / Sourcing OS — Schéma v1 (Postgres / Supabase)
-- Multi-tenant via tenant_id + Row Level Security sur TOUTES les tables
-- Hypothèse : Supabase Auth (auth.users) pour l'authentification
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_internal boolean not null default false, -- true = ton workspace (usage avec Arnaud)
  plan text not null default 'internal' check (plan in ('internal','free','starter','pro')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- UTILISATEURS (miroir de auth.users, avec tenant + rôle)
-- ---------------------------------------------------------------------
create table app_users (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null default 'recruiter' check (role in ('owner','admin','recruiter','viewer')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- STATUTS DE PIPELINE — configurables par tenant (pas codés en dur)
-- ---------------------------------------------------------------------
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  label text not null,
  sort_order int not null,
  is_default boolean not null default false
);

-- ---------------------------------------------------------------------
-- MISSIONS
-- ---------------------------------------------------------------------
create table missions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  client_name text,
  location text,
  contract_type text,
  daily_rate numeric(10,2),
  status text not null default 'active' check (status in ('active','paused','closed')),
  brief_raw text,
  created_by uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CRITÈRES EXTRAITS DU BRIEF PAR L'IA
-- ---------------------------------------------------------------------
create table brief_criteria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  label text not null,
  weight int default 1,
  source text not null default 'ai' check (source in ('ai','manual')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- CANDIDATS / FREELANCES
-- ---------------------------------------------------------------------
create table candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  full_name text not null,
  title text,
  source text,
  cv_url text,
  email text,
  phone text,
  consent_status text not null default 'pending' check (consent_status in ('pending','granted','revoked')),
  data_retention_until date,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- PIPELINE RÉEL : candidat × mission × statut
-- ---------------------------------------------------------------------
create table mission_candidates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  stage_id uuid not null references pipeline_stages(id),
  updated_at timestamptz not null default now(),
  unique (mission_id, candidate_id)
);

-- ---------------------------------------------------------------------
-- SHORTLISTS
-- ---------------------------------------------------------------------
create table shortlists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  mission_id uuid not null references missions(id) on delete cascade,
  name text not null,
  shared_with_external boolean not null default false, -- ex. vue lecture seule pour Arnaud
  created_at timestamptz not null default now()
);

create table shortlist_candidates (
  shortlist_id uuid not null references shortlists(id) on delete cascade,
  candidate_id uuid not null references candidates(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  primary key (shortlist_id, candidate_id)
);

-- ---------------------------------------------------------------------
-- JOURNAL D'ACTIVITÉ
-- ---------------------------------------------------------------------
create table activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  actor_id uuid references app_users(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ABONNEMENTS — structure prête, activée en Phase 2 (MRR)
-- ---------------------------------------------------------------------
create table subscriptions (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  plan text not null default 'free' check (plan in ('free','starter','pro')),
  status text not null default 'inactive',
  current_period_end timestamptz
);

-- =====================================================================
-- ROW LEVEL SECURITY — activé partout, sans exception
-- =====================================================================
alter table tenants enable row level security;
alter table app_users enable row level security;
alter table pipeline_stages enable row level security;
alter table missions enable row level security;
alter table brief_criteria enable row level security;
alter table candidates enable row level security;
alter table mission_candidates enable row level security;
alter table shortlists enable row level security;
alter table shortlist_candidates enable row level security;
alter table activity_log enable row level security;
alter table subscriptions enable row level security;

-- Fonction utilitaire : tenant_id de l'utilisateur Supabase connecté
create or replace function current_tenant_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select tenant_id from app_users where id = auth.uid();
$$;

create policy "tenants - lecture propre tenant"
  on tenants for select
  using (id = current_tenant_id());

create policy "app_users - isolation tenant"
  on app_users for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "pipeline_stages - isolation tenant"
  on pipeline_stages for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "missions - isolation tenant"
  on missions for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "brief_criteria - isolation tenant"
  on brief_criteria for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "candidates - isolation tenant"
  on candidates for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "mission_candidates - isolation tenant"
  on mission_candidates for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "shortlists - isolation tenant"
  on shortlists for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "shortlist_candidates - isolation tenant"
  on shortlist_candidates for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "activity_log - isolation tenant"
  on activity_log for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

create policy "subscriptions - isolation tenant"
  on subscriptions for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- =====================================================================
-- SEED — statuts de pipeline par défaut pour un nouveau tenant
-- (reprend les 7 statuts déjà utilisés dans le MVP Emergent)
-- À exécuter après la création d'un tenant, avec son id réel :
-- =====================================================================
-- insert into pipeline_stages (tenant_id, label, sort_order, is_default) values
--   ('<tenant_id>', 'Nouveau', 1, true),
--   ('<tenant_id>', 'À vérifier', 2, true),
--   ('<tenant_id>', 'Contacté', 3, true),
--   ('<tenant_id>', 'Qualifié', 4, true),
--   ('<tenant_id>', 'Shortlist', 5, true),
--   ('<tenant_id>', 'Présenté', 6, true),
--   ('<tenant_id>', 'Placé', 7, true);
