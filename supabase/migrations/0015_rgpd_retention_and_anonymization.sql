-- La contrainte existait déjà (pending/granted/revoked, depuis la toute
-- première migration) — on l'étend avec un état terminal 'anonymized'
-- plutôt que de renommer un vocabulaire déjà en place.
alter table candidates drop constraint candidates_consent_status_check;
alter table candidates add constraint candidates_consent_status_check
  check (consent_status in ('pending', 'granted', 'revoked', 'anonymized'));

alter table candidates add column anonymized_at timestamptz;

-- Durée de conservation posée automatiquement à la création (2 ans —
-- norme couramment citée par la CNIL pour les données de candidature en
-- France ; à confirmer avec un vrai conseil juridique pour le cas précis
-- d'OrakL, ce n'est pas un avis juridique de ma part, juste un défaut
-- raisonnable plutôt qu'un champ vide qui ne sert jamais à rien).
create or replace function internal.set_default_retention()
returns trigger
language plpgsql
as $$
begin
  if new.data_retention_until is null then
    new.data_retention_until := (current_date + interval '2 years')::date;
  end if;
  return new;
end;
$$;

create trigger trg_set_default_retention
  before insert on candidates
  for each row execute function internal.set_default_retention();

-- Anonymisation : jamais de DELETE brutal (casserait l'historique du
-- pipeline, les shortlists, activity_log qui référencent candidate_id).
-- La ligne reste, les champs identifiants sont vidés. Placée en public
-- (pas internal) dès le départ cette fois — leçon retenue du BYOK : une
-- fonction que le client doit appeler doit être dans un schéma exposé à
-- PostgREST, la sécurité vient des GRANT et du rôle, pas du schéma.
create or replace function public.anonymize_candidate(p_candidate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_candidate_tenant uuid;
  v_role text;
begin
  select tenant_id into v_tenant_id from app_users where id = auth.uid();
  if v_tenant_id is null then
    raise exception 'Compte non rattaché à un tenant';
  end if;

  v_role := internal.current_user_role();
  if v_role not in ('owner', 'admin') then
    raise exception 'Seuls owner/admin peuvent anonymiser un profil (RGPD)';
  end if;

  select tenant_id into v_candidate_tenant from candidates where id = p_candidate_id;
  if v_candidate_tenant is null or v_candidate_tenant != v_tenant_id then
    raise exception 'Profil introuvable dans ce tenant';
  end if;

  update candidates set
    full_name = 'Candidat anonymisé',
    email = null,
    phone = null,
    cv_url = null,
    skills = null,
    location = null,
    title = null,
    consent_status = 'anonymized',
    anonymized_at = now()
  where id = p_candidate_id;
end;
$$;

grant execute on function public.anonymize_candidate(uuid) to authenticated;

-- Application automatique de la rétention : appelée par le cron
-- quotidien uniquement (aucun grant à authenticated/anon) — un seul job
-- de confiance décide quand la rétention expire, pas chaque utilisateur.
create or replace function public.enforce_data_retention()
returns table(anonymized_count int, anonymized_names text[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ids uuid[];
  v_names text[];
begin
  select array_agg(id), array_agg(full_name) into v_ids, v_names
  from candidates
  where data_retention_until < current_date
    and anonymized_at is null
    and consent_status != 'anonymized';

  if v_ids is null then
    return query select 0, array[]::text[];
    return;
  end if;

  update candidates set
    full_name = 'Candidat anonymisé',
    email = null,
    phone = null,
    cv_url = null,
    skills = null,
    location = null,
    title = null,
    consent_status = 'anonymized',
    anonymized_at = now()
  where id = any(v_ids);

  return query select array_length(v_ids, 1), v_names;
end;
$$;

revoke all on function public.enforce_data_retention() from public, anon, authenticated;
grant execute on function public.enforce_data_retention() to service_role;
