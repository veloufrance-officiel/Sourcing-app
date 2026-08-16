-- Reconstruit depuis supabase_migrations.schema_migrations.statements
-- (appliqué à l'origine hors suivi de fichier, corrigé ici).
--
-- BYOK : chaque tenant peut connecter sa propre clé Anthropic plutôt que
-- de faire porter tous les coûts d'IA par le compte de la plateforme.
-- Stockage : Vault (chiffré), nommage déterministe par tenant plutôt
-- qu'une colonne pointant vers un id de secret (évite un désync possible
-- entre une colonne et la ligne vault réelle).
--
-- Surface exposée à authenticated : écrire/vérifier/supprimer, jamais lire
-- la valeur en clair. Seul service_role (jamais envoyé au navigateur, connu
-- uniquement du serveur Next.js) peut relire la clé, et seulement pour
-- l'utiliser immédiatement côté serveur au moment d'appeler Claude.

create or replace function internal.set_tenant_anthropic_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_role text;
  v_secret_name text;
begin
  select tenant_id into v_tenant_id from app_users where id = auth.uid();
  if v_tenant_id is null then
    raise exception 'Compte non rattaché à un tenant';
  end if;

  v_role := internal.current_user_role();
  if v_role not in ('owner', 'admin') then
    raise exception 'Seuls owner/admin peuvent configurer la clé API';
  end if;

  if p_key is null or length(trim(p_key)) < 10 then
    raise exception 'Clé invalide';
  end if;

  v_secret_name := 'anthropic_key:' || v_tenant_id::text;

  if exists (select 1 from vault.secrets where name = v_secret_name) then
    perform vault.update_secret((select id from vault.secrets where name = v_secret_name), trim(p_key));
  else
    perform vault.create_secret(trim(p_key), v_secret_name, 'Clé Anthropic BYOK du tenant ' || v_tenant_id::text);
  end if;
end;
$$;

create or replace function internal.remove_tenant_anthropic_key()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_role text;
begin
  select tenant_id into v_tenant_id from app_users where id = auth.uid();
  if v_tenant_id is null then
    raise exception 'Compte non rattaché à un tenant';
  end if;

  v_role := internal.current_user_role();
  if v_role not in ('owner', 'admin') then
    raise exception 'Seuls owner/admin peuvent supprimer la clé API';
  end if;

  delete from vault.secrets where name = 'anthropic_key:' || v_tenant_id::text;
end;
$$;

create or replace function internal.has_tenant_anthropic_key()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  select tenant_id into v_tenant_id from app_users where id = auth.uid();
  if v_tenant_id is null then return false; end if;
  return exists (select 1 from vault.secrets where name = 'anthropic_key:' || v_tenant_id::text);
end;
$$;

-- Lecture de la valeur en clair : jamais accessible à authenticated/anon,
-- uniquement au service_role (clé secrète Supabase, jamais côté client).
create or replace function internal.get_tenant_anthropic_key_for_service(p_tenant_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'anthropic_key:' || p_tenant_id::text;
  return v_key;
end;
$$;

grant execute on function internal.set_tenant_anthropic_key(text) to authenticated;
grant execute on function internal.remove_tenant_anthropic_key() to authenticated;
grant execute on function internal.has_tenant_anthropic_key() to authenticated;
revoke all on function internal.get_tenant_anthropic_key_for_service(uuid) from public, anon, authenticated;
grant execute on function internal.get_tenant_anthropic_key_for_service(uuid) to service_role;
