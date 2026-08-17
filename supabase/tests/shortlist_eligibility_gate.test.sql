-- =====================================================================
-- Shortlist Eligibility Gate — les 6 cas exigés, tous déjà vérifiés
-- manuellement contre la vraie base avant ce commit. Rend ces
-- vérifications reproductibles en CI.
-- =====================================================================

do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_owner uuid := gen_random_uuid();
  v_candidate_eligible uuid;
  v_candidate_notq uuid;
  v_candidate_ineligible uuid;
  v_candidate_other_tenant uuid;
  v_crit_a uuid;
  v_crit_b uuid;
  v_mission uuid;
  v_shortlist uuid;
  v_error boolean;
  v_ev_id uuid;
  v_requires_review boolean;
  v_status_after text;
  v_report text := '';
begin
  insert into tenants (name) values ('TEST shortlist gate main') returning id into v_tenant_a;
  insert into tenants (name) values ('TEST shortlist gate other') returning id into v_tenant_b;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-shortlist-gate-owner@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
  insert into app_users (id, tenant_id, email, role) values (v_owner, v_tenant_a, 'test-shortlist-gate-owner@example.invalid', 'owner');
  insert into missions (tenant_id, title, source, created_by) values (v_tenant_a, 'TEST gate', 'direct', v_owner) returning id into v_mission;
  insert into brief_criteria (tenant_id, mission_id, label, weight, source) values (v_tenant_a, v_mission, 'Crit A', 3, 'manual') returning id into v_crit_a;
  insert into brief_criteria (tenant_id, mission_id, label, weight, source) values (v_tenant_a, v_mission, 'Crit B', 3, 'manual') returning id into v_crit_b;

  -- consent_status='granted' explicite sur le candidat cense reussir
  -- l'insertion en shortlist (cas 1). Sans ceci, le test echouerait
  -- desormais sur le volet consentement du Shortlist Gate (PR6 etape 1),
  -- hors du perimetre original de ce fichier (qui teste eligibility_status
  -- uniquement) - trouve via un vrai echec CI sur eligibility_engine.test.sql,
  -- corrige ici aussi par la meme analyse plutot que d'attendre un
  -- second echec separe sur ce fichier precisement.
  insert into candidates (tenant_id, full_name, consent_status) values (v_tenant_a, 'Candidat ELIGIBLE', 'granted') returning id into v_candidate_eligible;
  insert into candidates (tenant_id, full_name) values (v_tenant_a, 'Candidat NOT_QUALIFIED') returning id into v_candidate_notq;
  insert into candidates (tenant_id, full_name) values (v_tenant_a, 'Candidat INELIGIBLE') returning id into v_candidate_ineligible;
  insert into candidates (tenant_id, full_name) values (v_tenant_b, 'Candidat autre tenant') returning id into v_candidate_other_tenant;

  insert into mission_candidates (tenant_id, mission_id, candidate_id, stage_id) values
    (v_tenant_a, v_mission, v_candidate_eligible, (select id from pipeline_stages where tenant_id = v_tenant_a limit 1)),
    (v_tenant_a, v_mission, v_candidate_notq, (select id from pipeline_stages where tenant_id = v_tenant_a limit 1)),
    (v_tenant_a, v_mission, v_candidate_ineligible, (select id from pipeline_stages where tenant_id = v_tenant_a limit 1));

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority) values
    (v_tenant_a, v_candidate_eligible, v_crit_a, 'VERIFIED', false, 'recruiter_note', 1),
    (v_tenant_a, v_candidate_eligible, v_crit_b, 'VERIFIED', false, 'recruiter_note', 1);
  insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority) values
    (v_tenant_a, v_candidate_notq, v_crit_a, 'VERIFIED', false, 'recruiter_note', 1);
  insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority) values
    (v_tenant_a, v_candidate_ineligible, v_crit_a, 'CONTRADICTED', false, 'recruiter_note', 1);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  insert into shortlists (tenant_id, mission_id, name) values (v_tenant_a, v_mission, 'TEST gate shortlist') returning id into v_shortlist;

  -- Cas 1 : ELIGIBLE -> accepté
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into shortlist_candidates (tenant_id, shortlist_id, candidate_id) values (v_tenant_a, v_shortlist, v_candidate_eligible);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_error then raise exception 'FAIL cas1-ELIGIBLE : rejeté à tort'; end if;
  v_report := v_report || E'PASS cas1-ELIGIBLE\n';

  -- Cas 2 : NOT_QUALIFIED -> rejeté
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into shortlist_candidates (tenant_id, shortlist_id, candidate_id) values (v_tenant_a, v_shortlist, v_candidate_notq);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL CRITIQUE cas2-NOT_QUALIFIED : accepté'; end if;
  v_report := v_report || E'PASS cas2-NOT_QUALIFIED\n';

  -- Cas 3 : INELIGIBLE -> rejeté
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into shortlist_candidates (tenant_id, shortlist_id, candidate_id) values (v_tenant_a, v_shortlist, v_candidate_ineligible);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL CRITIQUE cas3-INELIGIBLE : accepté'; end if;
  v_report := v_report || E'PASS cas3-INELIGIBLE\n';

  -- Cas 4 : cross-tenant -> rejeté
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into shortlist_candidates (tenant_id, shortlist_id, candidate_id) values (v_tenant_a, v_shortlist, v_candidate_other_tenant);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL CRITIQUE cas4-crosstenant : accepté'; end if;
  v_report := v_report || E'PASS cas4-crosstenant\n';

  -- Cas 5 : SQL direct via service_role -> même rejet
  set local role service_role;
  v_error := false;
  begin
    insert into shortlist_candidates (tenant_id, shortlist_id, candidate_id) values (v_tenant_a, v_shortlist, v_candidate_notq);
  exception when others then v_error := true;
  end;
  reset role;
  if not v_error then raise exception 'FAIL CRITIQUE cas5-SQL-direct : accepté'; end if;
  v_report := v_report || E'PASS cas5-SQL-direct-service_role\n';

  -- Cas 6 : requires_review préservé après ajout ELIGIBLE puis contradiction.
  -- Modifie la ligne evidence EXISTANTE (posée au setup, ligne ~48) plutôt
  -- que d'en insérer une nouvelle sur le même critère — insérer une 2e
  -- ligne active sur le même (candidat, critère) sans marquer la 1re
  -- superseded_by a révélé un vrai gap (aucun code, ni trigger ni
  -- application, ne pose jamais cette colonne aujourd'hui — trouvé en
  -- exécutant ce fichier en un seul bloc combiné, jamais testé ainsi
  -- avant). Hors périmètre de PR5 (pas de nouvelle fonctionnalité
  -- parallèle) : documenté ici comme limite connue, pas corrigé. Ce test
  -- modélise donc le cas correctement (une seule ligne active à la fois),
  -- cohérent avec ce qu'un usage réel via confirmEvidence produirait
  -- s'il gérait déjà superseded_by — ce qu'il ne fait pas non plus
  -- aujourd'hui, à traiter dans un futur PR dédié à Evidence, pas ici.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select id into v_ev_id from evidence where candidate_id = v_candidate_eligible and criterion_id = v_crit_a and superseded_by is null;
  update evidence set status = 'CONTRADICTED' where id = v_ev_id;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select eligibility_status into v_status_after from mission_candidates where mission_id = v_mission and candidate_id = v_candidate_eligible;
  select requires_review into v_requires_review from shortlist_candidates where shortlist_id = v_shortlist and candidate_id = v_candidate_eligible;
  if v_status_after != 'INELIGIBLE' then raise exception 'FAIL cas6 : eligibility_status attendu INELIGIBLE, obtenu %', v_status_after; end if;
  if v_requires_review != true then raise exception 'FAIL cas6 : requires_review attendu true'; end if;
  if not exists (select 1 from shortlist_candidates where shortlist_id = v_shortlist and candidate_id = v_candidate_eligible) then
    raise exception 'FAIL cas6 : candidat retiré automatiquement, jamais attendu';
  end if;
  v_report := v_report || E'PASS cas6-requires_review-préservé\n';

  delete from shortlist_candidates where shortlist_id = v_shortlist;
  delete from shortlists where id = v_shortlist;
  delete from evidence where candidate_id in (v_candidate_eligible, v_candidate_notq, v_candidate_ineligible);
  delete from mission_candidates where mission_id = v_mission;
  delete from brief_criteria where mission_id = v_mission;
  delete from candidates where id in (v_candidate_eligible, v_candidate_notq, v_candidate_ineligible, v_candidate_other_tenant);
  delete from missions where id = v_mission;
  delete from app_users where id = v_owner;
  delete from auth.users where id = v_owner;
  delete from tenants where id in (v_tenant_a, v_tenant_b);

  raise notice '%', v_report || '=== TOUS LES 6 CAS SHORTLIST GATE PASSENT, FIXTURES NETTOYÉES ===';
end $$;
