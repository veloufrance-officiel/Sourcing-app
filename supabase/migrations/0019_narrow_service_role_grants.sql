-- Remplace 0019 (evidence_service_role_grant) et 0020
-- (service_role_grants_original_tables), retirées : accordaient
-- INSERT/UPDATE/DELETE sur 13 tables alors que le besoin réel, vérifié
-- ligne par ligne dans le code des fonctions triggers concernées, est
-- strictement plus étroit.
--
-- Besoin exact, confirmé par lecture de code puis par test réel :
-- - evidence : SELECT (lecture par le trigger lui-même) + INSERT/UPDATE
--   (service_role doit pouvoir écrire du NOT_VERIFIED — testé
--   explicitement, cas "service_role peut INSERT/UPDATE NOT_VERIFIED").
--   Jamais DELETE : aucun code service_role ne supprime une evidence.
-- - brief_criteria : SELECT seul (trg_evidence_change y lit mission_id,
--   jamais n'y écrit).
-- - mission_candidates : SELECT seul (trg_criteria_change y lit
--   candidate_id, jamais n'y écrit — les écritures passent par
--   recalculate_eligibility, déjà SECURITY DEFINER, donc protégée
--   indépendamment de tout GRANT direct).
--
-- Aucune des 10 autres tables (tenants, app_users, missions, clients,
-- candidates, pipeline_stages, shortlists, shortlist_candidates,
-- subscriptions, activity_log) n'est lue ou écrite directement par un
-- code service_role existant — confirmé par recherche exhaustive dans
-- src/ (seuls usages : enforce_data_retention et
-- get_tenant_anthropic_key_for_service, tous deux SECURITY DEFINER,
-- qui ne dépendent que d'EXECUTE sur la fonction, jamais d'un GRANT de
-- table pour l'appelant). Aucun GRANT accordé sur ces 10 tables.
grant select, insert, update on evidence to service_role;
grant select on brief_criteria to service_role;
grant select on mission_candidates to service_role;
