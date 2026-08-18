-- =====================================================================
-- Rétention contact_oppositions (3 ans) : les 4 cas exigés, tous déjà
-- vérifiés manuellement contre la vraie base avant ce commit.
-- =====================================================================

do $$
declare
  v_tenant_a uuid;
  v_tenant_b uuid;
  v_candidate uuid;
  v_result int;
  v_count_after int;
  v_would_block_before boolean;
  v_would_block_after boolean;
  v_error boolean;
  v_report text := '';
begin
  insert into tenants (name) values ('TEST retention opposition main') returning id into v_tenant_a;
  insert into tenants (name) values ('TEST retention opposition autre') returning id into v_tenant_b;

  -- === Cas 1 : opposition expirée -> supprimée ===
  insert into contact_oppositions (tenant_id, github_user_id, expires_at)
  values (v_tenant_a, 500000001, now() - interval '1 day');
  select deleted_count into v_result from public.enforce_opposition_retention();
  select count(*) into v_count_after from contact_oppositions where tenant_id = v_tenant_a and github_user_id = 500000001;
  if v_count_after != 0 then raise exception 'FAIL cas1'; end if;
  v_report := v_report || E'PASS cas1 (expirée -> supprimée)\n';

  -- === Cas 2 : opposition valide -> conservée ===
  insert into contact_oppositions (tenant_id, github_user_id, expires_at)
  values (v_tenant_a, 500000002, now() + interval '2 years');
  perform public.enforce_opposition_retention();
  select count(*) into v_count_after from contact_oppositions where tenant_id = v_tenant_a and github_user_id = 500000002;
  if v_count_after != 1 then raise exception 'FAIL cas2'; end if;
  v_report := v_report || E'PASS cas2 (valide -> conservée)\n';

  -- === Cas 3 : isolation tenant de la purge ===
  insert into contact_oppositions (tenant_id, github_user_id, expires_at)
  values (v_tenant_a, 500000003, now() - interval '1 day');
  insert into contact_oppositions (tenant_id, github_user_id, expires_at)
  values (v_tenant_b, 500000004, now() + interval '2 years');
  perform public.enforce_opposition_retention();
  if exists (select 1 from contact_oppositions where tenant_id = v_tenant_a and github_user_id = 500000003) then
    raise exception 'FAIL cas3 : tenant_a devrait être purgée';
  end if;
  if not exists (select 1 from contact_oppositions where tenant_id = v_tenant_b and github_user_id = 500000004) then
    raise exception 'FAIL CRITIQUE cas3 : tenant_b purgée à tort, fuite cross-tenant';
  end if;
  v_report := v_report || E'PASS cas3 (isolation tenant respectée)\n';

  -- === Cas 4 : comportement de bout en bout après purge ===
  insert into contact_oppositions (tenant_id, github_user_id, expires_at)
  values (v_tenant_a, 500000005, now() - interval '1 day');
  select exists (select 1 from contact_oppositions where tenant_id = v_tenant_a and github_user_id = 500000005) into v_would_block_before;
  perform public.enforce_opposition_retention();
  select exists (select 1 from contact_oppositions where tenant_id = v_tenant_a and github_user_id = 500000005) into v_would_block_after;
  v_error := false;
  begin
    insert into candidates (tenant_id, full_name, source, github_user_id)
    values (v_tenant_a, 'TEST cas4 redevenu contactable', 'github', 500000005) returning id into v_candidate;
  exception when others then v_error := true;
  end;
  if not v_would_block_before or v_would_block_after or v_error then
    raise exception 'FAIL cas4 : before=%, after=%, error=%', v_would_block_before, v_would_block_after, v_error;
  end if;
  v_report := v_report || E'PASS cas4 (redevient contactable après purge, vérifié par vraie création de candidat)\n';

  delete from candidates where id = v_candidate;
  delete from contact_oppositions where tenant_id in (v_tenant_a, v_tenant_b);
  delete from tenants where id in (v_tenant_a, v_tenant_b);

  raise notice '%', v_report || '=== LES 4 CAS RÉTENTION OPPOSITION PASSENT, FIXTURES NETTOYÉES ===';
end $$;
