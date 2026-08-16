-- Reconstruit depuis supabase_migrations.schema_migrations.statements.
-- USAGE sur le schéma ne rend rien exécutable en soi — chaque fonction
-- garde son propre GRANT EXECUTE, déjà posé précisément. Sans USAGE,
-- authenticated ne peut même pas référencer une fonction du schéma pour
-- tenter un appel RPC direct (diffère des appels indirects via policies
-- RLS, qui n'ont jamais eu ce problème).
grant usage on schema internal to authenticated;
