-- Migration 0016 rendait les GRANT authenticated explicites (déjà vrai en
-- production, implicite via le bootstrap hébergé), mais ne couvrait que
-- authenticated — jamais service_role, puisqu'à l'époque rien n'exerçait
-- service_role à travers ces 12 tables. Le trigger de PR1
-- (internal.trg_evidence_change -> internal.recalculate_eligibility, lisant
-- brief_criteria/mission_candidates, écrivant shortlist_candidates) est la
-- première chose qui le fait — révélé par 2 échecs CI successifs sur ce
-- même correctif (evidence puis brief_criteria), pas anticipé à l'avance.
--
-- Plutôt que de continuer à découvrir table par table, comprehensive ici :
-- même liste de 12 tables que 0016, service_role au lieu d'authenticated.
-- Vérifié en production avant cette migration : déjà implicitement vrai
-- partout (information_schema.role_table_grants), donc no-op côté hébergé,
-- ferme le gap côté stack locale de CI.
grant select, insert, update, delete on public.tenants to service_role;
grant select, insert, update, delete on public.app_users to service_role;
grant select, insert, update, delete on public.missions to service_role;
grant select, insert, update, delete on public.clients to service_role;
grant select, insert, update, delete on public.candidates to service_role;
grant select, insert, update, delete on public.brief_criteria to service_role;
grant select, insert, update, delete on public.pipeline_stages to service_role;
grant select, insert, update, delete on public.mission_candidates to service_role;
grant select, insert, update, delete on public.shortlists to service_role;
grant select, insert, update, delete on public.shortlist_candidates to service_role;
grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.activity_log to service_role;
