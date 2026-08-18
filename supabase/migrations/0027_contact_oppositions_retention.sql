-- =====================================================================
-- Rétention distincte pour contact_oppositions — 3 ans, pas les 2 ans
-- de candidates. Justification double : fonctionnelle (perdre
-- l'opposition anéantirait sa raison d'être face à une redécouverte)
-- et réglementaire (CNIL : les informations nécessaires à la prise en
-- compte d'une opposition doivent être conservées au minimum 3 ans,
-- et ne doivent servir à aucune autre finalité).
--
-- 0 ligne réelle en production au moment de cette migration (vérifié
-- avant d'écrire ce fichier) — DEFAULT s'applique proprement sans
-- aucune ligne historique à traiter avec une stratégie différente.
--
-- Trigger existant (0026) volontairement non touché : le DEFAULT
-- prend en charge expires_at automatiquement à chaque insertion, pas
-- besoin de modifier un corps de trigger déjà testé (5/5 cas).
-- candidates.data_retention_until, enforce_data_retention() et
-- anonymize_candidate() : aucun changé, les deux politiques restent
-- distinctes.
-- =====================================================================

alter table contact_oppositions
  add column expires_at timestamptz not null default (now() + interval '3 years');

-- =====================================================================
-- Fonction dédiée, pas une extension de enforce_data_retention() :
-- opération différente par nature (DELETE pur, pas d'anonymisation —
-- contact_oppositions ne contient déjà que github_user_id/tenant_id,
-- rien à vider) sur une table différente, avec une signature de
-- retour différente. Fusionner les deux forcerait une structure
-- artificielle.
-- =====================================================================

create or replace function public.enforce_opposition_retention()
returns table(deleted_count int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from contact_oppositions where expires_at < now();
  get diagnostics v_count = row_count;
  return query select v_count;
end;
$$;

revoke all on function public.enforce_opposition_retention() from public, anon, authenticated;
grant execute on function public.enforce_opposition_retention() to service_role;
