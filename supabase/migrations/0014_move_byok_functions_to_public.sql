-- Reconstruit depuis supabase_migrations.schema_migrations.statements.
-- internal.* n'est jamais exposé à PostgREST (protection volontaire pour
-- les fonctions qui n'ont aucune raison d'être appelées par le client,
-- ex. current_tenant_id()). Mais ces 4-là DOIVENT l'être : c'est tout leur
-- rôle. La sécurité vient des GRANT ciblés déjà posés, pas du schéma —
-- exactement le même modèle que check_rate_limit, déjà en public.
alter function internal.set_tenant_anthropic_key(text) set schema public;
alter function internal.remove_tenant_anthropic_key() set schema public;
alter function internal.has_tenant_anthropic_key() set schema public;
alter function internal.get_tenant_anthropic_key_for_service(uuid) set schema public;

-- Les GRANT survivent au déplacement de schéma, mais on revérifie pour être sûr :
revoke all on function public.get_tenant_anthropic_key_for_service(uuid) from public, anon, authenticated;
grant execute on function public.get_tenant_anthropic_key_for_service(uuid) to service_role;
grant execute on function public.set_tenant_anthropic_key(text) to authenticated;
grant execute on function public.remove_tenant_anthropic_key() to authenticated;
grant execute on function public.has_tenant_anthropic_key() to authenticated;
