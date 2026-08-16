-- Découvert en diagnostiquant un échec CI (permission denied for table
-- missions sur la stack locale) : l'environnement Supabase hébergé
-- pré-configure des GRANT larges (SELECT/INSERT/UPDATE/DELETE) sur les
-- nouvelles tables du schéma public pour authenticated — RLS fait ensuite
-- tout le travail de restriction réelle. C'était vrai en production depuis
-- le début, mais jamais écrit dans une migration : la stack locale de CI
-- (Docker) n'a pas ce même bootstrap implicite, d'où l'échec.
--
-- Ce fichier rend explicite exactement ce qui est déjà vrai en
-- production (vérifié via information_schema.role_table_grants avant
-- d'écrire ceci) — aucun changement de posture de sécurité, seulement
-- une dépendance implicite à un comportement propre à l'hébergé qui
-- devient une dépendance déclarée et reproductible.
grant select, insert, update, delete on public.tenants to authenticated;
grant select, insert, update, delete on public.app_users to authenticated;
grant select, insert, update, delete on public.missions to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.candidates to authenticated;
grant select, insert, update, delete on public.brief_criteria to authenticated;
grant select, insert, update, delete on public.pipeline_stages to authenticated;
grant select, insert, update, delete on public.mission_candidates to authenticated;
grant select, insert, update, delete on public.shortlists to authenticated;
grant select, insert, update, delete on public.shortlist_candidates to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;
grant select, insert, update, delete on public.activity_log to authenticated;
