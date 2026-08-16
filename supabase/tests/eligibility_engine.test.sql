-- =====================================================================
-- Tests du moteur d'éligibilité — comportements à effet de bord
-- (triggers, recalcul automatique) qui ne peuvent pas être couverts par
-- la fonction pure src/lib/eligibility.ts (voir eligibility.test.ts pour
-- les cas A-E, purement logiques).
--
-- Sortie : NOTICE si tout passe (sortie 0, CI verte), EXCEPTION au
-- premier échec (sortie non-zéro, fait échouer la CI). Fixtures nettoyées
-- systématiquement, y compris en cas d'échec (ROLLBACK implicite du bloc DO).
-- =====================================================================

do $$
declare
  v_tenant uuid;
  v_owner uuid := gen_random_uuid();
  v_mission uuid;
  v_candidate uuid;
  v_criterion uuid;
  v_shortlist uuid;
  v_status text;
  v_flags text[];
  v_requires_review boolean;
  v_report text := '';
begin
  insert into tenants (name) values ('TEST eligibility engine') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-eligibility-owner@example.invalid', crypt('test-only', gen_salt('bf')), now(), now(), now(), '{}', '{}');
  insert into app_users (id, tenant_id, email, role) values (v_owner, v_tenant, 'test-eligibility-owner@example.invalid', 'owner');

  insert into missions (tenant_id, title, source, created_by) values (v_tenant, 'TEST mission eligibility', 'direct', v_owner) returning id into v_mission;
  insert into candidates (tenant_id, full_name) values (v_tenant, 'TEST candidat eligibility') returning id into v_candidate;
  insert into brief_criteria (tenant_id, mission_id, label, weight, source) values (v_tenant, v_mission, 'React obligatoire', 3, 'manual') returning id into v_criterion;

  -- --- Sanity check : le trigger sur mission_candidates INSERT calcule
  -- immédiatement (pas de laisser au défaut statique) ---
  insert into mission_candidates (tenant_id, mission_id, candidate_id, stage_id)
  values (v_tenant, v_mission, v_candidate, (select id from pipeline_stages where tenant_id = v_tenant limit 1));

  select eligibility_status into v_status from mission_candidates where mission_id = v_mission and candidate_id = v_candidate;
  if v_status != 'NOT_QUALIFIED' then
    raise exception 'FAIL sanity check : devrait être NOT_QUALIFIED sans preuve, obtenu %', v_status;
  end if;
  v_report := v_report || E'PASS sanity check : trigger insert calcule immédiatement (NOT_QUALIFIED sans preuve)\n';

  -- --- Le trigger sur evidence INSERT recalcule automatiquement ---
  insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority)
  values (v_tenant, v_candidate, v_criterion, 'VERIFIED', false, 'self_declared', 1);

  select eligibility_status into v_status from mission_candidates where mission_id = v_mission and candidate_id = v_candidate;
  if v_status != 'ELIGIBLE' then
    raise exception 'FAIL : après evidence VERIFIED sur seul obligatoire, devrait être ELIGIBLE, obtenu %', v_status;
  end if;
  v_report := v_report || E'PASS : evidence VERIFIED déclenche recalcul automatique -> ELIGIBLE\n';

  -- --- Cas F : candidat shortlisté, puis nouvelle preuve contradictoire ---
  insert into shortlists (tenant_id, mission_id, name) values (v_tenant, v_mission, 'TEST shortlist eligibility') returning id into v_shortlist;
  insert into shortlist_candidates (tenant_id, shortlist_id, candidate_id) values (v_tenant, v_shortlist, v_candidate);

  select requires_review into v_requires_review from shortlist_candidates where shortlist_id = v_shortlist and candidate_id = v_candidate;
  if v_requires_review != false then
    raise exception 'FAIL : requires_review devrait être false juste après ajout à la shortlist (candidat encore ELIGIBLE)';
  end if;

  -- Nouvelle preuve : le candidat n'a en fait PAS React (contradiction)
  update evidence set status = 'CONTRADICTED' where candidate_id = v_candidate and criterion_id = v_criterion;

  select eligibility_status into v_status from mission_candidates where mission_id = v_mission and candidate_id = v_candidate;
  if v_status != 'INELIGIBLE' then
    raise exception 'FAIL : après CONTRADICTED, devrait être INELIGIBLE, obtenu %', v_status;
  end if;

  select requires_review into v_requires_review from shortlist_candidates where shortlist_id = v_shortlist and candidate_id = v_candidate;
  if v_requires_review != true then
    raise exception 'FAIL cas F : requires_review devrait être true après contradiction post-shortlist';
  end if;

  -- Décision 2, vérifiée explicitement : le candidat reste dans la
  -- shortlist (historique conservé), pas de retrait automatique
  if not exists (select 1 from shortlist_candidates where shortlist_id = v_shortlist and candidate_id = v_candidate) then
    raise exception 'FAIL cas F : le candidat a été retiré automatiquement de la shortlist — jamais attendu';
  end if;
  v_report := v_report || E'PASS cas F : shortlisté puis CONTRADICTED -> INELIGIBLE + requires_review=true, jamais retiré de la shortlist (historique conservé)\n';

  -- --- Décision 1, vérifiée via le vrai trigger (pas seulement la fonction pure) ---
  delete from brief_criteria where id = v_criterion; -- plus aucun obligatoire sur cette mission
  select eligibility_status, eligibility_flags into v_status, v_flags from mission_candidates where mission_id = v_mission and candidate_id = v_candidate;
  if v_status != 'ELIGIBLE' or not ('NO_HARD_CONSTRAINTS' = any(v_flags)) then
    raise exception 'FAIL Décision 1 via trigger réel : attendu ELIGIBLE+NO_HARD_CONSTRAINTS, obtenu % %', v_status, v_flags;
  end if;
  v_report := v_report || E'PASS Décision 1 via trigger brief_criteria DELETE : plus aucun obligatoire -> ELIGIBLE+NO_HARD_CONSTRAINTS\n';

  -- Nettoyage
  delete from shortlist_candidates where shortlist_id = v_shortlist;
  delete from shortlists where id = v_shortlist;
  delete from evidence where candidate_id = v_candidate;
  delete from mission_candidates where mission_id = v_mission;
  delete from candidates where id = v_candidate;
  delete from missions where id = v_mission;
  delete from app_users where id = v_owner;
  delete from auth.users where id = v_owner;
  delete from tenants where id = v_tenant;

  raise notice '%', v_report || '=== TOUS LES TESTS ELIGIBILITY ENGINE PASSENT, FIXTURES NETTOYÉES ===';
end $$;
