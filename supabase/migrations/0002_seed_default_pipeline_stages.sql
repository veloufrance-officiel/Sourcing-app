-- Quand un tenant est créé, on lui provisionne automatiquement les 7 statuts
-- par défaut (repris du MVP Emergent) plutôt que de compter sur le code
-- applicatif pour le faire correctement à chaque fois qu'un tenant apparaît.

create or replace function seed_default_pipeline_stages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into pipeline_stages (tenant_id, label, sort_order, is_default) values
    (new.id, 'Nouveau', 1, true),
    (new.id, 'À vérifier', 2, true),
    (new.id, 'Contacté', 3, true),
    (new.id, 'Qualifié', 4, true),
    (new.id, 'Shortlist', 5, true),
    (new.id, 'Présenté', 6, true),
    (new.id, 'Placé', 7, true);
  return new;
end;
$$;

drop trigger if exists trg_seed_default_pipeline_stages on tenants;
create trigger trg_seed_default_pipeline_stages
  after insert on tenants
  for each row
  execute function seed_default_pipeline_stages();
