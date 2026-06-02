-- =============================================================================
-- City tree ID
--   NYC street ("City tree") beds have an official NYC Parks tree id. Store it
--   as a free-form, nullable column on tree_beds. Only City-tree beds use it;
--   the app shows the input only when the "City tree" type is selected and links
--   the value out to the NYC tree map.
--
--   Free-form text (not a number) so odd/legacy ids and accidental "#" prefixes
--   still save; the app trims for the outbound link.
--
-- Safe to re-run; column added only if missing.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tree_beds'
      and column_name = 'tree_id'
  ) then
    alter table public.tree_beds add column tree_id text;
  end if;
end $$;
