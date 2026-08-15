alter table candidates add column skills text[];
alter table candidates add column location text;
alter table candidates add column available_from date;
-- Signal informatif, jamais utilisé dans le calcul du score (voir src/lib/matching.ts) :
-- la pré-qualification reste visible, elle ne doit jamais remplacer l'adéquation réelle.
alter table candidates add column qualified_by text;
comment on column candidates.qualified_by is 'Qui a pré-qualifié ce profil (ex: arnaud). Purement informatif — ne doit jamais entrer dans le calcul du score de matching, seulement s''afficher comme signal complémentaire pour le recruteur.';
