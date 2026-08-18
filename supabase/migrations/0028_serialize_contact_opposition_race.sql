-- =====================================================================
-- Ferme le TOCTOU identifié en revue : les deux chemins qui touchent à
-- l'invariant "opposition <-> contact" doivent verrouiller la même
-- ligne candidates AVANT de lire/écrire quoi que ce soit lié à
-- l'opposition, sinon deux SELECT concurrents peuvent chacun ne rien
-- voir. Un simple IF EXISTS dans un nouveau trigger isolé, sans
-- modifier 0026, laisserait la course ouverte pour le scénario
-- "opposition avant contact" — identifié explicitement en revue avant
-- d'écrire cette migration, pas découvert après coup.
--
-- Sécurité vérifiée avant d'écrire ce fichier, pas supposée : owner de
-- 0026 = postgres (SECURITY DEFINER), propriétaire de candidates
-- (exempté de RLS par défaut, relforcerowsecurity=false confirmé),
-- privilège UPDATE présent, search_path=public résout correctement le
-- nom de table. Le nouveau trigger reprend exactement le même contexte
-- de sécurité, pas un nouveau.
--
-- Limite méthodologique assumée, pas cachée : la propriété de
-- sérialisation (une transaction concurrente demandant un verrou
-- incompatible attend) est documentée par PostgreSQL, pas prouvée
-- empiriquement ici — l'outillage disponible pour écrire cette
-- migration isole chaque appel SQL dans sa propre connexion, ne
-- permettant pas de maintenir deux transactions réellement
-- simultanées pour observer un blocage direct.
-- =====================================================================

-- === Chemin opposition (0026 modifié) : verrou ajouté avant lecture,
-- aucune autre modification de la logique métier. ===
create or replace function internal.enforce_opposed_creates_contact_opposition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_github_user_id bigint;
begin
  if new.response = 'opposed' then
    -- FOR UPDATE : verrouille la ligne candidates jusqu'à la fin de
    -- cette transaction (celle ouverte par l'UPDATE candidate_contacts
    -- qui a déclenché ce trigger AFTER). Une transaction concurrente
    -- tentant le même verrou (côté chemin contact, ci-dessous) attend
    -- ici jusqu'à ce que celle-ci commit ou rollback.
    select github_user_id into v_github_user_id from candidates where id = new.candidate_id for update;

    if v_github_user_id is not null then
      insert into contact_oppositions (tenant_id, github_user_id, recorded_by)
      values (new.tenant_id, v_github_user_id, new.sent_by)
      on conflict (tenant_id, github_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- === Chemin contact (nouveau) : garde-fou d'intégrité, pas un
-- remplacement du check applicatif dans markCandidateContacted, qui
-- reste utile pour l'UX (retour immédiat d'une erreur métier propre
-- dans le cas normal, non concurrent). Ce trigger devient l'autorité
-- finale contre la concurrence et tout futur chemin d'écriture. ===
create or replace function internal.enforce_contact_blocked_by_opposition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_github_user_id bigint;
  v_is_opposed boolean;
begin
  -- Même ligne, même mode de verrou, même ordre d'acquisition que le
  -- chemin opposition ci-dessus — c'est cette symétrie qui garantit un
  -- résultat déterministe sous concurrence, pas le verrou pris
  -- isolément.
  select github_user_id into v_github_user_id from candidates where id = new.candidate_id for update;

  if v_github_user_id is not null then
    select exists (
      select 1 from contact_oppositions where tenant_id = new.tenant_id and github_user_id = v_github_user_id
    ) into v_is_opposed;

    if v_is_opposed then
      raise exception 'Ce profil s''est opposé à être contacté — insertion refusée par la base.';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_contact_blocked_by_opposition
  before insert on candidate_contacts
  for each row execute function internal.enforce_contact_blocked_by_opposition();
