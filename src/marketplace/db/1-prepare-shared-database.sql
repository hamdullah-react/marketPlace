-- ═══════════════════════════════════════════════════════════════════════════
--  STEP 1 — PREPARE A SHARED DATABASE
--
--  Run this FIRST, then run schema.sql (step 2). Takes a second.
--
--      1.  1-prepare-shared-database.sql   ← this file
--      2.  schema.sql                       the marketplace itself
--
--  ── Do I need it? ─────────────────────────────────────────────────────────
--
--  Only if this database already runs another application. On a database
--  created for the marketplace alone, this file finds nothing and does
--  nothing — so running it is never wrong, and skipping it is only right when
--  you are certain the database is empty.
--
--  Run it when schema.sql stops with:
--
--      P0001: public.profiles already exists and is NOT this marketplace's
--
--  ── What it does ──────────────────────────────────────────────────────────
--
--  One thing: it moves ANOTHER application's `public.profiles` out of the way,
--  to `other_app_profiles`.
--
--  `profiles` is the name every Supabase starter, template and tutorial picks
--  for "the row that hangs off auth.users", so two applications sharing one
--  database collide on it before they collide on anything else. The marketplace
--  needs its own (§17.1 of schema.sql: role, full_name, phone, locale), and
--  `create table if not exists` SKIPS a table of that name whatever shape it
--  has — it does not compare columns. So without this step the run gets 1,300
--  lines further and fails on the backfill with
--
--      42703: column "full_name" of relation "profiles" does not exist
--
--  which says nothing about the table having belonged to somebody else.
--
--  ── Why a rename and not a drop ───────────────────────────────────────────
--
--  A rename carries the table's rows, indexes, constraints, triggers and
--  policies with it. Nothing is destroyed and nothing is lost: the other
--  application's data is still there, under a different name, and
--
--      alter table public.other_app_profiles rename to profiles;
--
--  puts it back exactly as it was. A drop would make this file a thing nobody
--  dares run on a database with data in it.
--
--  ── The consequence, stated plainly ───────────────────────────────────────
--
--  The OTHER application's code still says `profiles`, so it will error on
--  that table until somebody points it at `other_app_profiles`. That is the
--  real cost of two applications sharing one `public` schema, and this file
--  only moves which of the two pays it.
--
--  If both applications matter equally, the better answer is a database each
--  — see the note at the foot of this file.
--
--  SAFE TO RUN TWICE. Every step checks before it acts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. The collision that actually stops the install ───────────────────────

do $$
declare
  rows_kept bigint;
begin
  -- Not there at all: a database with no other application in it.
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    raise notice 'profiles: not present. Nothing to move — run schema.sql.';
    return;
  end if;

  -- Already OURS. `full_name` is the marketplace's own column and no starter
  -- template has it, which makes it the cheapest way to tell the two apart.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'full_name'
  ) then
    raise notice 'profiles: already the marketplace''s. Nothing to do — run schema.sql.';
    return;
  end if;

  -- Somebody else's, and the name it would be moved to is taken. Stop rather
  -- than invent a second name: two tables called other_app_profiles-something
  -- is how a database becomes unreadable.
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'other_app_profiles'
  ) then
    raise exception
      'public.other_app_profiles already exists, so public.profiles cannot be moved there. Rename one of them by hand, then run this file again.';
  end if;

  execute 'select count(*) from public.profiles' into rows_kept;

  alter table public.profiles rename to other_app_profiles;

  raise notice
    'profiles: moved to other_app_profiles (% row(s) kept, with its indexes and policies). The other application must now read other_app_profiles. To undo: alter table public.other_app_profiles rename to profiles;',
    rows_kept;
end $$;


-- ── 2. What ELSE this database and the marketplace both want ───────────────
--
-- Reported, never touched. `profiles` is the only name that stops the install,
-- because it is the only one schema.sql writes specific columns into straight
-- after creating it. The rest are listed so that whoever runs this knows what
-- they are sharing BEFORE they find out from a constraint error months later.
--
-- A name appearing here is not necessarily a problem: if the table is already
-- the marketplace's (this database has had schema.sql run on it before), it is
-- simply a re-run. It is a problem when the table belongs to the other
-- application and the two mean different things by it.

do $$
declare
  clash text;
  found text[] := '{}';
begin
  foreach clash in array array[
    'settings', 'notifications', 'messages', 'conversations', 'categories',
    'reviews', 'orders', 'addresses', 'media_assets', 'leads'
  ] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = clash
    ) then
      found := found || clash;
    end if;
  end loop;

  if array_length(found, 1) is null then
    raise notice 'Shared names: none. This database is the marketplace''s alone.';
  else
    raise notice
      'Shared names: % already exist in public. If they belong to another application rather than to a previous run of schema.sql, the two applications are sharing them — see the note at the foot of this file.',
      array_to_string(found, ', ');
  end if;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
--  Next: run schema.sql.
--
--  ── For the next developer ────────────────────────────────────────────────
--
--  If you are reading this because you hit the collision a second time: the
--  durable fix is not this file, it is giving the marketplace a database of
--  its own. Two applications in one `public` schema collide on every table
--  either of them adds from now on, and this file can only move the first one
--  out of the way.
--
--  A separate Supabase project — or a second Supabase resource in Coolify —
--  costs one deployment and ends the whole class of problem. This file exists
--  for the case where that decision has already been made the other way.
-- ═══════════════════════════════════════════════════════════════════════════
