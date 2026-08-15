-- Rate limiting minimal, sans dépendance externe (pas de Redis/Upstash :
-- la table technique vit dans le Postgres déjà en place). Table cachée
-- dans internal (non exposée par l'API REST) ; seule une fonction RPC
-- volontairement étroite est exposée en public pour être appelable par
-- anon (nécessaire : le rate limit doit s'appliquer AVANT authentification,
-- ex. sur la demande de lien magique elle-même).
create table if not exists internal.rate_limits (
  key text primary key,
  window_start timestamptz not null default now(),
  count int not null default 1
);

create or replace function public.check_rate_limit(p_key text, p_max_attempts int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  select window_start, count into v_window_start, v_count
  from internal.rate_limits where key = p_key
  for update;

  if not found then
    insert into internal.rate_limits (key, window_start, count) values (p_key, now(), 1);
    return true;
  end if;

  if now() - v_window_start > make_interval(secs => p_window_seconds) then
    update internal.rate_limits set window_start = now(), count = 1 where key = p_key;
    return true;
  end if;

  if v_count >= p_max_attempts then
    return false;
  end if;

  update internal.rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to anon, authenticated;

-- Fondation RGPD : pas un module complet (volontairement, comme demandé)
-- — une vue qui rend visible ce qui dépasse sa date de rétention, pour
-- construire la purge/anonymisation au-dessus le moment venu.
-- security_invoker=true : respecte le RLS de l'appelant, chaque tenant
-- ne voit que ses propres candidats en retard de rétention.
create or replace view public.candidates_pending_retention_review
with (security_invoker = true) as
select id, tenant_id, full_name, data_retention_until, consent_status
from candidates
where data_retention_until is not null and data_retention_until < current_date;
