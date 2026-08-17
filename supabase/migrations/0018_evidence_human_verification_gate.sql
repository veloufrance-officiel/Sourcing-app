-- =====================================================================
-- Durcissement Evidence — faille confirmée en revue : is_inference=false
-- + status=VERIFIED + source_type=web_search s'insérait sans aucune
-- validation humaine (testé en conditions réelles, réussi, nettoyé).
-- is_inference était une protection déclarative (l'appelant peut mentir
-- dessus), pas une garantie d'intégrité.
--
-- Principe retenu : auth.uid() reflète une vraie session humaine (JWT
-- réel via cookies, voir src/lib/supabase/server.ts) — jamais falsifiable
-- par l'appelant, à l'inverse d'une colonne qu'il remplirait lui-même.
-- Un futur pipeline automatique (extraction CV, web search, IA) tournera
-- nécessairement via service_role (SUPABASE_SECRET_KEY, voir
-- src/lib/supabase/service.ts, même pattern que le cron RGPD déjà en
-- place) — auth.uid() y est structurellement NULL, aucune plomberie
-- nouvelle nécessaire pour que la restriction s'applique.
--
-- Migration additive : deux colonnes nullables, un trigger. Table
-- evidence vérifiée vide avant migration (0 ligne) — aucun backfill.
-- =====================================================================

alter table evidence add column verified_by uuid references app_users(id);
alter table evidence add column verified_at timestamptz;

create or replace function internal.enforce_human_verification()
returns trigger
language plpgsql
as $$
begin
  -- Retrait de confirmation (VERIFIED/CONTRADICTED -> NOT_VERIFIED) :
  -- retour vers l'état neutre/sûr par défaut de tout le modèle, pas une
  -- escalade de confiance ni une sanction. Ne grantit rien, ne pénalise
  -- rien -> pas besoin d'une session humaine pour cette direction
  -- précise. Décision explicite (cas 9/10), pas un oubli.
  if new.status = 'NOT_VERIFIED' then
    new.verified_by := null;
    new.verified_at := null;
    return new;
  end if;

  if new.status in ('VERIFIED', 'CONTRADICTED') then
    -- Nouvelle transition VERS verified/contradicted (insert direct, ou
    -- changement de statut réel) : exige une session humaine, tamponne
    -- à neuf. Sinon (ligne déjà verified/contradicted, modifiée pour une
    -- raison sans rapport avec la vérification elle-même) : préserve le
    -- tampon existant, ignore silencieusement toute tentative de
    -- l'appelant de le réécrire (cas 6 — ne pas réattribuer la
    -- vérification à qui a fait la dernière modification quelconque).
    if tg_op = 'INSERT' or old.status is distinct from new.status then
      if auth.uid() is null then
        raise exception 'Une session humaine authentifiée est requise pour marquer une preuve VERIFIED ou CONTRADICTED';
      end if;
      new.verified_by := auth.uid();
      new.verified_at := now();
    else
      new.verified_by := old.verified_by;
      new.verified_at := old.verified_at;
    end if;
    return new;
  end if;

  -- INFERRED_UNCONFIRMED : jamais un fait validé par construction (déjà
  -- garanti par la contrainte CHECK existante pour VERIFIED spécifiquement),
  -- nettoyage par cohérence si une ligne y transitait depuis un état vérifié.
  new.verified_by := null;
  new.verified_at := null;
  return new;
end;
$$;

-- BEFORE, pas AFTER : doit pouvoir modifier NEW avant écriture. S'exécute
-- nécessairement avant le trigger AFTER existant (recalcul d'éligibilité),
-- l'ordre BEFORE/AFTER est garanti par Postgres indépendamment de l'ordre
-- de création — aucun conflit à gérer.
create trigger trg_enforce_human_verification
  before insert or update on evidence
  for each row execute function internal.enforce_human_verification();
