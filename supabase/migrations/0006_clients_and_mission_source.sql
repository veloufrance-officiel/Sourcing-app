-- Sépare "ceux qui proposent des missions" (clients) des freelances
-- (candidates) : client_name était un texte libre, pas une vraie entité.
create table clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  contact_name text,
  contact_email text,
  created_at timestamptz not null default now()
);

alter table clients add constraint clients_tenant_id_id_key unique (tenant_id, id);
alter table clients enable row level security;

create policy "clients - select membres du tenant" on clients for select
  using (tenant_id = internal.current_tenant_id());
create policy "clients - insert recruiter+" on clients for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "clients - update recruiter+" on clients for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'))
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));
create policy "clients - delete recruiter+" on clients for delete
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

create index idx_clients_tenant_id on clients (tenant_id);

-- missions : client_name (texte libre) -> client_id (vraie relation) ;
-- source : d'où vient la mission, obligatoire côté formulaire (impacte le
-- partage à 10% avec Arnaud, pas de valeur par défaut silencieuse). Le
-- default 'direct' au niveau colonne existe seulement pour ne pas casser
-- une ligne existante au moment de la migration.
alter table missions add column client_id uuid references clients(id);
alter table missions add column source text not null default 'direct' check (source in ('direct','arnaud'));

alter table missions drop constraint missions_tenant_id_fkey;
alter table missions add constraint missions_tenant_client_fkey
  foreign key (tenant_id, client_id) references clients (tenant_id, id);
alter table missions add constraint missions_tenant_id_fkey
  foreign key (tenant_id) references tenants (id) on delete cascade;

alter table missions drop column client_name;

create index idx_missions_tenant_source on missions (tenant_id, source, created_at desc);
