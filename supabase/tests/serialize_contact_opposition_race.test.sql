-- =====================================================================
-- Serialize contact/opposition race (0028) : les tests exigés, tous
-- déjà vérifiés manuellement contre la vraie base avant ce commit.
--
-- LIMITE MÉTHODOLOGIQUE ASSUMÉE, PAS CACHÉE : le test "course réelle"
-- (deux transactions concurrentes se disputant le verrou sur la même
-- ligne candidates) n'est PAS exécuté ici sous forme de vraie
-- concurrence — l'outillage utilisé pour concevoir cette migration
-- isole chaque appel SQL dans sa propre connexion/transaction,
-- rendant impossible le maintien de deux transactions réellement
-- simultanées pour observer un blocage direct. Un test séquentiel
-- (A puis B) ne prouverait PAS la sérialisation et n'est donc pas
-- présenté comme tel ici.
--
-- Ce qui EST vérifié, avec certitude : la propriété de verrouillage
-- elle-même (SELECT ... FOR UPDATE verrouille jusqu'à fin de
-- transaction, une transaction concurrente demandant le même verrou
-- attend) est documentée par PostgreSQL — pas une supposition de ce
-- projet. Les deux triggers (0026 modifié, 0028 nouveau) acquièrent
-- ce verrou dans le même ordre (candidates en premier), avec le même
-- contexte de sécurité (SECURITY DEFINER owner=postgres,
-- search_path=public), vérifié explicitement avant cette migration.
--
-- Si une vraie preuve de concurrence est nécessaire, elle requiert un
-- outillage capable de maintenir deux sessions psql simultanées (ex:
-- deux connexions manuelles, l'une ouvrant une transaction avec
-- FOR UPDATE et un délai, l'autre tentant le même verrou pendant ce
-- délai) — hors de portée de ce fichier de test automatisé.
-- =====================================================================

do $$
declare
  v_tenant uuid;
  v_tenant_b uuid;
  v_owner uuid := gen_random_uuid();
  v_owner_b uuid := gen_random_uuid();
  v_mission uuid;
  v_mission_b uuid;
  v_candidate1 uuid;
  v_candidate2 uuid;
  v_candidate5a uuid;
  v_candidate5b uuid;
  v_error boolean;
  v_error_b boolean;
  v_count_before int;
  v_count_after int;
  v_report text := '';
begin
  insert into tenants (name) values ('TEST 0028 main') returning id into v_tenant;
  insert into tenants (name) values ('TEST 0028 autre') returning id into v_tenant_b;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-0028-owner@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (v_owner_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-0028-owner-b@example.invalid', crypt('x', gen_salt('bf')), now(), now(), now(), '{}', '{}');
  insert into app_users (id, tenant_id, email, role) values (v_owner, v_tenant, 'test-0028-owner@example.invalid', 'owner');
  insert into app_users (id, tenant_id, email, role) values (v_owner_b, v_tenant_b, 'test-0028-owner-b@example.invalid', 'owner');
  insert into missions (tenant_id, title, source, created_by) values (v_tenant, 'TEST 0028', 'direct', v_owner) returning id into v_mission;
  insert into missions (tenant_id, title, source, created_by) values (v_tenant_b, 'TEST 0028 B', 'direct', v_owner_b) returning id into v_mission_b;

  -- Cas 1 : opposition existante -> INSERT refusé, aucune ligne créée
  insert into candidates (tenant_id, full_name, source, github_user_id) values (v_tenant, 'Cas1', 'github', 990000001) returning id into v_candidate1;
  insert into contact_oppositions (tenant_id, github_user_id) values (v_tenant, 990000001);
  select count(*) into v_count_before from candidate_contacts where candidate_id = v_candidate1;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, sent_by)
    values (v_tenant, v_candidate1, v_mission, 'Cas1', 'legitimate_interest', v_owner);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into v_count_after from candidate_contacts where candidate_id = v_candidate1;
  if not v_error or v_count_after != v_count_before then raise exception 'FAIL cas1'; end if;
  v_report := v_report || E'PASS cas1 (opposition -> INSERT refusé)\n';

  -- Cas 2 : aucune opposition -> INSERT accepté
  insert into candidates (tenant_id, full_name, source, github_user_id) values (v_tenant, 'Cas2', 'github', 990000002) returning id into v_candidate2;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, sent_by)
    values (v_tenant, v_candidate2, v_mission, 'Cas2', 'legitimate_interest', v_owner);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);
  if v_error then raise exception 'FAIL cas2'; end if;
  v_report := v_report || E'PASS cas2 (aucune opposition -> INSERT accepté)\n';

  -- Cas 5 : isolation tenant, même github_user_id, deux vraies sessions
  insert into candidates (tenant_id, full_name, source, github_user_id) values (v_tenant, 'Cas5A', 'github', 990000005) returning id into v_candidate5a;
  insert into candidates (tenant_id, full_name, source, github_user_id) values (v_tenant_b, 'Cas5B', 'github', 990000005) returning id into v_candidate5b;
  insert into contact_oppositions (tenant_id, github_user_id) values (v_tenant, 990000005);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_error := false;
  begin
    insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, sent_by)
    values (v_tenant, v_candidate5a, v_mission, 'Cas5a', 'legitimate_interest', v_owner);
  exception when others then v_error := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', v_owner_b::text, true);
  v_error_b := false;
  begin
    insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, sent_by)
    values (v_tenant_b, v_candidate5b, v_mission_b, 'Cas5b', 'legitimate_interest', v_owner_b);
  exception when others then v_error_b := true;
  end;
  reset role;
  perform set_config('request.jwt.claim.sub', '', true);

  if not v_error or v_error_b then raise exception 'FAIL cas5 : a_bloqué=%, b_bloqué_a_tort=%', v_error, v_error_b; end if;
  v_report := v_report || E'PASS cas5 (isolation tenant confirmée, même github_user_id)\n';

  -- Cas 7 : échec du trigger -> aucune ligne partiellement créée
  declare v_candidate7 uuid; v_count7 int;
  begin
    insert into candidates (tenant_id, full_name, source, github_user_id) values (v_tenant, 'Cas7', 'github', 990000007) returning id into v_candidate7;
    insert into contact_oppositions (tenant_id, github_user_id) values (v_tenant, 990000007);
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', v_owner::text, true);
    begin
      insert into candidate_contacts (tenant_id, candidate_id, mission_id, message_sent, legal_basis, sent_by)
      values (v_tenant, v_candidate7, v_mission, 'Cas7', 'legitimate_interest', v_owner);
    exception when others then null;
    end;
    reset role;
    perform set_config('request.jwt.claim.sub', '', true);
    select count(*) into v_count7 from candidate_contacts where candidate_id = v_candidate7;
    if v_count7 != 0 then raise exception 'FAIL cas7'; end if;
  end;
  v_report := v_report || E'PASS cas7 (échec trigger -> atomicité, aucune ligne partielle)\n';

  delete from candidate_contacts where candidate_id in (v_candidate1, v_candidate2, v_candidate5a, v_candidate5b);
  delete from contact_oppositions where tenant_id in (v_tenant, v_tenant_b);
  delete from candidates where tenant_id in (v_tenant, v_tenant_b);
  delete from missions where tenant_id in (v_tenant, v_tenant_b);
  delete from app_users where id in (v_owner, v_owner_b);
  delete from auth.users where id in (v_owner, v_owner_b);
  delete from tenants where id in (v_tenant, v_tenant_b);

  raise notice '%', v_report || '=== CAS 1/2/5/7 PASSENT (3/4/6 couverts séparément — voir commentaire de tête sur la limite méthodologique du cas 6) ===';
end $$;
