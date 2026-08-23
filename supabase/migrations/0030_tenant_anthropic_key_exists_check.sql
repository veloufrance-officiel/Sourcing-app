-- Complète get_tenant_anthropic_key_for_service (0011), jamais
-- remplacée : celle-ci reste la seule à déchiffrer la valeur réelle.
-- Cette nouvelle fonction répond uniquement à "un secret existe-t-il
-- pour ce tenant" — sans jamais le déchiffrer — pour permettre à
-- l'appelant TypeScript de distinguer NOT_CONFIGURED (cette fonction
-- retourne false) d'un vrai échec de récupération de la valeur (cette
-- fonction retourne true, mais l'appel à
-- get_tenant_anthropic_key_for_service échoue quand même) — jamais
-- confondus dans un seul fallback silencieux comme avant cette
-- migration.
--
-- Pourquoi pas réutiliser internal.has_tenant_anthropic_key() (0011) :
-- elle lit auth.uid() en interne, donc appelable uniquement dans un
-- contexte utilisateur authentifié — jamais depuis un appel
-- service_role avec un tenant_id déjà résolu, exactement le contexte
-- de getAnthropicClientForTenant.
--
-- vault.secrets (existence, jamais la valeur) plutôt que
-- vault.decrypted_secrets (déchiffrement réel) : cette fonction ne
-- doit jamais avoir accès à la valeur en clair, seulement confirmer
-- qu'une entrée existe.
create or replace function public.tenant_anthropic_key_exists_for_service(p_tenant_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from vault.secrets where name = 'anthropic_key:' || p_tenant_id::text
  );
end;
$$;

revoke all on function public.tenant_anthropic_key_exists_for_service(uuid) from public, anon, authenticated;
grant execute on function public.tenant_anthropic_key_exists_for_service(uuid) to service_role;
