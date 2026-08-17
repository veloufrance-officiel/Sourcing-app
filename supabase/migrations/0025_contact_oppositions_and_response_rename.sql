-- =====================================================================
-- contact_oppositions — opposition durable, tenant-scoped, survit à la
-- suppression du candidat opérationnel. Modèle validé par simulation
-- contre la vraie base avant cette migration (table temporaire
-- reproduisant exactement cette structure, testée dans les deux sens :
-- survie à la suppression, blocage du lookup, isolation tenant-scoped
-- confirmée) — pas une conception nouvelle non vérifiée.
--
-- Structurellement indépendante de candidates : aucune FK vers cette
-- table, contrairement à candidate_contacts (candidate_id, on delete
-- cascade) qui perdrait la trace d'opposition si le candidat est
-- supprimé — exactement le trou que cette table corrige.
--
-- Minimisation délibérée : seul github_user_id sert au mécanisme de
-- blocage lui-même. name/bio/location/company ne sont jamais recopiés
-- ici — ils existent déjà dans candidates au moment de l'opposition,
-- les dupliquer ici prolongerait leur conservation au-delà de ce qui
-- est nécessaire, contraire au principe de minimisation.
-- =====================================================================

create table contact_oppositions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  github_user_id bigint not null,
  opposed_at timestamptz not null default now(),
  -- Audit minimal de qui a enregistré l'opposition. uuid, pas enum
  -- texte : un seul acteur réel possible aujourd'hui (le recruteur, via
  -- confirmGithubOpposition ci-dessous) — confirmé par recherche
  -- exhaustive avant cette migration, aucun autre code n'écrit dans
  -- candidate_contacts. Un enum à choix multiples serait prématuré, pas
  -- juste incertain.
  recorded_by uuid references app_users(id),

  -- Une seule opposition par (tenant, profil GitHub) — un second essai
  -- d'enregistrement ne doit jamais créer une seconde ligne muette.
  unique (tenant_id, github_user_id)
);

create index idx_contact_oppositions_lookup on contact_oppositions(tenant_id, github_user_id);

alter table contact_oppositions enable row level security;

create policy contact_oppositions_select on contact_oppositions for select
  using (tenant_id = internal.current_tenant_id());

create policy contact_oppositions_insert on contact_oppositions for insert
  with check (tenant_id = internal.current_tenant_id() and internal.current_user_role() in ('owner','admin','recruiter'));

grant select, insert on contact_oppositions to authenticated;

-- =====================================================================
-- candidate_contacts.response : accepted/refused/opposed -> renommé.
-- Le modèle MVP a explicitement abandonné consent comme base légale du
-- premier contact et "réponse positive = consentement" — accepted
-- entretenait cette confusion par son vocabulaire même. interested
-- reflète honnêtement ce qui s'est passé : la personne a exprimé un
-- intérêt, jamais un consentement RGPD.
--
-- Contrainte retirée puis reposée plutôt que modifiée en place : les
-- deux opérations sont nécessaires pour changer les valeurs autorisées
-- d'un CHECK existant.
-- =====================================================================

alter table candidate_contacts drop constraint candidate_contacts_response_check;
alter table candidate_contacts add constraint candidate_contacts_response_check
  check (response is null or response in ('interested', 'refused', 'opposed'));

-- =====================================================================
-- Trigger granted : accepted n'existe plus dans response, la
-- contrainte ci-dessus l'interdit déjà au niveau colonne — mais le
-- corps du trigger référençait encore explicitement 'accepted', une
-- branche morte qui rendrait granted structurellement inatteignable
-- une fois response renommé (jamais un bug silencieux : le CHECK
-- empêcherait même d'insérer 'accepted', donc le trigger ne matcherait
-- plus jamais rien) — corrigé ici pour ne pas laisser cette
-- incohérence, même inoffensive en pratique, dans le code.
--
-- legal_basis='consent' reste dans la contrainte CHECK de
-- candidate_contacts (0023) — pas retiré ici : le MVP PR7 n'emprunte
-- jamais ce chemin, mais le retirer romprait la colonne pour un futur
-- parcours de consentement explicite que le document envisage comme
-- mécanisme séparé, pas supprimé.
-- =====================================================================

create or replace function internal.enforce_consent_requires_accepted_contact()
returns trigger
language plpgsql
as $$
begin
  if new.consent_status = 'granted' and (old.consent_status is distinct from 'granted') then
    if not exists (
      select 1 from candidate_contacts
      where candidate_id = new.id and response = 'interested' and legal_basis = 'consent'
    ) then
      raise exception 'consent_status ne peut passer à granted sans un contact candidate_contacts.response=interested ET legal_basis=consent enregistré au préalable — un contact fondé sur legitimate_interest ne suffit pas à lui seul, quelle que soit la réponse du candidat.';
    end if;
  end if;
  return new;
end;
$$;
