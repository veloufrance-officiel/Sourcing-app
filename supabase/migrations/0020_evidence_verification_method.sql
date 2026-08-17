-- Colonne proposée conceptuellement lors du durcissement Evidence
-- (verified_by/verified_at/verification_method) mais jamais réellement
-- ajoutée au schéma — seules verified_by/verified_at l'ont été (migration
-- 0018). Trouvé en écrivant PR3 : le périmètre exige explicitement
-- l'affichage de la méthode de vérification, la Server Action a besoin
-- de cette colonne pour la persister. Additive, nullable, aucun impact
-- sur les données existantes (0 ligne dans evidence à ce jour).
alter table evidence add column verification_method text;
