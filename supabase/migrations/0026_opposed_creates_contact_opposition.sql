-- =====================================================================
-- Invariant, pas une réaction à un événement : "dès qu'un état opposed
-- existe dans candidate_contacts, une opposition correspondante existe
-- dans contact_oppositions". Couvre nativement les trois chemins
-- identifiés en revue, sans distinguer TG_OP explicitement :
-- - INSERT direct avec response='opposed'
-- - UPDATE d'une réponse antérieure (ex. interested) vers 'opposed'
-- - un second 'opposed' sur le même profil, idempotent via ON CONFLICT
--
-- SECURITY DEFINER : rend le trigger indépendant de toute
-- synchronisation implicite entre les policies RLS de
-- candidate_contacts et contact_oppositions — aujourd'hui identiques
-- (owner/admin/recruiter) mais c'est une coïncidence de conception,
-- pas une garantie structurelle. Cohérent avec le pattern déjà établi
-- dans ce projet (0002, 0003).
--
-- recorded_by = NEW.sent_by : limite connue, pas une garantie
-- complète. sent_by documente qui a envoyé le CONTACT INITIAL, pas
-- nécessairement qui a enregistré la RÉPONSE du candidat —
-- candidate_contacts n'a aujourd'hui aucune colonne responded_by
-- distincte (trou de conception hérité de PR6 étape 3, hors périmètre
-- de cette migration à corriger). C'est la meilleure valeur
-- disponible aujourd'hui, pas une preuve juridiquement complète de
-- qui a constaté l'opposition.
--
-- Conservation de contact_oppositions : NON gérée par cette migration.
-- Un mécanisme de rétention complet existe déjà sur candidates
-- (data_retention_until, public.enforce_data_retention(), cron
-- quotidien — 0015) mais contact_oppositions, créée après ce
-- mécanisme, n'y est pas incluse. Trou identifié en revue, pas
-- corrigé ici : l'étendre correctement demande une vraie migration de
-- schéma, hors périmètre "aucun changement fonctionnel
-- supplémentaire" de cette étape.
--
-- tenant_id dérivé de NEW.tenant_id (la ligne candidate_contacts
-- elle-même), jamais de internal.current_tenant_id() ou d'une autre
-- source de session — validé par simulation contre la vraie base avant
-- cette migration : c'est la seule source qui garantit l'isolation
-- tenant sans dépendance implicite au contexte d'exécution.
--
-- Candidats sans github_user_id (source='manual', 74 lignes
-- existantes vérifiées avant cette migration) explicitement ignorés,
-- pas une erreur : l'opposition GitHub n'a de sens que pour un profil
-- découvert via GitHub, par construction.
-- =====================================================================

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
    select github_user_id into v_github_user_id from candidates where id = new.candidate_id;

    if v_github_user_id is not null then
      insert into contact_oppositions (tenant_id, github_user_id, recorded_by)
      values (new.tenant_id, v_github_user_id, new.sent_by)
      on conflict (tenant_id, github_user_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_enforce_opposed_creates_contact_opposition
  after insert or update on candidate_contacts
  for each row execute function internal.enforce_opposed_creates_contact_opposition();
