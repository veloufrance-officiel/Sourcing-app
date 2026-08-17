-- =====================================================================
-- Traçabilité du contact candidat, posée maintenant pour que le futur
-- mécanisme de contact (PR7, hors périmètre ici) ait une place où
-- s'accrocher plutôt que d'improviser sa propre structure au dernier
-- moment. Pas de bouton, pas d'email, pas de template ici — uniquement
-- le modèle de données qui rendra ce futur mécanisme correct par
-- construction plutôt que par discipline seule.
--
-- Distinction posée explicitement, cohérente avec l'analyse reçue :
-- la collecte initiale (découverte GitHub) et le contact candidat ne
-- partagent pas la même base légale ni la même obligation de preuve.
-- candidate_contacts porte la trace du second, jamais confondu avec le
-- premier (qui reste candidates.source='github' + consent_status).
-- =====================================================================

create table candidate_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  candidate_id uuid not null,
  mission_id uuid not null,

  -- Ce qui a été effectivement envoyé, verbatim — pas une référence à
  -- un template modifiable après coup. La preuve doit rester stable
  -- même si le template évolue plus tard.
  message_sent text not null,
  legal_basis text not null check (legal_basis in ('legitimate_interest', 'consent')),

  sent_at timestamptz not null default now(),
  sent_by uuid references app_users(id),

  -- Réponse du candidat, jamais déduite — seulement enregistrée quand
  -- une action explicite existe. null = pas encore de réponse, pas
  -- "refus implicite" ni "acceptation implicite".
  response text check (response is null or response in ('accepted', 'refused', 'opposed')),
  responded_at timestamptz,

  created_at timestamptz not null default now(),

  constraint candidate_contacts_tenant_candidate_fkey foreign key (tenant_id, candidate_id) references candidates(tenant_id, id) on delete cascade,
  constraint candidate_contacts_tenant_mission_fkey foreign key (tenant_id, mission_id) references missions(tenant_id, id) on delete cascade
);

create index idx_candidate_contacts_tenant_id on candidate_contacts(tenant_id);
create index idx_candidate_contacts_candidate_id on candidate_contacts(candidate_id);

alter table candidate_contacts enable row level security;

create policy candidate_contacts_select on candidate_contacts for select
  using (tenant_id = internal.current_tenant_id());

create policy candidate_contacts_insert on candidate_contacts for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

create policy candidate_contacts_update on candidate_contacts for update
  using (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

grant select, insert, update on candidate_contacts to authenticated;

-- =====================================================================
-- Garde-fou explicite, pas seulement documentaire : consent_status ne
-- doit jamais passer à 'granted' sans qu'une ligne candidate_contacts
-- existe avec response='accepted' pour ce candidat. Empêche
-- structurellement le raccourci que le document identifie comme
-- risque ("email = demande de consentement RGPD" codé comme règle
-- universelle) — même mécanisme de principe que
-- evidence_inference_never_verified : une contrainte en base, pas une
-- discipline qu'un futur développeur pourrait oublier.
-- =====================================================================

create or replace function internal.enforce_consent_requires_accepted_contact()
returns trigger
language plpgsql
as $$
begin
  if new.consent_status = 'granted' and (old.consent_status is distinct from 'granted') then
    -- legal_basis='consent' explicitement filtré ici, pas seulement
    -- response='accepted' — trou trouvé en revue avant merge : un
    -- contact fondé sur legitimate_interest, même accepté, ne doit
    -- jamais suffire à lui seul pour poser granted. granted signifie
    -- spécifiquement "consentement RGPD valablement recueilli pour
    -- cette finalité précise", pas "a répondu positivement" au sens
    -- large, peu importe la base légale réellement retenue pour ce
    -- contact. Un contact en legitimate_interest fait légitimement
    -- avancer la relation candidat, mais jamais via ce statut
    -- précis — c'est exactement la confusion que ce garde-fou existe
    -- pour empêcher.
    if not exists (
      select 1 from candidate_contacts
      where candidate_id = new.id and response = 'accepted' and legal_basis = 'consent'
    ) then
      raise exception 'consent_status ne peut passer à granted sans un contact candidate_contacts.response=accepted ET legal_basis=consent enregistré au préalable — un contact fondé sur legitimate_interest ne suffit pas à lui seul, quelle que soit la réponse du candidat.';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_consent_requires_accepted_contact
  before update on candidates
  for each row execute function internal.enforce_consent_requires_accepted_contact();
