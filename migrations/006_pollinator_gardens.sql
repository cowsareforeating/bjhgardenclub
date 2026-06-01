-- =============================================================================
-- Seed the Pollinator Gardens
--   Imports the 5 pollinator gardens from the "Brooklyn Jewish Hospital Tree
--   Map" KML (Pollinator Gardens folder) as tree_beds rows, each tagged with a
--   "Pollinator Garden" type via tree_bed_type_assignments.
--
--   The app already treats any bed whose type label contains "pollinator" as a
--   pollinator bed (see src/lib/markerIcons.ts: flower icon + shorter care
--   interval), so tagging is all that's needed — no schema change.
--
--   tree_beds has no description column, so the KML blurbs are kept here as
--   comments only. created_by is left null (community/seed data, no owner).
--
--   Coordinates come straight from the KML <coordinates> (which are lon,lat,alt
--   order) — flipped to lat/lon below.
--
-- Safe to re-run: the type is upserted by label, and each bed is inserted only
-- if one with the same name doesn't already exist.
-- =============================================================================

do $$
declare
  v_type_id bigint;
  v_bed_id  uuid;
  g         record;
begin
  -- ---------------------------------------------------------------------------
  -- 1. Ensure a "Pollinator Garden" type exists; reuse any existing pollinator
  --    type if one is already seeded.
  -- ---------------------------------------------------------------------------
  select id into v_type_id
    from public.tree_bed_types
   where lower(label) like '%pollinator%'
   order by id
   limit 1;

  if v_type_id is null then
    insert into public.tree_bed_types (label, is_active, sort_order)
    values (
      'Pollinator Garden',
      true,
      coalesce((select max(sort_order) from public.tree_bed_types), 0) + 1
    )
    returning id into v_type_id;
  end if;

  -- ---------------------------------------------------------------------------
  -- 2. Insert each garden as a bed (idempotent by name) + tag it.
  --    blurb is informational only (no column to store it in).
  -- ---------------------------------------------------------------------------
  for g in
    select * from (values
      ('B48 Bus Stop Pollinator Garden',
       40.6759113, -73.9596447,
       'Two bus-stop pollinator beds managed by the Garden Club, with support from NYC Service.'),
      ('523 Prospect Pollinator Garden',
       40.675834,  -73.958891,
       'Courtyard garden managed by Tsivia, a resident and Garden Club organizer.'),
      ('Services for the Underserved Pollinator Gardens',
       40.6766965, -73.9593141,
       'Three tree beds maintained by the BJH Garden Club with support from SUS; native species + botanical labels.'),
      ('497/505 St. Marks Pollinator Gardens',
       40.6763472, -73.9576884,
       'Two native sapling & pollinator beds managed by the Garden Club.'),
      ('Shuttle underpass pollinator garden',
       40.6762601, -73.957281,
       'Bed by the underpass with an electrical pole; planted May 2026 with 100+ sunflowers and native wildflower seeds.')
    ) as t(name, lat, lon, blurb)
  loop
    -- Skip if a bed with this name already exists (re-run safety).
    if exists (select 1 from public.tree_beds b where b.name = g.name) then
      continue;
    end if;

    insert into public.tree_beds (name, latitude, longitude, address, species_id)
    values (g.name, g.lat, g.lon, null, null)
    returning id into v_bed_id;

    insert into public.tree_bed_type_assignments (tree_bed_id, type_id)
    values (v_bed_id, v_type_id)
    on conflict do nothing;
  end loop;
end $$;

-- =============================================================================
-- DONE. 5 pollinator gardens inserted (or skipped if already present), each
-- tagged "Pollinator Garden" so the map renders them with the flower icon and
-- the shorter pollinator care interval.
-- =============================================================================
