-- =====================================================================
-- Shortlist Eligibility Gate — la DB devient l'autorité finale.
--
-- Un seul chemin d'insertion applicatif existe aujourd'hui
-- (addCandidateToShortlist), mais la garantie ne peut pas reposer sur
-- ce fait : n'importe quel insert SQL direct, présent ou futur, doit
-- être bloqué de la même façon. Cohérent avec le choix déjà tranché
-- pour Evidence (internal.enforce_human_verification) : trigger
-- explicite avec message métier clair, pas une policy RLS qui
-- masquerait la vraie raison du refus derrière un simple "row-level
-- security violation".
-- =====================================================================

create or replace function internal.enforce_shortlist_eligibility_gate()
returns trigger
language plpgsql
as $$
declare
  v_mission_id uuid;
  v_status text;
begin
  select mission_id into v_mission_id from shortlists where id = new.shortlist_id;

  -- Une shortlist sans mission associée n'existe pas dans le modèle de
  -- données actuel (mission_id not null sur shortlists), mais si ce
  -- lookup échouait un jour, refuser plutôt que de laisser passer par
  -- défaut — le silence ne doit jamais devenir une autorisation.
  if v_mission_id is null then
    raise exception 'Shortlist introuvable ou sans mission associée — insertion refusée.';
  end if;

  select eligibility_status into v_status
  from mission_candidates
  where mission_id = v_mission_id and candidate_id = new.candidate_id;

  -- Un candidat qui n'est même pas dans le pipeline de cette mission
  -- (aucune ligne mission_candidates) n'a jamais été évalué du tout —
  -- refusé pour la même raison que ci-dessus, pas une absence de
  -- restriction.
  if v_status is null then
    raise exception 'Ce candidat n''a pas encore été évalué pour cette mission — ajout à la shortlist refusé.';
  end if;

  if v_status != 'ELIGIBLE' then
    raise exception 'Candidat non éligible (statut: %) — seul un candidat ELIGIBLE peut être ajouté à une shortlist.', v_status;
  end if;

  return new;
end;
$$;

create trigger trg_enforce_shortlist_eligibility_gate
  before insert on shortlist_candidates
  for each row execute function internal.enforce_shortlist_eligibility_gate();
