-- =============================================================================
-- Extract the NYC tree id out of tree_bed names
--   Names like 'American basswood (Tree ID #3646423)' carry the id inline.
--   Move the number into tree_beds.tree_id and strip the '(Tree ID #…)' suffix
--   from the name, leaving 'American basswood'.
--
--   - Only rows whose name still contains the pattern are touched, so this is
--     idempotent (re-running matches nothing).
--   - coalesce() means an already-set tree_id is never overwritten.
--
-- Preview before running: 40 of 50 rows match; the rest (pollinator gardens,
-- saplings, dogwoods, a manually-fixed ginkgo) have no '(Tree ID #…)' and are
-- left alone.
-- =============================================================================

update public.tree_beds
set
  tree_id = coalesce(tree_id, (regexp_match(name, '\(Tree ID #(\d+)\)'))[1]),
  name    = nullif(btrim(regexp_replace(name, '\s*\(Tree ID #\d+\)', '', 'g')), '')
where name ~ '\(Tree ID #\d+\)';
