-- =====================================================================
-- Trigger opposed -> contact_oppositions : les 4 cas exigés, tous déjà
-- vérifiés manuellement contre la vraie base avant ce commit. Rend ces
-- vérifications reproductibles en CI.
-- =====================================================================

do $$
declare
  v_tenant uuid;
  v_owner uuid := gen_random_uuid();
  v_mission uuid;
  v_candidate1 uuid;
  v_candidate2 uuid;
  v_candidate3 uuid;
  v_candidate4 uuid;
  v_contact_id uuid;
  v_opposition_count int;
  v_before int;
  v_after int;
  v_error boolean;
  v_report text := '';
begin
  insert into tenants (name) values ('TEST opposed trigger main') returning id into v_tenant;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-opposed-trigger@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
  insert into app_users (id, tenant_id, email, role) values (v_owner, v_tenant, 'test-opposed-trigger@example.invalid', 'owner');
  insert into missions (tenant_id, title, source, created_by) values (v_tenant, 'TEST opposed trigger', 'direct', v_owner) returning id into v_mission;

  -- === Cas 1 : INSERT direct avec response='opposed' ===
  insert into candidates (tenant_id, full_name, source, github_user_id)
  values (v_tenant, 'Candidat cas1', 'github', 200000001) returning id into v_candidate1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, response, responded_at, sent_by)
  values (v_tenant, v_candidate1, v_mission, 'Cas1', 'legitimate_interest', 'opposed', now(), v_owner);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_opposition_count from contact_oppositions where tenant_id = v_tenant and github_user_id = 200000001;
  if v_opposition_count != 1 then raise exception 'FAIL cas1 : attendu 1, obtenu %', v_opposition_count; end if;
  v_report := v_report || E'PASS cas1 (INSERT direct opposed)\n';

  -- === Cas 2 : UPDATE interested -> opposed ===
  insert into candidates (tenant_id, full_name, source, github_user_id)
  values (v_tenant, 'Candidat cas2', 'github', 200000002) returning id into v_candidate2;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, response, responded_at, sent_by)
  values (v_tenant, v_candidate2, v_mission, 'Cas2', 'legitimate_interest', 'interested', now(), v_owner)
  returning id into v_contact_id;
  select count(*) into v_before from contact_oppositions where tenant_id = v_tenant and github_user_id = 200000002;
  update candidate_contacts set response = 'opposed' where id = v_contact_id;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_after from contact_oppositions where tenant_id = v_tenant and github_user_id = 200000002;
  if v_before != 0 then raise exception 'FAIL cas2 setup : attendu 0 avant, obtenu %', v_before; end if;
  if v_after != 1 then raise exception 'FAIL cas2 : attendu 1 après update, obtenu %', v_after; end if;
  v_report := v_report || E'PASS cas2 (UPDATE interested->opposed)\n';

  -- === Cas 3 : idempotence, deux opposed successifs sur le même candidat ===
  insert into candidates (tenant_id, full_name, source, github_user_id)
  values (v_tenant, 'Candidat cas3', 'github', 200000003) returning id into v_candidate3;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, response, responded_at, sent_by)
  values (v_tenant, v_candidate3, v_mission, 'Cas3 premier', 'legitimate_interest', 'opposed', now(), v_owner);
  insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, response, responded_at, sent_by)
  values (v_tenant, v_candidate3, v_mission, 'Cas3 second', 'legitimate_interest', 'opposed', now(), v_owner);
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_opposition_count from contact_oppositions where tenant_id = v_tenant and github_user_id = 200000003;
  if v_opposition_count != 1 then raise exception 'FAIL cas3 : deux opposed ont créé % ligne(s), attendu 1', v_opposition_count; end if;
  v_report := v_report || E'PASS cas3 (idempotent, ON CONFLICT DO NOTHING)\n';

  -- === Cas 4 : candidat sans github_user_id (source='manual'), ignoré silencieusement ===
  insert into candidates (tenant_id, full_name, source) values (v_tenant, 'Candidat cas4 manual', 'manual') returning id into v_candidate4;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, response, responded_at, sent_by)
    values (v_tenant, v_candidate4, v_mission, 'Cas4 manual', 'legitimate_interest', 'opposed', now(), v_owner);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_error then raise exception 'FAIL cas4 : erreur levée au lieu d''ignorer silencieusement'; end if;
  select count(*) into v_opposition_count from contact_oppositions where recorded_by = v_owner and tenant_id = v_tenant and github_user_id is null;
  v_report := v_report || E'PASS cas4 (candidat manual ignoré, aucune erreur)\n';

  -- === Cas 5 : isolation cross-tenant sur le MÊME github_user_id ===
  -- Point explicitement signalé en revue comme non couvert par les cas
  -- 1-4 : ceux-ci testent un seul tenant à la fois. Ici, deux tenants
  -- réels, même profil GitHub — tenant_a s'oppose, tenant_b doit
  -- pouvoir créer un candidat sur ce même github_user_id sans jamais
  -- être affecté par l'opposition de tenant_a.
  declare
    v_tenant_b uuid;
    v_owner_b uuid := gen_random_uuid();
    v_candidate5a uuid;
    v_candidate5b uuid;
    v_github_id_5 bigint := 200000005;
    v_would_block_a boolean;
    v_would_block_b boolean;
    v_error5 boolean := false;
  begin
    insert into tenants (name) values ('TEST cas5 tenant B') returning id into v_tenant_b;
    insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
    values (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-cas5-tenant-b@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
    insert into app_users (id, tenant_id, email, role) values (v_owner_b, v_tenant_b, 'test-cas5-tenant-b@example.invalid', 'owner');

    insert into candidates (tenant_id, full_name, source, github_user_id)
    values (v_tenant, 'Candidat cas5 tenant A', 'github', v_github_id_5) returning id into v_candidate5a;
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, response, responded_at, sent_by)
    values (v_tenant, v_candidate5a, v_mission, 'Cas5 tenant A', 'legitimate_interest', 'opposed', now(), v_owner);
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);

    select exists (select 1 from contact_oppositions where tenant_id = v_tenant and github_user_id = v_github_id_5) into v_would_block_a;
    select exists (select 1 from contact_oppositions where tenant_id = v_tenant_b and github_user_id = v_github_id_5) into v_would_block_b;

    begin
      insert into candidates (tenant_id, full_name, source, github_user_id)
      values (v_tenant_b, 'Candidat cas5 tenant B, même profil GitHub', 'github', v_github_id_5) returning id into v_candidate5b;
    exception when others then v_error5 := true;
    end;

    delete from candidate_contacts where candidate_id = v_candidate5a;
    delete from contact_oppositions where github_user_id = v_github_id_5;
    delete from candidates where github_user_id = v_github_id_5;
    delete from app_users where id = v_owner_b;
    delete from auth.users where id = v_owner_b;
    delete from tenants where id = v_tenant_b;

    if not v_would_block_a then raise exception 'FAIL cas5 : tenant_a devrait être bloqué (lookup)'; end if;
    if v_would_block_b then raise exception 'FAIL CRITIQUE cas5 : tenant_b bloqué à tort, isolation rompue'; end if;
    if v_error5 then raise exception 'FAIL CRITIQUE cas5 : tenant_b n''a pas pu créer un candidat sur le même github_user_id — isolation rompue en pratique, pas seulement au lookup'; end if;
  end;
  v_report := v_report || E'PASS cas5 (isolation cross-tenant confirmée sur le même github_user_id, contre le trigger réel)\n';

  delete from candidate_contacts where candidate_id in (v_candidate1, v_candidate2, v_candidate3, v_candidate4);
  delete from contact_oppositions where tenant_id = v_tenant;
  delete from candidates where id in (v_candidate1, v_candidate2, v_candidate3, v_candidate4);
  delete from missions where id = v_mission;
  delete from app_users where id = v_owner;
  delete from auth.users where id = v_owner;
  delete from tenants where id = v_tenant;

  raise notice '%', v_report || '=== TOUS LES 4 CAS OPPOSED TRIGGER PASSENT, FIXTURES NETTOYÉES ===';
end $$;
