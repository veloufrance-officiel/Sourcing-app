-- Reconstruit depuis supabase_migrations.schema_migrations.statements
-- (appliqué à l'origine hors suivi de fichier, corrigé ici). Les valeurs
-- réelles des secrets (token bot, chat_id) NE SONT JAMAIS dans ce fichier
-- versionné — elles sont seedées séparément via vault.create_secret() en
-- one-off (dashboard Supabase ou execute_sql), jamais commité.

create extension if not exists pg_net with schema extensions;

create or replace function internal.notify_telegram(p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_chat_id text;
begin
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'telegram_bot_token';
  select decrypted_secret into v_chat_id from vault.decrypted_secrets where name = 'telegram_chat_id';

  -- Tant que les secrets ne sont pas seedés (ex: environnement de test/CI
  -- fraîchement monté), on ne tente rien plutôt que d'échouer bruyamment
  -- sur chaque trigger.
  if v_token is null or v_chat_id is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('chat_id', v_chat_id, 'text', p_text, 'parse_mode', 'HTML')
  );
end;
$$;

-- Nouvelle inscription : capte aussi bien un provisionnement manuel (SQL)
-- qu'un futur flux self-serve, puisque c'est un trigger sur la table,
-- pas un hook applicatif ponctuel.
create or replace function internal.notify_new_app_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform internal.notify_telegram('🆕 <b>Nouvel utilisateur</b> — ' || coalesce(new.email, new.id::text) || ' (' || new.role || ')');
  return new;
end;
$$;

create trigger trg_notify_new_app_user
  after insert on app_users
  for each row execute function internal.notify_new_app_user();
