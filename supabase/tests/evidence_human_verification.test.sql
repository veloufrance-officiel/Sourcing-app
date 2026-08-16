-- =====================================================================
-- Durcissement Evidence — les 11 cas exigés, tous déjà vérifiés
-- manuellement contre la vraie base avant ce commit (voir rapport de
-- revue). Ce fichier les rend reproductibles en CI.
--
-- Sortie : NOTICE si tout passe (sortie 0), EXCEPTION au premier échec
-- (sortie non-zéro, fixtures annulées par ROLLBACK implicite du DO).
-- =====================================================================

do $$
declare
  v_tenant uuid;
  v_owner uuid := gen_random_uuid();
  v_second_user uuid := gen_random_uuid();
  v_candidate uuid;
  v_criterion1 uuid;
  v_criterion2 uuid;
  v_mission uuid;
  v_ev uuid;
  v_ev2 uuid;
  v_verified_by uuid;
  v_verified_at timestamptz;
  v_status text;
  v_count int;
  v_error boolean;
  v_report text := '';
begin
  insert into tenants (name) values ('TEST evidence human verification') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data) values
    (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-hv-owner@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}'),
    (v_second_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-hv-second@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
  insert into app_users (id, tenant_id, email, role) values
    (v_owner, v_tenant, 'test-hv-owner@example.invalid', 'owner'),
    (v_second_user, v_tenant, 'test-hv-second@example.invalid', 'recruiter');

  insert into missions (tenant_id, title, source, created_by) values (v_tenant, 'TEST mission hv', 'direct', v_owner) returning id into v_mission;
  insert into candidates (tenant_id, full_name) values (v_tenant, 'TEST candidat hv') returning id into v_candidate;
  insert into brief_criteria (tenant_id, mission_id, label, weight, source) values (v_tenant, v_mission, 'Critère 1', 3, 'manual') returning id into v_criterion1;
  insert into brief_criteria (tenant_id, mission_id, label, weight, source) values (v_tenant, v_mission, 'Critère 2', 3, 'manual') returning id into v_criterion2;

  -- Cas 1 : service_role, VERIFIED -> rejeté
  set local role service_role;
  v_error := false;
  begin
    insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority)
    values (v_tenant, v_candidate, v_criterion1, 'VERIFIED', false, 'web_search', 3);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL cas 1 : VERIFIED sans session humaine accepté'; end if;
  v_report := v_report || E'PASS cas 1\n';

  -- Cas 2 : service_role, CONTRADICTED -> rejeté
  set local role service_role;
  v_error := false;
  begin
    insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority)
    values (v_tenant, v_candidate, v_criterion1, 'CONTRADICTED', false, 'web_search', 3);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL cas 2 : CONTRADICTED sans session humaine accepté'; end if;
  v_report := v_report || E'PASS cas 2\n';

  -- Cas 3 : utilisateur authentifié, VERIFIED -> accepté, verified_by/verified_at corrects
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority)
  values (v_tenant, v_candidate, v_criterion1, 'VERIFIED', false, 'self_declared', 1)
  returning id, verified_by, verified_at into v_ev, v_verified_by, v_verified_at;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_verified_by != v_owner then raise exception 'FAIL cas 3 : verified_by incorrect (%)', v_verified_by; end if;
  if v_verified_at is null then raise exception 'FAIL cas 3 : verified_at non posé'; end if;
  v_report := v_report || E'PASS cas 3\n';

  -- Cas 4 : utilisateur authentifié, CONTRADICTED -> accepté, verified_by correct
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority)
  values (v_tenant, v_candidate, v_criterion2, 'CONTRADICTED', false, 'self_declared', 1)
  returning id, verified_by into v_ev2, v_verified_by;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_verified_by != v_owner then raise exception 'FAIL cas 4 : verified_by incorrect sur CONTRADICTED'; end if;
  v_report := v_report || E'PASS cas 4\n';

  -- Cas 5 : faux verified_by fourni par l'appelant -> ignoré, écrasé par la DB
  declare
    v_fake_id uuid := gen_random_uuid();
    v_ev5 uuid;
    v_vb5 uuid;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority, verified_by, verified_at)
    values (v_tenant, v_candidate, v_criterion1, 'VERIFIED', false, 'self_declared', 1, v_fake_id, '2000-01-01')
    returning id, verified_by into v_ev5, v_vb5;
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
    if v_vb5 = v_fake_id then raise exception 'FAIL CRITIQUE cas 5 : faux verified_by accepté tel quel'; end if;
    if v_vb5 != v_owner then raise exception 'FAIL cas 5 : verified_by inattendu (%)', v_vb5; end if;
    delete from evidence where id = v_ev5;
  end;
  v_report := v_report || E'PASS cas 5\n';

  -- Cas 6 : modification sans rapport par un 2e utilisateur -> verified_by protégé
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_second_user::text, true);
  update evidence set evidence_text = 'modification sans rapport' where id = v_ev;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select verified_by into v_verified_by from evidence where id = v_ev;
  if v_verified_by != v_owner then raise exception 'FAIL CRITIQUE cas 6 : verified_by réattribué (%)', v_verified_by; end if;
  v_report := v_report || E'PASS cas 6\n';

  -- Cas 7 : reproduction exacte de la faille confirmée en revue
  set local role service_role;
  v_error := false;
  begin
    insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, evidence_text, source_type, source_priority)
    values (v_tenant, v_candidate, v_criterion1, 'VERIFIED', false, 'Extrait automatiquement', 'web_search', 3);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL CRITIQUE cas 7 : faille originale toujours exploitable'; end if;
  v_report := v_report || E'PASS cas 7\n';

  -- Cas 8 : idem pour CONTRADICTED
  set local role service_role;
  v_error := false;
  begin
    insert into evidence (tenant_id, candidate_id, criterion_id, status, is_inference, source_type, source_priority)
    values (v_tenant, v_candidate, v_criterion1, 'CONTRADICTED', false, 'web_search', 3);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if not v_error then raise exception 'FAIL cas 8'; end if;
  v_report := v_report || E'PASS cas 8\n';

  -- Cas 9 : VERIFIED -> NOT_VERIFIED sans session humaine
  set local role service_role;
  update evidence set status = 'NOT_VERIFIED' where id = v_ev;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select verified_by, verified_at into v_verified_by, v_verified_at from evidence where id = v_ev;
  if v_verified_by is not null or v_verified_at is not null then
    raise exception 'FAIL cas 9 : verified_by/verified_at non nettoyés';
  end if;
  v_report := v_report || E'PASS cas 9\n';

  -- Cas 10 : CONTRADICTED -> NOT_VERIFIED sans session humaine
  set local role service_role;
  update evidence set status = 'NOT_VERIFIED' where id = v_ev2;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select verified_by, verified_at into v_verified_by, v_verified_at from evidence where id = v_ev2;
  if v_verified_by is not null or v_verified_at is not null then
    raise exception 'FAIL cas 10 : verified_by/verified_at non nettoyés depuis CONTRADICTED';
  end if;
  v_report := v_report || E'PASS cas 10\n';

  -- Cas 11 : isolation cross-tenant, aucune nouvelle voie
  declare
    v_attacker uuid := gen_random_uuid();
    v_attacker_tenant uuid;
  begin
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_attacker, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-hv-attacker@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
    insert into tenants (name) values ('TEST hv attacker tenant') returning id into v_attacker_tenant;
    insert into app_users (id, tenant_id, email, role) values (v_attacker, v_attacker_tenant, 'test-hv-attacker@example.invalid', 'owner');

    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_attacker::text, true);
    update evidence set status = 'CONTRADICTED' where id = v_ev;
    get diagnostics v_count = row_count;
    if v_count > 0 then raise exception 'FAIL CRITIQUE cas 11 : attaquant cross-tenant a modifié une evidence réelle'; end if;
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claim.sub', '', true);

    delete from app_users where id = v_attacker;
    delete from auth.users where id = v_attacker;
    delete from tenants where id = v_attacker_tenant;
  end;
  v_report := v_report || E'PASS cas 11\n';

  -- Nettoyage
  delete from evidence where candidate_id = v_candidate;
  delete from brief_criteria where mission_id = v_mission;
  delete from candidates where id = v_candidate;
  delete from missions where id = v_mission;
  delete from app_users where id in (v_owner, v_second_user);
  delete from auth.users where id in (v_owner, v_second_user);
  delete from tenants where id = v_tenant;

  raise notice '%', v_report || '=== TOUS LES 11 CAS PASSENT, FIXTURES NETTOYÉES ===';
end $$;
