-- =============================================================================
-- Short codes for tree beds
--   Adds tree_beds.code — a 6-char base62 code used in short share links
--   (/b/<code> → redirects to /bed/<uuid>). A BEFORE INSERT trigger assigns a
--   unique code to every new bed; existing rows are backfilled. Public read
--   already covers it (no new grants needed).
-- Safe to re-run.
-- =============================================================================

-- 1. Column
do $$
begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='tree_beds' and column_name='code') then
    alter table public.tree_beds add column code text;
  end if;
end $$;

-- 2. Code generator (6-char base62)
create or replace function public.gen_bed_code(len int default 6)
returns text
language plpgsql
as $$
declare
  alphabet text := 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result   text := '';
  i        int;
begin
  for i in 1..len loop
    result := result || substr(alphabet, floor(random() * 62)::int + 1, 1);
  end loop;
  return result;
end;
$$;

-- 3. Backfill existing rows with unique codes
do $$
declare
  r record;
  c text;
begin
  for r in select id from public.tree_beds where code is null loop
    loop
      c := public.gen_bed_code(6);
      exit when not exists (select 1 from public.tree_beds where code = c);
    end loop;
    update public.tree_beds set code = c where id = r.id;
  end loop;
end $$;

-- 4. Uniqueness
create unique index if not exists tree_beds_code_key on public.tree_beds(code);

-- 5. Auto-assign a unique code on insert (loops until unique)
create or replace function public.tree_beds_set_code()
returns trigger
language plpgsql
as $$
begin
  if new.code is null then
    loop
      new.code := public.gen_bed_code(6);
      exit when not exists (select 1 from public.tree_beds where code = new.code);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tree_beds_set_code on public.tree_beds;
create trigger trg_tree_beds_set_code
  before insert on public.tree_beds
  for each row execute function public.tree_beds_set_code();
