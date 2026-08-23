-- =====================================================================
-- Hard gate TJM. Architecture figée après une longue passe d'audit —
-- rappel des 4 décisions verrouillées, chacune vérifiée contre le
-- code/schéma réel avant cette écriture, pas supposée :
--
-- 1. TJM candidat = mission_candidates.daily_rate (donnée contextuelle
--    à la candidature, pas au profil global — cohérent avec
--    eligibility_status déjà porté par cette même table).
-- 2. Plafond absent (missions.daily_rate IS NULL) = pas de hard gate,
--    jamais un statut fabriqué — même principe déjà validé pour
--    tenant_budgets en N.2 ("absence de limite = absence de
--    contrainte").
-- 3. 0/négatif = invalide (CHECK > 0), jamais un statut métier.
-- 4. evidence reste le VÉHICULE d'agrégation déjà existant (compute_
--    eligibility_status ne connaît que des statuts déjà agrégés),
--    jamais une deuxième source de vérité numérique — la valeur brute
--    ne vit jamais que dans mission_candidates.daily_rate, jamais
--    reparsée depuis un texte d'evidence.
-- =====================================================================

-- ---------------------------------------------------------------------
-- mission_candidates.daily_rate — valeur métier numérique.
-- ---------------------------------------------------------------------
alter table public.mission_candidates
  add column daily_rate numeric(10, 2)
  constraint mission_candidates_daily_rate_positive check (daily_rate > 0);

-- ---------------------------------------------------------------------
-- brief_criteria.is_hard_gate — distingue structurellement un critère
-- système d'un critère issu du brief, sans détourner `source` (qui
-- garde sa vraie sémantique : qui a créé ce critère, pas son rôle).
-- Extensible : un futur hard gate (budget, distance, disponibilité)
-- réutiliserait la même colonne, jamais une nouvelle valeur de source.
-- ---------------------------------------------------------------------
alter table public.brief_criteria
  add column is_hard_gate boolean not null default false;

-- ---------------------------------------------------------------------
-- Garde DB structurelle : une evidence VERIFIED/CONTRADICTED rattachée
-- à un critère is_hard_gate=true ne peut être écrite QUE par la
-- fonction de calcul dédiée ci-dessous — jamais par
-- evidence-actions.ts, même si un humain le tentait explicitement.
-- Rejet (RAISE EXCEPTION), jamais une correction silencieuse comme le
-- fait trg_enforce_human_verification pour verified_by/verified_at —
-- ici, on veut que l'échec soit visible, pas masqué, exactement la
-- réserve explicite posée avant d'écrire ce trigger.
--
-- GUC transaction-local (set_config(..., true) — 3e paramètre true =
-- is_local), jamais session-local : ne devient jamais une autorisation
-- persistante, expire automatiquement à la fin de la transaction qui
-- l'a posé. Exigence explicite, pas une option.
create or replace function internal.enforce_hard_gate_evidence_authority()
returns trigger
language plpgsql
as $$
declare
  v_is_hard_gate boolean;
begin
  if new.status not in ('VERIFIED', 'CONTRADICTED') then
    return new;
  end if;

  select is_hard_gate into v_is_hard_gate from brief_criteria where id = new.criterion_id;

  if v_is_hard_gate and coalesce(current_setting('app.hard_gate_calculation', true), 'false') is distinct from 'true' then
    raise exception 'Une evidence VERIFIED/CONTRADICTED sur un critère hard gate ne peut être écrite que par le calcul automatique, jamais manuellement.';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_hard_gate_evidence_authority
  before insert or update on evidence
  for each row
  execute function internal.enforce_hard_gate_evidence_authority();

-- ---------------------------------------------------------------------
-- Calcul du hard gate — SEULE autorité capable d'écrire VERIFIED/
-- CONTRADICTED sur un critère is_hard_gate=true. SECURITY DEFINER,
-- verrouillée par REVOKE/GRANT explicite (le client ne peut jamais
-- l'appeler directement sans passer par le vrai contexte
-- applicatif) — mais accordée à authenticated puisque c'est le
-- contexte réel d'appel de ce projet (confirmé : aucune RPC de ce
-- projet n'utilise service_role côté client web).
--
-- Comparaison + set_config + INSERT dans UN SEUL bloc transactionnel,
-- jamais réparti entre plusieurs appels — condition stricte pour que
-- le GUC transaction-local reste valide pendant tout le calcul,
-- cohérent avec la contrainte PostgREST déjà découverte et respectée
-- pour reserve_budget() en N.2 (une requête authenticated = une
-- transaction potentiellement isolée).
create or replace function public.calculate_daily_rate_hard_gate(p_candidate_id uuid, p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_candidate_rate numeric;
  v_mission_ceiling numeric;
  v_criterion_id uuid;
  v_status text;
  v_new_evidence_id uuid;
begin
  v_tenant_id := internal.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'Aucun tenant résolu pour la session courante.';
  end if;

  select daily_rate into v_mission_ceiling from missions where id = p_mission_id and tenant_id = v_tenant_id;

  -- Plafond absent : pas de hard gate, aucun critère système ne doit
  -- exister pour cette mission — décision 2, vérifiée avant cette
  -- écriture (même principe déjà validé pour tenant_budgets en N.2).
  if v_mission_ceiling is null then
    return;
  end if;

  select daily_rate into v_candidate_rate
  from mission_candidates
  where candidate_id = p_candidate_id and mission_id = p_mission_id and tenant_id = v_tenant_id;

  -- Le critère hard gate système, créé une seule fois par mission dès
  -- qu'un plafond existe — jamais recréé s'il existe déjà.
  select id into v_criterion_id
  from brief_criteria
  where mission_id = p_mission_id and is_hard_gate = true and tenant_id = v_tenant_id
  limit 1;

  if v_criterion_id is null then
    insert into brief_criteria (tenant_id, mission_id, label, weight, source, is_hard_gate)
    values (v_tenant_id, p_mission_id, 'TJM candidat ≤ plafond mission', 3, 'manual', true)
    returning id into v_criterion_id;
  end if;

  if v_candidate_rate is null then
    v_status := 'NOT_VERIFIED';
  elsif v_candidate_rate <= v_mission_ceiling then
    v_status := 'VERIFIED';
  else
    v_status := 'CONTRADICTED';
  end if;

  perform set_config('app.hard_gate_calculation', 'true', true);

  insert into evidence (
    tenant_id, candidate_id, criterion_id, status, is_inference,
    evidence_text, source_type, source_priority
  )
  values (
    v_tenant_id, p_candidate_id, v_criterion_id, v_status, false,
    case
      when v_candidate_rate is null then 'TJM candidat non renseigné pour cette mission.'
      else format('TJM candidat %s€ vs plafond mission %s€ — calcul automatique.', v_candidate_rate, v_mission_ceiling)
    end,
    'recruiter_note', 1
  )
  returning id into v_new_evidence_id;

  -- Marque explicitement toute ANCIENNE evidence hard gate comme
  -- remplacée par celle qu'on vient de créer — vrai défaut trouvé en
  -- test SQL réel : deux evidences insérées dans la MÊME transaction
  -- partagent exactement le même retrieved_at (now() est figé pour
  -- toute la durée d'une transaction PostgreSQL, comportement
  -- documenté, pas un bug), rendant l'ordre entre elles non
  -- déterministe côté recalculate_eligibility (order by retrieved_at
  -- desc limit 1). En conditions réelles via PostgREST, chaque appel
  -- RPC est généralement sa propre transaction (retrieved_at
  -- différent à chaque fois), donc ce cas est rare en production —
  -- mais pas garanti par le vrai contrat du système, un vrai gap à
  -- corriger, pas à ignorer. superseded_by n'était par ailleurs
  -- jamais écrit par aucun code de ce projet avant cette correction
  -- (vérifié avant d'écrire cette ligne) — un vrai gap préexistant,
  -- corrigé ici pour le cas hard gate précisément, pas généralisé à
  -- tout le modèle evidence (hors périmètre de ce chantier).
  update evidence
  set superseded_by = v_new_evidence_id
  where candidate_id = p_candidate_id
    and criterion_id = v_criterion_id
    and id != v_new_evidence_id
    and superseded_by is null;

  perform set_config('app.hard_gate_calculation', 'false', true);

  perform internal.recalculate_eligibility(p_candidate_id, p_mission_id);
end;
$$;

revoke all on function public.calculate_daily_rate_hard_gate(uuid, uuid) from public, anon;
grant execute on function public.calculate_daily_rate_hard_gate(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Recalcul automatique — deux nouveaux déclencheurs, gap confirmé
-- absent avant cette migration (aucun trigger n'existait sur
-- mission_candidates.daily_rate ni sur missions.daily_rate).
-- ---------------------------------------------------------------------
create or replace function internal.trg_mission_candidate_daily_rate_change()
returns trigger
language plpgsql
as $$
begin
  if new.daily_rate is distinct from old.daily_rate then
    perform public.calculate_daily_rate_hard_gate(new.candidate_id, new.mission_id);
  end if;
  return new;
end;
$$;

create trigger trg_recalculate_hard_gate_on_candidate_rate_change
  after update on mission_candidates
  for each row
  execute function internal.trg_mission_candidate_daily_rate_change();

create or replace function internal.trg_mission_daily_rate_change()
returns trigger
language plpgsql
as $$
declare
  r record;
begin
  if new.daily_rate is distinct from old.daily_rate then
    for r in select candidate_id from mission_candidates where mission_id = new.id loop
      perform public.calculate_daily_rate_hard_gate(r.candidate_id, new.id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger trg_recalculate_hard_gate_on_mission_ceiling_change
  after update on missions
  for each row
  execute function internal.trg_mission_daily_rate_change();
