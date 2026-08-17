-- =====================================================================
-- Séparation provenance / consentement, décidée explicitement plutôt
-- que de faire porter deux responsabilités à consent_status :
-- - candidates.source : d'où vient le candidat (déjà présent depuis
--   0001_init.sql, jamais renseigné — 74 lignes existantes, toutes
--   NULL, vérifié avant cette migration)
-- - candidates.consent_status : statut RGPD réel, inchangé
--
-- source n'avait aucune contrainte CHECK jusqu'ici (contrairement à
-- brief_criteria.source qui en a une depuis le début) — corrigé ici.
-- =====================================================================

alter table candidates alter column source set default 'manual';
alter table candidates add constraint candidates_source_check
  check (source is null or source in ('manual', 'ai', 'github'));

-- Backfill des 74 lignes existantes : NULL -> 'manual', cohérent avec
-- leur provenance réelle (toutes saisies via add-candidate-form).
update candidates set source = 'manual' where source is null;

-- Extension du Shortlist Gate existant (0021) — pas un nouveau trigger
-- parallèle. Ajoute une seconde condition à la même fonction : un
-- candidat éligible mais sans consentement accordé reste bloqué à
-- l'entrée en shortlist. Cohérent avec le principe déjà posé pour
-- eligibility_status : le score se calcule normalement (le recruteur
-- voit qui est prometteur), seule l'entrée en shortlist est gatée.
create or replace function internal.enforce_shortlist_eligibility_gate()
returns trigger
language plpgsql
as $$
declare
  v_mission_id uuid;
  v_status text;
  v_consent text;
begin
  select mission_id into v_mission_id from shortlists where id = new.shortlist_id;

  if v_mission_id is null then
    raise exception 'Shortlist introuvable ou sans mission associée — insertion refusée.';
  end if;

  select eligibility_status into v_status
  from mission_candidates
  where mission_id = v_mission_id and candidate_id = new.candidate_id;

  if v_status is null then
    raise exception 'Ce candidat n''a pas encore été évalué pour cette mission — ajout à la shortlist refusé.';
  end if;

  if v_status != 'ELIGIBLE' then
    raise exception 'Candidat non éligible (statut: %) — seul un candidat ELIGIBLE peut être ajouté à une shortlist.', v_status;
  end if;

  select consent_status into v_consent from candidates where id = new.candidate_id;

  if v_consent is distinct from 'granted' then
    raise exception 'Consentement non accordé (statut: %) — ce candidat ne peut pas être ajouté à une shortlist tant qu''il n''a pas donné son accord.', coalesce(v_consent, 'inconnu');
  end if;

  return new;
end;
$$;
