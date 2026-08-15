-- Lien de partage externe réel. Un token dédié (pas l'UUID de la shortlist
-- lui-même) : séparer "identifiant interne" et "secret de partage" permet
-- de révoquer/régénérer un lien sans toucher à la ligne elle-même.
alter table shortlists add column share_token uuid not null default gen_random_uuid();
create unique index idx_shortlists_share_token on shortlists (share_token);

-- Plutôt que d'ouvrir des policies RLS anon sur shortlists/shortlist_candidates/
-- candidates (surface d'exposition large sur une table qui contient des PII),
-- une seule fonction étroite : le token doit être connu ET shared_with_external
-- doit être vrai, et elle ne renvoie que les champs nécessaires à Arnaud
-- (jamais email/téléphone — la mise en relation reste manuelle pour l'instant).
create or replace function public.get_shared_shortlist(p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'name', s.name,
    'mission_title', m.title,
    'candidates', coalesce((
      select json_agg(json_build_object('full_name', c.full_name, 'title', c.title, 'skills', c.skills) order by c.full_name)
      from shortlist_candidates sc
      join candidates c on c.id = sc.candidate_id
      where sc.shortlist_id = s.id
    ), '[]'::json)
  ) into v_result
  from shortlists s
  join missions m on m.id = s.mission_id
  where s.share_token = p_token and s.shared_with_external = true;

  return v_result;
end;
$$;

grant execute on function public.get_shared_shortlist(uuid) to anon, authenticated;

-- Vérifié en conditions réelles avant merge (rôle anon simulé) :
-- - token valide + shared_with_external=true -> renvoie les profils, jamais l'email
-- - token aléatoire -> null
-- - shared_with_external=false -> null même avec le bon token
