-- Empêche un même profil GitHub d'être importé deux fois comme deux
-- candidats distincts au sein du même tenant. Vérifié avant cette
-- migration, pas supposé : 0 candidat avec github_user_id renseigné
-- actuellement en base (le sourcing GitHub existe architecturalement
-- mais n'a encore jamais été utilisé pour un import réel) — aucun
-- risque de casser des données existantes.
--
-- Portée : par tenant, pas globale. Cohérent avec l'isolation
-- multi-tenant déjà systématique dans ce schéma (aucune contrainte
-- cross-tenant ailleurs) — deux organisations distinctes peuvent
-- légitimement sourcer le même développeur GitHub indépendamment,
-- ce n'est pas un doublon au sens métier.
--
-- Index partiel (WHERE github_user_id IS NOT NULL) plutôt qu'une
-- contrainte UNIQUE classique : la colonne reste NULL pour tout
-- candidat non-GitHub (LinkedIn, CV, import manuel), et NULL ne
-- participe jamais à une contrainte d'unicité standard de toute façon
-- — mais un index partiel explicite documente l'intention plus
-- clairement qu'une contrainte multi-colonnes silencieuse.
create unique index candidates_github_user_id_unique_per_tenant
  on candidates (tenant_id, github_user_id)
  where github_user_id is not null;
