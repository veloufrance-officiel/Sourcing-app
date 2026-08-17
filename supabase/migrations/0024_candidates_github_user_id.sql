-- =====================================================================
-- Correction de capture : github_user_id, l'identifiant numérique
-- stable retourné par l'API GitHub (user.id), jamais capturé jusqu'ici
-- — seul login (mutable, réutilisable après 90 jours selon la
-- documentation GitHub) l'était. Nécessaire avant de construire
-- contact_oppositions (hors périmètre de cette migration) : une
-- opposition durable a besoin d'une clé qui survit à un changement de
-- pseudo GitHub.
--
-- Contrainte conditionnelle, pas NOT NULL global : 74 candidats
-- source='manual' existent déjà en production (vérifié avant cette
-- migration), aucun n'aura jamais de github_user_id — une colonne
-- NOT NULL globale les casserait. La règle réelle est "obligatoire
-- quand source='github'", pas "toujours obligatoire".
--
-- bigint : l'API GitHub retourne un entier sans décimales: la
-- documentation officielle ne garantit pas de plafond précis, bigint
-- couvre large sans ambiguïté, cohérent avec le choix standard pour
-- un identifiant externe de ce type.
-- =====================================================================

alter table candidates add column github_user_id bigint;

alter table candidates add constraint candidates_github_user_id_required_check
  check (
    (source = 'github' and github_user_id is not null)
    or (source is distinct from 'github')
  );

-- Unique uniquement dans le scope tenant, pas globalement — deux
-- tenants différents peuvent légitimement découvrir et importer le
-- même profil GitHub public indépendamment l'un de l'autre.
create unique index idx_candidates_tenant_github_user_id
  on candidates(tenant_id, github_user_id)
  where github_user_id is not null;
