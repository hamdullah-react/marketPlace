-- ═══════════════════════════════════════════════════════════════════════════
--  RESET — drops every marketplace object so schema.sql can be applied clean.
--
--  DESTRUCTIVE, AND NOW COMPLETE. Everything goes:
--
--    · every marketplace table, type, function and policy
--    · every SIGNED-IN ACCOUNT — auth.users is emptied, which takes sessions,
--      identities and refresh tokens with it. Every buyer, every seller and
--      every admin has to sign up again. You included.
--    · the storage buckets — marketplace-media, marketplace-backups AND every
--      per-showroom vendor-<uuid> — ATTEMPTED. Storage is not owned by the role
--      the SQL editor runs as, so this often cannot be done from SQL at all.
--      The run says plainly whether it worked and names whatever survived; if
--      it did not, delete those buckets from the dashboard, which is the only
--      way to remove the files as well as the rows.
--
--  There is no undo and nothing is archived first. If you want any of it,
--  export it before running this.
--
--  Run this ONLY on the marketplace project. The preflight below refuses the
--  obvious wrong target, but it cannot read your mind — check which database
--  the SQL editor is connected to before you press run.
--
--  Then: run schema.sql. That is the whole recovery — it rebuilds the tables,
--  the policies, the starting categories AND the storage buckets this file
--  deleted (section 24). Nothing else is required and no terminal is needed.
--
--  Optional afterwards, only if you want them: sync-catalog.cjs pulls the
--  catalog from upstream, seed.cjs adds sample listings. A seller can install
--  the catalog they want from Dashboard - Catalog instead.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── PREFLIGHT: is this even the marketplace? ────────────────────────────────
--
-- The one mistake this file cannot be forgiven for is being run against the
-- wrong project. Now that it empties auth.users, that mistake deletes every
-- account on whatever database the editor happened to be pointed at.
--
-- So: if there are USERS but no `vendors` table, this is not the marketplace —
-- it is some other Supabase project — and the run aborts before touching
-- anything. A genuinely empty database has no users and passes straight
-- through, which is what makes this safe to keep in a fresh-install path.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'vendors'
  ) and exists (select 1 from auth.users limit 1) then
    raise exception
      'REFUSING TO RUN. This database has auth users but no `vendors` table, so it is not the marketplace project. Emptying auth.users here would delete every account on it. Check which database you are connected to.';
  end if;
end $$;

drop table if exists
  audit_log,
  auth_otp_sends,
  addresses, saved_searches, saved_listings,
  payout_lines, payouts, disputes, commission_rules,
  reviews, bookings,
  -- The lead pipeline and the form that fills it. inquiries/inquiry_messages
  -- are named here too: they no longer exist in schema.sql, but a database
  -- built before they were removed still has them, and a reset that leaves
  -- them behind is not a reset.
  leads, vendor_form_fields, vendor_form_tabs,
  inquiry_messages, inquiries,
  order_events, order_lines, orders,
  -- Seller offers and the catalog list their names come from (§25, §25.1),
  -- the library's own shelves (§26) and the per-vendor split record (§30.2).
  -- All four were added to schema.sql after this list was written and none of
  -- them were added HERE, so every "reset" left them standing. That is not a
  -- cosmetic omission: vendors was dropped while offer_names survived, so its
  -- created_by_vendor_id went on pointing at a showroom that no longer existed
  -- — a row owned by a ghost, which under §30 means invisible to everybody for
  -- ever. listing_offers likewise kept rows whose listing had been dropped.
  listing_offers, offer_names,
  media_folders,
  catalog_split_map,
  media_assets, vendor_backups,
  catalog_template_installs,
  trim_specs, listing_specs, listing_variants, listings,
  categories, vendor_members, vendors,
  spec_attribute_values, spec_attributes,
  car_attribute_kinds, car_attributes, car_colors, car_years, car_trims, car_models, car_brands,
  profiles,
  _migrations
cascade;

drop type if exists
  media_kind, payout_state, dispute_state, booking_state,
  lead_stage, lead_field_type, form_field_width,
  -- §25's offer discount kind, missed here the same way its two tables were.
  offer_discount_type,
  app_role, vendor_member_role,
  -- Gone from schema.sql; still present on a database built before they were.
  inquiry_state, inquiry_type, inquiry_field_type,
  order_state, vendor_state, listing_state, listing_type
cascade;

drop function if exists set_updated_at() cascade;
drop function if exists i18n(text, text) cascade;
drop function if exists i18n_text(jsonb, text) cascade;
drop function if exists odoo_json(text, text) cascade;

-- The auth helpers (§17.3). Dropped by name and signature because CASCADE on
-- the tables does not reach a function that merely reads them.
drop function if exists handle_new_user() cascade;
drop function if exists auth_role() cascade;
drop function if exists is_staff() cascade;
drop function if exists is_admin() cascade;
drop function if exists my_vendor_ids() cascade;
drop function if exists owns_vendor(uuid) cascade;
drop function if exists my_vendor_role(uuid) cascade;
drop function if exists is_vendor_member(uuid) cascade;
drop function if exists vendor_state_of(uuid) cascade;
drop function if exists owns_listing(uuid) cascade;
drop function if exists can_see_order(uuid) cascade;
drop function if exists vendor_catalog_rows(uuid, text) cascade;
drop function if exists catalog_split_row(text, uuid, uuid) cascade;
drop function if exists profile_complete() cascade;
drop function if exists leads_search_text() cascade;
drop function if exists otp_send_allowed(text, text, interval, int, interval, int) cascade;
drop function if exists otp_send_allowed(text, text, int, interval, int) cascade;
drop function if exists prune_auth_otp_sends() cascade;

-- The profile trigger lives on auth.users, which is NOT dropped above.
drop trigger if exists on_auth_user_created on auth.users;

-- The lead pipeline's own functions. Dropped by name: CASCADE on `leads`
-- reaches the TRIGGERS but not the functions they call.
drop function if exists leads_search_text() cascade;
drop function if exists leads_notify() cascade;

-- §23. Asked by proxy.js on every request, so leaving it behind pointing at
-- dropped tables would make every marketplace page fail rather than fail open.
drop function if exists profile_complete() cascade;


-- ── Policies on realtime.messages ──────────────────────────────────────────
--
-- Not ours to own. realtime.messages belongs to the realtime schema, so these
-- are dropped inside a block that tolerates being refused — the same shape
-- schema.sql §21.7 uses to create them.
--
-- Worth doing rather than leaving to CASCADE: leads_broadcast_receive resolves
-- through owns_vendor(), which is dropped above. A policy left behind pointing
-- at a function that no longer exists makes every subscribe attempt error
-- instead of simply being refused.

do $$
begin
  execute 'drop policy if exists leads_broadcast_receive on realtime.messages';
  execute 'drop policy if exists requests_broadcast_receive on realtime.messages';
exception when others then
  raise notice 'Could not drop the realtime.messages policies (%). Drop them as the owner of that table.', sqlerrm;
end $$;


-- ── Storage ────────────────────────────────────────────────────────────────
--
-- ── This may not work, and it now SAYS SO ─────────────────────────────────
--
-- storage.buckets and storage.objects belong to supabase_storage_admin, not to
-- the role the SQL editor runs as. Depending on the project, a DELETE here
-- either raises "permission denied" or — worse — succeeds having removed NOTHING,
-- because RLS filtered every row out. Both used to be swallowed into a
-- `raise notice` by this block, so a reset could report success with all eight
-- buckets still sitting there. That is exactly the failure §21.1 of schema.sql
-- was rewritten to stop doing.
--
-- So the shape is: try, then COUNT WHAT IS LEFT, then complain loudly with the
-- names. A warning shows by default in the SQL editor; a notice is scrolled
-- past.
--
-- ── What deleting the rows does and does not do ────────────────────────────
--
-- Even when it works, deleting from storage.objects is not deleting the FILES.
-- The rows are the index; the objects live in the backing store, which only the
-- storage API can clear. Deleting the rows orphans them — unreachable, since
-- the paths are unguessable, but still billed for.
--
-- ── The per-vendor buckets count too ──────────────────────────────────────
--
-- Every showroom gets its own, `vendor-<uuid>`, created on demand — see
-- src/marketplace/media/bucket.js. There is no list of them anywhere: the name
-- is derived from the vendor id, so the prefix is the only way to find them.
-- Leaving them behind is not a reset — once `vendors` is dropped nothing can
-- ever name them again, and they hold photos for showrooms that no longer
-- exist.
--
-- ── If this reports a failure ─────────────────────────────────────────────
--
-- Storage → select the bucket → Delete, for each one named in the warning. It
-- is the only path that removes the files as well as the rows, so it is the
-- better answer regardless of whether the SQL above was allowed.

do $$
declare
  before_count int;
  after_count  int;
  survivors    text;
  failed       text := null;
begin
  select count(*) into before_count from storage.buckets
   where id in ('marketplace-media', 'marketplace-backups') or id like 'vendor-%';

  begin
    -- Objects before buckets: a bucket with rows still pointing at it refuses
    -- to be deleted, and the error names a foreign key rather than the reason.
    delete from storage.objects
     where bucket_id in ('marketplace-media', 'marketplace-backups')
        or bucket_id like 'vendor-%';

    delete from storage.buckets
     where id in ('marketplace-media', 'marketplace-backups')
        or id like 'vendor-%';
  exception when others then
    failed := sqlerrm;
  end;

  -- The point of the block: did it actually take?
  select count(*), string_agg(id, ', ' order by id)
    into after_count, survivors
  from storage.buckets
   where id in ('marketplace-media', 'marketplace-backups') or id like 'vendor-%';

  if after_count = 0 then
    raise notice 'Storage: % bucket(s) removed. schema.sql section 24 recreates the two shared ones; a showroom makes its own on first upload.', before_count;
  else
    raise warning
      'STORAGE NOT CLEARED. % of % bucket(s) are still there: %.%  Delete them by hand: Supabase dashboard, Storage, select each bucket, Delete. That also removes the files, which the SQL above would not have done anyway.',
      after_count, before_count, survivors,
      coalesce(' The database refused it: ' || failed || '.', ' The delete was allowed but removed nothing, which means row-level security filtered every row out.');
  end if;
end $$;


-- ── ACCOUNTS ───────────────────────────────────────────────────────────────
--
-- LAST, and on purpose.
--
-- Every table that referenced auth.users — profiles, vendor_members — is
-- already gone, so this is a plain delete with nothing left to cascade INTO the
-- marketplace. Inside auth it still cascades properly: sessions, identities,
-- refresh tokens and MFA factors all hang off auth.users and go with it.
--
-- ── What this means in practice ────────────────────────────────────────────
--
-- Nobody can sign in afterwards. Not the buyers, not the showrooms, and not
-- you — the admin account is an ordinary row in this table. After a reset the
-- first thing to do is sign up again and then re-run the two snippets at the
-- end of schema.sql §17 to make yourself an admin and attach yourself to a
-- showroom.
--
-- Tolerant of being refused: on some projects auth.users is not writable by the
-- role running the SQL editor. Losing the accounts is not worth aborting a reset
-- that has already dropped every table.

do $$
declare
  gone int;
begin
  delete from auth.users;
  get diagnostics gone = row_count;
  raise notice 'Accounts: % user(s) deleted. Everybody signs up again, including you.', gone;
exception when others then
  raise warning
    'Could not empty auth.users (%). The tables are gone but the accounts remain — delete them from Authentication → Users in the Supabase dashboard.', sqlerrm;
end $$;
