-- ═══════════════════════════════════════════════════════════════════════════
--  ALROMAIH MARKETPLACE — COMPLETE SCHEMA
--
--  ONE FILE. There is no second migration file and there never should be —
--  everything lives here, and this is the only .sql you run besides reset.sql.
--
--  RE-RUNNABLE. Every statement is guarded: `create table if not exists`,
--  `add column if not exists`, `create or replace`, and each policy is dropped
--  before it is created. Run it again after pulling and it applies whatever is
--  new and leaves the rest untouched. New columns go in an `alter … if not
--  exists` block (see §14) rather than into an existing `create table`, because
--  `create table if not exists` skips the whole table and would never add them.
--
--  NOT an upgrade from the pre-jsonb shape. If a database still has
--  `car_brands.name_ar`, the preflight below stops immediately — run reset.sql
--  first. That is the only case requiring a wipe.
--
--  Fresh install, or migrating to a new database:
--    1. reset.sql          (drops everything — destructive; skip on a new one)
--    2. schema.sql         (this file)
--
--  That is all of it. Tables, policies, the starting categories and the STORAGE
--  BUCKETS (§24) are in here, so a new database needs a terminal for nothing.
--
--  Optional, and only if you want them:
--    · node src/marketplace/db/sync-catalog.cjs   pulls the catalog from
--      upstream. Not needed — a seller installs the catalog they want from
--      Dashboard → Catalog, which is what §16's templates are for.
--    · node src/marketplace/db/seed.cjs           sample listings, for a demo.
--
--  Existing install: just re-run this file.
--
--  Vendor-neutral by design — no ERP-specific naming anywhere. Multilingual
--  values are plain {"ar": …, "en": …} JSON, and `source_id` is just "the id
--  this row came from upstream", whatever the upstream ends up being.
--
--  Sections
--    1  helpers + enums
--    2  catalog        brands, models, trims, years, colours, attributes, specs
--    3  vendors        sellers and their policies
--    4  categories     browse taxonomy
--    5  listings       what a seller offers, + colour variants + spec values
--    6  media          the upload library
--    7  orders         cart → checkout → fulfilment
--    8  engagement     bookings, reviews
--    9  finance        commission, disputes, payouts
--   10  buyer          saved listings, searches, addresses
--   11  audit          who changed what
--   12  row level security
--   13  starting data
--   14  vendor settings, address, backups
--   15  SEO            per-listing metadata, share cards, sitemap
--   16  catalog templates
--   17  auth           roles, vendor membership, RLS
--   18  per-seller catalog
--   19  email code throttle
--   20  lead form      vendor-defined questions + layout
--   21  leads          the pipeline, live, and the enquiry teardown
--   22  lead form tabs
--   23  profile completeness
--   24  storage buckets
--   25  seller offers
--   26  media folders  the seller’s own shelves in the library
--   27  storefront SEO how the showroom page appears in a search result
--   28  about          the showroom's long-form page, stored as a document
--   29  social links   the showroom's own list of links, with icons
--   30  per-vendor catalog  every showroom owns its own rows
--   31  variant price  a colour can cost more than the car's base price
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- ── 0. preflight ───────────────────────────────────────────────────────────
--
-- Stops the half-applied state that gives "column is_custom does not exist"
-- two hundred lines in. If a table from an older shape is present, this aborts
-- immediately with an instruction instead of skipping every create and then
-- failing on an index.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'car_brands' and column_name = 'name_ar'
  ) then
    raise exception
      'Old schema detected (car_brands.name_ar exists). This file is a fresh install, not an upgrade. Run reset.sql first, then this file.';
  end if;
end $$;

-- ── 1. helpers + enums ─────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Builds the multilingual object from two plain strings.
create or replace function i18n(ar text, en text)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object('ar', nullif(ar, ''), 'en', nullif(en, '')));
$$;

-- Reads one language out, falling back to the other. Used by indexes and views
-- so SQL and the application agree on what "the name" means.
create or replace function i18n_text(value jsonb, lang text default 'ar')
returns text language sql immutable as $$
  select coalesce(value ->> lang, value ->> 'en', value ->> 'ar', '');
$$;

do $$ begin
  create type listing_type as enum ('part', 'car', 'service', 'accessory');
exception when duplicate_object then null; end $$;

do $$ begin
  create type listing_state as enum (
    'draft', 'pending_review', 'live', 'paused',
    'rejected', 'sold_out', 'expired', 'removed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type vendor_state as enum (
    'applied', 'documents_pending', 'under_review', 'approved', 'suspended', 'rejected'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_state as enum (
    'pending_payment', 'paid', 'accepted', 'shipped',
    'delivered', 'completed', 'cancelled', 'refunded'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type booking_state as enum ('requested', 'confirmed', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_state as enum (
    'open', 'vendor_responding', 'resolved', 'escalated',
    'staff_review', 'ruled_buyer', 'ruled_vendor'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payout_state as enum ('draft', 'approved', 'paid', 'failed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media_kind as enum ('photo', 'icon', 'document');
exception when duplicate_object then null; end $$;

-- Brand marks, added after the fact. Top level, NOT inside a do-block: a new
-- enum value cannot be added and then used inside the same transaction, and a
-- do-block is one. `if not exists` makes re-running this file a no-op.
alter type media_kind add value if not exists 'logo';

-- ── 2. catalog ─────────────────────────────────────────────────────────────
--
-- Shared reference data: what a car IS, as opposed to what one seller is
-- offering. Rows arrive either from the upstream sync (source_id set) or from a
-- seller typing something new (is_custom, awaiting approval).
--
-- Every catalog row carries name + description + icon + image, so the UI can
-- show a brand logo, a fuel-type icon, or an explanatory line anywhere.

create table if not exists car_brands (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  logo_url    text,
  image_url   text,
  icon_url    text,
  sequence    integer not null default 0,
  source_id   bigint unique,
  is_custom   boolean not null default false,
  approved    boolean not null default true,
  created_by_vendor_id uuid,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists car_models (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references car_brands (id) on delete cascade,
  slug        text not null,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  image_url   text,
  icon_url    text,
  sequence    integer not null default 0,
  source_id   bigint unique,
  is_custom   boolean not null default false,
  approved    boolean not null default true,
  created_by_vendor_id uuid,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists car_trims (
  id          uuid primary key default gen_random_uuid(),
  model_id    uuid not null references car_models (id) on delete cascade,
  slug        text not null,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  code        text,
  image_url   text,
  icon_url    text,
  sequence    integer not null default 0,
  source_id   bigint unique,
  is_custom   boolean not null default false,
  approved    boolean not null default true,
  created_by_vendor_id uuid,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (model_id, slug)
);

create table if not exists car_years (
  id        uuid primary key default gen_random_uuid(),
  value     smallint not null unique check (value between 1950 and 2100),
  source_id bigint unique,
  is_custom boolean not null default false
);

create table if not exists car_colors (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  hex         text,
  image_url   text,
  icon_url    text,
  sequence    integer not null default 0,
  source_id   bigint unique,
  is_custom   boolean not null default false,
  approved    boolean not null default true,
  created_by_vendor_id uuid,
  created_at  timestamptz not null default now()
);

-- Flat, seller-extendable option lists: fuel, transmission, condition, body
-- type, and anything added later. One table with a `kind` discriminator rather
-- than a table per list — the shape is identical and a new list becomes a data
-- change instead of a migration.
create table if not exists car_attributes (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  slug        text not null,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  icon_url    text,
  image_url   text,
  color       text,
  sequence    integer not null default 0,
  is_custom   boolean not null default false,
  approved    boolean not null default true,
  created_by_vendor_id uuid,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (kind, slug)
);

-- Spec sheet definitions: the attribute, its category, and the icons for both.
create table if not exists spec_attributes (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  category_name      jsonb not null default '{}'::jsonb,
  category_icon_url  text,
  category_sequence  integer not null default 0,
  attribute_name     jsonb not null default '{}'::jsonb,
  attribute_icon_url text,
  attribute_sequence integer not null default 0,
  description        jsonb,
  unit_code          text,
  display_type       text default 'text',
  show_on_card       boolean not null default false,
  is_key             boolean not null default false,
  source_id          bigint unique,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists car_models_brand_idx on car_models (brand_id) where active;
create index if not exists car_trims_model_idx on car_trims (model_id) where active;
create index if not exists car_attributes_kind_idx on car_attributes (kind, sequence) where active;
create index if not exists spec_attributes_order_idx on spec_attributes (category_sequence, attribute_sequence) where active;

-- Name lookups. NOT unique: the real catalog legitimately contains the same
-- model name twice under one brand (K4, Territory, Altima, JIMNY …) for
-- different generations. A unique constraint here fails on real data —
-- duplicate prevention belongs in the create API, which matches
-- case-insensitively before inserting.
create index if not exists car_brands_name_idx on car_brands ((lower(i18n_text(name, 'en')))) where active;
create index if not exists car_models_name_idx on car_models (brand_id, (lower(i18n_text(name, 'en')))) where active;
create index if not exists car_trims_name_idx on car_trims (model_id, (lower(i18n_text(name, 'en')))) where active;

-- Seller-created rows staff has not confirmed — the merge queue.
create index if not exists car_brands_pending_idx on car_brands (created_by_vendor_id) where is_custom and not approved;
create index if not exists car_models_pending_idx on car_models (created_by_vendor_id) where is_custom and not approved;
create index if not exists car_trims_pending_idx on car_trims (created_by_vendor_id) where is_custom and not approved;
create index if not exists car_attributes_pending_idx on car_attributes (created_by_vendor_id) where is_custom and not approved;

-- ── 3. vendors ─────────────────────────────────────────────────────────────

create table if not exists vendors (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  name             jsonb not null default '{}'::jsonb,
  bio              jsonb,
  state            vendor_state not null default 'applied',
  verified         boolean not null default false,
  cr_number        text,
  vat_number       text,
  contact_email    text,
  contact_phone    text,
  city             text,
  logo_url         text,
  banner_url       text,
  policies         jsonb not null default '{}'::jsonb,
  commission_rate  numeric(5,4),
  rating_avg       numeric(3,2) not null default 0,
  rating_count     integer not null default 0,
  owner_user_id    text,
  approved_at      timestamptz,
  suspended_reason text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists vendors_state_idx on vendors (state) where state = 'approved';
create index if not exists vendors_owner_idx on vendors (owner_user_id);

-- ── 4. categories ──────────────────────────────────────────────────────────

create table if not exists categories (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid references categories (id) on delete restrict,
  slug             text not null unique,
  name             jsonb not null default '{}'::jsonb,
  description      jsonb,
  listing_type     listing_type not null,
  icon_url         text,
  image_url        text,
  attribute_schema jsonb not null default '{}'::jsonb,
  sort_order       integer not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists categories_parent_idx on categories (parent_id);
create index if not exists categories_type_idx on categories (listing_type) where active;

-- ── 5. listings ────────────────────────────────────────────────────────────

create table if not exists listings (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,

  -- Random suffix appended to every slug. Two sellers listing the identical
  -- car both get a readable URL that cannot collide.
  public_ref     text not null unique default encode(gen_random_bytes(4), 'hex'),

  vendor_id      uuid not null references vendors (id) on delete restrict,
  category_id    uuid not null references categories (id) on delete restrict,
  type           listing_type not null,
  state          listing_state not null default 'draft',

  brand_id       uuid references car_brands (id) on delete restrict,
  model_id       uuid references car_models (id) on delete restrict,
  year_id        uuid references car_years (id) on delete restrict,
  trim_id        uuid references car_trims (id) on delete restrict,
  color_id       uuid references car_colors (id) on delete set null,
  interior_color_id uuid references car_colors (id) on delete set null,

  name           jsonb not null default '{}'::jsonb,
  description    jsonb,

  meta_title       jsonb,
  meta_description jsonb,
  meta_keywords    jsonb,
  og_title         jsonb,
  og_description   jsonb,
  canonical_url    text,

  price          numeric(12,2) not null check (price >= 0),
  compare_at     numeric(12,2) check (compare_at >= 0),
  vat_included   boolean not null default true,
  vat_percentage numeric(5,2) not null default 15.00,
  currency       char(3) not null default 'SAR',
  available_on_request boolean not null default false,

  stock          integer check (stock >= 0),

  -- Type-specific values, validated against the category's attribute_schema in
  -- the server action rather than here.
  attributes     jsonb not null default '{}'::jsonb,
  media          jsonb not null default '[]'::jsonb,

  has_test_drive       boolean not null default false,
  test_drive_notes     jsonb,
  warranty_months      integer,
  country_of_origin    text,
  part_number          text,

  city           text,
  views          integer not null default 0,
  is_featured    boolean not null default false,

  rejection_reason text,
  published_at   timestamptz,
  expires_at     timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- A car or service has no stock to track; a part without stock silently
  -- oversells.
  constraint listings_stock_required_for_goods
    check (type not in ('part', 'accessory') or stock is not null)
);

create index if not exists listings_live_idx on listings (state, published_at desc) where state = 'live';
create index if not exists listings_vendor_idx on listings (vendor_id, state);
create index if not exists listings_category_idx on listings (category_id) where state = 'live';
create index if not exists listings_type_idx on listings (type) where state = 'live';
create index if not exists listings_brand_idx on listings (brand_id) where state = 'live';
create index if not exists listings_model_idx on listings (model_id) where state = 'live';
create index if not exists listings_attributes_idx on listings using gin (attributes);
create index if not exists listings_expiry_idx on listings (expires_at) where state = 'live';

-- Search runs over the extracted text, so it can use an index. Without these,
-- ILIKE on a jsonb path is a full scan on the hottest query in the app.
create index if not exists listings_name_ar_idx on listings ((name ->> 'ar')) where state = 'live';
create index if not exists listings_name_en_idx on listings ((name ->> 'en')) where state = 'live';

-- A colour of one listing, with its own photos. Empty media means the colour
-- has no photos of its own and must NOT be offered as a swatch — otherwise
-- picking it shows another colour's car.
create table if not exists listing_variants (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references listings (id) on delete cascade,
  color_id   uuid references car_colors (id) on delete set null,
  name       jsonb,
  is_primary boolean not null default false,
  media      jsonb not null default '[]'::jsonb,
  sequence   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (listing_id, color_id)
);

create index if not exists listing_variants_listing_idx on listing_variants (listing_id, sequence);
create unique index if not exists listing_variants_primary_idx on listing_variants (listing_id) where is_primary;

create table if not exists listing_specs (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings (id) on delete cascade,
  attribute_id  uuid not null references spec_attributes (id) on delete restrict,
  value         jsonb,
  display_value text,
  sequence      integer not null default 0,
  unique (listing_id, attribute_id)
);

create index if not exists listing_specs_listing_idx on listing_specs (listing_id, sequence);

-- Catalog-level defaults, so picking a trim prefills its spec sheet.
create table if not exists trim_specs (
  id            uuid primary key default gen_random_uuid(),
  trim_id       uuid not null references car_trims (id) on delete cascade,
  attribute_id  uuid not null references spec_attributes (id) on delete cascade,
  value         jsonb,
  display_value text,
  unique (trim_id, attribute_id)
);

-- ── 6. media ───────────────────────────────────────────────────────────────
--
-- The upload library. Path encodes ownership — vendors/<vendorId>/… — so
-- storage policies can be written against the first segments once auth lands.

create table if not exists media_assets (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid references vendors (id) on delete cascade,
  owner_user_id text,
  kind          media_kind not null default 'photo',
  storage_path  text not null unique,
  url           text not null,
  filename      text,
  mime_type     text,
  size_bytes    bigint,
  width         integer,
  height        integer,
  alt           jsonb,
  tags          text[],
  created_at    timestamptz not null default now()
);

create index if not exists media_assets_vendor_idx on media_assets (vendor_id, created_at desc);
create index if not exists media_assets_owner_idx on media_assets (owner_user_id, created_at desc);
create index if not exists media_assets_kind_idx on media_assets (vendor_id, kind);

-- ── 7. orders ──────────────────────────────────────────────────────────────

create table if not exists orders (
  id             uuid primary key default gen_random_uuid(),
  ref            text not null unique,
  -- Groups every order created from one checkout, so the confirmation page can
  -- show them together.
  parent_ref     text not null,
  vendor_id      uuid not null references vendors (id) on delete restrict,
  buyer_user_id  text not null,
  buyer_email    text,
  buyer_phone    text,
  state          order_state not null default 'pending_payment',

  subtotal       numeric(12,2) not null check (subtotal >= 0),
  shipping       numeric(12,2) not null default 0 check (shipping >= 0),
  vat            numeric(12,2) not null default 0 check (vat >= 0),
  total          numeric(12,2) not null check (total >= 0),

  -- Resolved once, at capture, and stored. Editing the fee table later must not
  -- reprice an old order.
  commission_rate   numeric(5,4) not null default 0,
  commission_amount numeric(12,2) not null default 0,
  vendor_net        numeric(12,2) not null default 0,

  -- Funds sit with the platform until delivery is confirmed or the window
  -- passes. Paying out on order-placed turns every refund into debt collection.
  funds_held      boolean not null default true,
  released_at     timestamptz,
  auto_release_at timestamptz,

  shipping_address jsonb not null default '{}'::jsonb,
  shipping_method  text,
  tracking_number  text,
  payment_ref      text,
  cancelled_reason text,

  placed_at      timestamptz not null default now(),
  delivered_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_buyer_idx on orders (buyer_user_id, placed_at desc);
create index if not exists orders_vendor_idx on orders (vendor_id, state, placed_at desc);
create index if not exists orders_parent_idx on orders (parent_ref);
create index if not exists orders_release_idx on orders (auto_release_at) where funds_held;

create table if not exists order_lines (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  listing_id uuid not null references listings (id) on delete restrict,
  qty        integer not null check (qty > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  line_total numeric(12,2) not null check (line_total >= 0),
  -- The listing as it was when bought. A later edit must not rewrite someone's
  -- past invoice.
  snapshot   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_lines_order_idx on order_lines (order_id);
create index if not exists order_lines_listing_idx on order_lines (listing_id);

create table if not exists order_events (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references orders (id) on delete cascade,
  actor      text not null,
  actor_id   text,
  event      text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on order_events (order_id, created_at);

-- ── 8. engagement ──────────────────────────────────────────────────────────

-- Enquiry THREADS used to live here — inquiries and inquiry_messages, a chat
-- per buyer per listing. They are gone; a showroom works leads. §21.2 carries
-- any that still exist across and then drops them.

create table if not exists bookings (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid not null references listings (id) on delete cascade,
  vendor_id     uuid not null references vendors (id) on delete cascade,
  buyer_user_id text not null,
  state         booking_state not null default 'requested',
  slot_start    timestamptz not null,
  slot_end      timestamptz not null,
  location      text,
  notes         text,
  order_id      uuid references orders (id) on delete set null,
  confirmed_at  timestamptz,
  completed_at  timestamptz,
  cancelled_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bookings_slot_valid check (slot_end > slot_start)
);

create index if not exists bookings_vendor_idx on bookings (vendor_id, slot_start);
create index if not exists bookings_buyer_idx on bookings (buyer_user_id, slot_start desc);

-- Anchored to a completed transaction. A review nobody can prove happened is
-- worth nothing.
create table if not exists reviews (
  id            uuid primary key default gen_random_uuid(),
  listing_id    uuid references listings (id) on delete set null,
  vendor_id     uuid not null references vendors (id) on delete cascade,
  buyer_user_id text not null,
  order_id      uuid references orders (id) on delete set null,
  booking_id    uuid references bookings (id) on delete set null,
  rating        smallint not null check (rating between 1 and 5),
  body          text,
  verified_purchase boolean not null default false,
  vendor_reply      text,
  vendor_replied_at timestamptz,
  hidden        boolean not null default false,
  hidden_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (order_id, buyer_user_id)
);

create index if not exists reviews_vendor_idx on reviews (vendor_id, created_at desc) where not hidden;
create index if not exists reviews_listing_idx on reviews (listing_id, created_at desc) where not hidden;

-- ── 9. finance ─────────────────────────────────────────────────────────────

create table if not exists commission_rules (
  id           uuid primary key default gen_random_uuid(),
  scope        text not null check (scope in ('global', 'type', 'category')),
  listing_type listing_type,
  category_id  uuid references categories (id) on delete cascade,
  rate         numeric(5,4) not null check (rate >= 0 and rate <= 1),
  min_fee      numeric(12,2) not null default 0,
  max_fee      numeric(12,2),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint commission_scope_shape check (
    (scope = 'global'   and listing_type is null and category_id is null) or
    (scope = 'type'     and listing_type is not null and category_id is null) or
    (scope = 'category' and category_id is not null)
  )
);

create unique index if not exists commission_global_idx on commission_rules (scope) where scope = 'global' and active;

create table if not exists disputes (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders (id) on delete cascade,
  opened_by     text not null,
  opener_id     text not null,
  state         dispute_state not null default 'open',
  reason        text not null,
  detail        text,
  evidence      jsonb not null default '[]'::jsonb,
  -- When this passes with no vendor response the dispute escalates on its own.
  -- Without it, a vendor closes a case by ignoring it.
  vendor_sla_at timestamptz,
  resolution    text,
  refund_amount numeric(12,2) check (refund_amount >= 0),
  resolved_by   text,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists disputes_state_idx on disputes (state, created_at)
  where state in ('open', 'vendor_responding', 'escalated', 'staff_review');
create index if not exists disputes_order_idx on disputes (order_id);
create index if not exists disputes_sla_idx on disputes (vendor_sla_at) where state = 'vendor_responding';

create table if not exists payouts (
  id             uuid primary key default gen_random_uuid(),
  vendor_id      uuid not null references vendors (id) on delete restrict,
  state          payout_state not null default 'draft',
  period_start   date not null,
  period_end     date not null,
  gross          numeric(12,2) not null default 0,
  commission     numeric(12,2) not null default 0,
  refunds        numeric(12,2) not null default 0,
  net            numeric(12,2) not null default 0,
  iban           text,
  reference      text,
  failure_reason text,
  approved_by    text,
  approved_at    timestamptz,
  paid_at        timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint payouts_period_valid check (period_end >= period_start),
  unique (vendor_id, period_start, period_end)
);

create index if not exists payouts_state_idx on payouts (state, period_end desc);

-- unique(order_id) is the structural guard against paying for the same order
-- twice.
create table if not exists payout_lines (
  id         uuid primary key default gen_random_uuid(),
  payout_id  uuid not null references payouts (id) on delete cascade,
  order_id   uuid not null references orders (id) on delete restrict,
  gross      numeric(12,2) not null,
  commission numeric(12,2) not null,
  net        numeric(12,2) not null,
  created_at timestamptz not null default now(),
  unique (order_id)
);

create index if not exists payout_lines_payout_idx on payout_lines (payout_id);

-- ── 10. buyer ──────────────────────────────────────────────────────────────

create table if not exists saved_listings (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  listing_id uuid not null references listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, listing_id)
);

create index if not exists saved_listings_user_idx on saved_listings (user_id, created_at desc);

create table if not exists saved_searches (
  id         uuid primary key default gen_random_uuid(),
  user_id    text not null,
  label      text,
  query      jsonb not null default '{}'::jsonb,
  notify     boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists saved_searches_user_idx on saved_searches (user_id);

create table if not exists addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  label       text,
  full_name   text not null,
  phone       text not null,
  city        text not null,
  district    text,
  street      text,
  building    text,
  postal_code text,
  notes       text,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists addresses_user_idx on addresses (user_id);

-- ── 11. audit ──────────────────────────────────────────────────────────────

create table if not exists audit_log (
  id         bigserial primary key,
  actor      text not null,
  actor_id   text,
  action     text not null,
  entity     text not null,
  entity_id  text,
  before     jsonb,
  after      jsonb,
  ip         text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_entity_idx on audit_log (entity, entity_id, created_at desc);
create index if not exists audit_log_actor_idx on audit_log (actor_id, created_at desc);
create index if not exists audit_log_action_idx on audit_log (action, created_at desc);

-- ── updated_at triggers ────────────────────────────────────────────────────

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'car_brands','car_models','car_trims','car_attributes','vendors','categories',
    'listings','orders','bookings','reviews','commission_rules',
    'disputes','payouts','addresses'
  ] loop
    execute format(
      'drop trigger if exists %I on %I; create trigger %I before update on %I
       for each row execute function set_updated_at()',
      tbl || '_updated_at', tbl, tbl || '_updated_at', tbl
    );
  end loop;
end $$;

-- ── 12. row level security ─────────────────────────────────────────────────
--
-- The public key may read live listings, approved vendors, active catalog and
-- unhidden reviews. Nothing else, and no write policy anywhere — every write
-- goes through the server with the secret key. A leaked public key can read the
-- catalogue and change nothing.

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'car_brands','car_models','car_trims','car_years','car_colors','car_attributes',
    'spec_attributes','vendors','categories','listings','listing_variants',
    'listing_specs','trim_specs','media_assets','orders','order_lines','order_events',
    'bookings','reviews','commission_rules','disputes',
    'payouts','payout_lines','saved_listings','saved_searches','addresses','audit_log'
  ] loop
    execute format('alter table %I enable row level security', tbl);
  end loop;
end $$;

drop policy if exists car_brands_public_read on car_brands;
create policy car_brands_public_read on car_brands for select using (active);

drop policy if exists car_models_public_read on car_models;
create policy car_models_public_read on car_models for select using (active);

drop policy if exists car_trims_public_read on car_trims;
create policy car_trims_public_read on car_trims for select using (active);

drop policy if exists car_years_public_read on car_years;
create policy car_years_public_read on car_years for select using (true);

drop policy if exists car_colors_public_read on car_colors;
create policy car_colors_public_read on car_colors for select using (true);

drop policy if exists car_attributes_public_read on car_attributes;
create policy car_attributes_public_read on car_attributes for select using (active);

drop policy if exists spec_attributes_public_read on spec_attributes;
create policy spec_attributes_public_read on spec_attributes for select using (active);

drop policy if exists vendors_public_read on vendors;
create policy vendors_public_read on vendors for select using (state = 'approved');

drop policy if exists categories_public_read on categories;
create policy categories_public_read on categories for select using (active);

drop policy if exists listings_public_read on listings;
create policy listings_public_read on listings for select using (state = 'live');

drop policy if exists listing_variants_public_read on listing_variants;
create policy listing_variants_public_read on listing_variants for select using (
  exists (select 1 from listings l where l.id = listing_id and l.state = 'live')
);

drop policy if exists listing_specs_public_read on listing_specs;
create policy listing_specs_public_read on listing_specs for select using (
  exists (select 1 from listings l where l.id = listing_id and l.state = 'live')
);

drop policy if exists trim_specs_public_read on trim_specs;
create policy trim_specs_public_read on trim_specs for select using (true);

drop policy if exists reviews_public_read on reviews;
create policy reviews_public_read on reviews for select using (not hidden);

-- ── 13. starting data ──────────────────────────────────────────────────────

insert into commission_rules (scope, rate)
select 'global', 0.0500
where not exists (select 1 from commission_rules where scope = 'global');

-- ── The four root categories ───────────────────────────────────────────────
--
-- Every listing carries a category_id, and the seller form resolves it by
-- listing_type rather than asking — a showroom adding a car should not have to
-- pick "Cars" from a list of one.
--
-- These used to exist only in seed.cjs, which meant a database that had run
-- schema.sql and nothing else refused to save any listing at all, with the
-- message "No car category exists — run seed.cjs first". A vendor cannot run a
-- Node script, and should never be told to: this is platform data, not sample
-- data, so it belongs in the schema beside the commission rule above.
--
-- seed.cjs still creates these plus a child tree; `on conflict do nothing`
-- means running it afterwards adds the children and leaves these untouched.

insert into categories (slug, name, listing_type, sort_order) values
  ('parts',       i18n('قطع الغيار','Spare Parts'),  'part',      1),
  ('cars',        i18n('السيارات','Cars'),            'car',       2),
  ('services',    i18n('الخدمات','Services'),         'service',   3),
  ('accessories', i18n('الإكسسوارات','Accessories'),  'accessory', 4)
on conflict (slug) do nothing;

-- Seller-selectable option lists. Icons and images are filled in from the media
-- library; descriptions explain the option to a buyer.
insert into car_attributes (kind, slug, name, description, sequence) values
  ('fuel', 'petrol',    i18n('بنزين','Petrol'),      i18n('محرك بنزين تقليدي','Conventional petrol engine'), 1),
  ('fuel', 'diesel',    i18n('ديزل','Diesel'),        i18n('عزم أعلى واستهلاك أقل','Higher torque, lower consumption'), 2),
  ('fuel', 'hybrid',    i18n('هجين','Hybrid'),        i18n('بنزين وكهرباء معاً','Petrol and electric combined'), 3),
  ('fuel', 'electric',  i18n('كهرباء','Electric'),    i18n('كهربائية بالكامل','Fully electric'), 4),
  ('transmission', 'automatic', i18n('أوتوماتيك','Automatic'), i18n('ناقل حركة أوتوماتيكي','Automatic gearbox'), 1),
  ('transmission', 'manual',    i18n('عادي','Manual'),        i18n('ناقل حركة يدوي','Manual gearbox'), 2),
  ('transmission', 'cvt',       i18n('CVT','CVT'),            i18n('ناقل حركة متغير باستمرار','Continuously variable'), 3),
  ('condition', 'new',  i18n('جديد','New'),   i18n('صفر كم، لم تُستخدم','Zero kilometres, unused'), 1),
  ('condition', 'used', i18n('مستعمل','Used'), i18n('سيارة مستعملة','Previously owned'), 2),
  ('body_type', 'sedan',  i18n('سيدان','Sedan'),      null, 1),
  ('body_type', 'suv',    i18n('دفع رباعي','SUV'),    null, 2),
  ('body_type', 'pickup', i18n('بيك أب','Pickup'),    null, 3),
  ('body_type', 'hatchback', i18n('هاتشباك','Hatchback'), null, 4),
  ('body_type', 'van',    i18n('فان','Van'),          null, 5)
on conflict (kind, slug) do nothing;

-- ── 14. vendor settings, address, backups ──────────────────────────────────
--
-- ALTER rather than extra columns in section 3, so this block applies to a
-- database built by an earlier run of this file as well as a fresh one.
-- `add column if not exists` is idempotent; re-running changes nothing.

alter table vendors add column if not exists address       jsonb not null default '{}'::jsonb;
alter table vendors add column if not exists working_hours jsonb not null default '{}'::jsonb;
alter table vendors add column if not exists social        jsonb not null default '{}'::jsonb;

-- Store preferences: default/fallback language, currency, timezone,
-- notification toggles. One jsonb so adding a preference is a data change.
alter table vendors add column if not exists settings      jsonb not null default '{}'::jsonb;

-- Soft delete. "Delete all my data" must not cascade a vendor row away while
-- orders still reference it — accounting needs those to survive.
alter table vendors add column if not exists deleted_at    timestamptz;
alter table vendors add column if not exists deletion_reason text;

create index if not exists vendors_active_idx on vendors (state) where deleted_at is null;

-- Point-in-time exports a vendor can download. The archive itself lives in the
-- storage bucket under vendors/<id>/backups/; this table is the index.
create table if not exists vendor_backups (
  id           uuid primary key default gen_random_uuid(),
  vendor_id    uuid not null references vendors (id) on delete cascade,
  storage_path text not null unique,
  url          text,
  size_bytes   bigint,
  -- Row counts per table at capture time, so a restore can be checked against
  -- what was actually taken rather than trusting the file.
  contents     jsonb not null default '{}'::jsonb,
  note         text,
  created_by   text,
  created_at   timestamptz not null default now()
);

create index if not exists vendor_backups_vendor_idx on vendor_backups (vendor_id, created_at desc);

alter table vendor_backups enable row level security;

-- Spec definitions get an illustrative image too, so a spec row can show a
-- diagram (a boot-space photo, a seat-layout drawing) and not only an icon.
alter table spec_attributes add column if not exists image_url text;

-- ── unit_code: text → jsonb ────────────────────────────────────────────────
--
-- A unit is translatable. "L" is "لتر" and "hp" is "حصان", and upstream ships
-- it as a bilingual object like every other label. Storing that in a text
-- column meant the object was serialised into it verbatim, so the spec editor
-- showed a literal {"en_US":"L","ar_001":"L"} where a unit belongs and the car
-- page printed the same thing in brackets after the value.
--
-- Guarded on the current type so the file stays re-runnable. Existing text
-- values are carried across as the English side rather than discarded.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spec_attributes'
      and column_name = 'unit_code' and data_type <> 'jsonb'
  ) then
    alter table spec_attributes
      alter column unit_code type jsonb
      using case
        when unit_code is null or btrim(unit_code) = '' then null
        -- Already an object that was stringified into the text column.
        when btrim(unit_code) like '{%' then unit_code::jsonb
        else jsonb_build_object('en', unit_code)
      end;
  end if;
end $$;

-- ── Spec option values ───────────────────────────────────────────────────────
--
-- The allowed answers for a choice-type spec. Upstream, a specification is not
-- free text: `select`, `multi` and `yesno` attributes each point at a row in
-- Odoo's product.attribute.value, and the spec sheet renders that row's label.
--
-- Without this table the seller form had to fall back to a text box, so one
-- seller typed "Automatic", another "automatic" and a third "أوتوماتيك" — three
-- values that never match each other, cannot be filtered on, and quietly make
-- the spec sheet useless. Exactly the failure that filled car_brands with
-- models and untranslated names.
--
-- `yesno` deserves a note: upstream it is NOT a boolean. Each yes/no attribute
-- owns four values — Yes, No, Available, Not Available — because "this car has
-- no sunroof" and "this trim does not offer a sunroof" are different answers.
-- Storing a checkbox would collapse that distinction, so the options live here
-- like any other choice list.
create table if not exists spec_attribute_values (
  id           uuid primary key default gen_random_uuid(),
  attribute_id uuid not null references spec_attributes (id) on delete cascade,
  name         jsonb not null default '{}'::jsonb,
  sequence     integer not null default 0,
  source_id    bigint,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  -- One row per upstream value per attribute, so the sync can upsert.
  unique (attribute_id, source_id)
);

create index if not exists spec_attribute_values_attr_idx
  on spec_attribute_values (attribute_id, sequence) where active;

alter table spec_attribute_values enable row level security;

drop policy if exists spec_attribute_values_public_read on spec_attribute_values;
create policy spec_attribute_values_public_read on spec_attribute_values
  for select using (active);

-- ── Option kinds ─────────────────────────────────────────────────────────────
--
-- `car_attributes.kind` groups the option lists — fuel, transmission, seats,
-- body_type. It has always been a bare text value repeated across the rows it
-- groups, which meant two things a seller could see:
--
--   1. no NAME. The picker showed the raw slug `body_type`, in every language,
--      because there was nowhere to put "نوع الهيكل" / "Body type".
--   2. no independent existence. A kind appeared when its first option was
--      filed under it and vanished when the last one went, so "add a kind"
--      could not mean anything.
--
-- This table gives a kind a row of its own. `car_attributes.kind` stays a text
-- slug rather than becoming a foreign key: it is already written that way by
-- the sync and read that way by the listing form, and a hard FK would make an
-- unrecognised kind fail the whole insert instead of just rendering unlabelled.
create table if not exists car_attribute_kinds (
  slug        text primary key,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  icon_url    text,
  image_url   text,
  -- Drives the fact row on the car card. The kind owns this, not the option:
  -- "show fuel on the card" is one decision, not one per fuel type.
  show_on_card boolean not null default false,
  sequence    integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- For anyone who ran the create above before these three columns existed.
alter table car_attribute_kinds add column if not exists image_url    text;
alter table car_attribute_kinds add column if not exists show_on_card boolean not null default false;

create index if not exists car_attribute_kinds_seq_idx
  on car_attribute_kinds (sequence) where active;

alter table car_attribute_kinds enable row level security;

drop policy if exists car_attribute_kinds_public_read on car_attribute_kinds;
create policy car_attribute_kinds_public_read on car_attribute_kinds
  for select using (active);

-- Adopt every kind already in use, so the tab is populated the first time it
-- opens rather than looking empty next to a full Options tab. `on conflict do
-- nothing` keeps this re-runnable and never overwrites a name someone edited.
insert into car_attribute_kinds (slug, name, show_on_card)
select
  distinct kind,
  case kind
    when 'fuel'         then '{"ar":"الوقود","en":"Fuel"}'::jsonb
    when 'transmission' then '{"ar":"ناقل الحركة","en":"Transmission"}'::jsonb
    when 'condition'    then '{"ar":"الحالة","en":"Condition"}'::jsonb
    when 'body_type'    then '{"ar":"نوع الهيكل","en":"Body type"}'::jsonb
    when 'seats'        then '{"ar":"المقاعد","en":"Seats"}'::jsonb
    -- Anything else keeps its slug as the name until someone translates it.
    else jsonb_build_object('en', kind)
  end,
  -- Only `condition` starts on, because the card already showed it. Turning
  -- the rest on is the seller's call, made in the Kinds tab.
  kind = 'condition'
from car_attributes
where kind is not null
on conflict (slug) do nothing;

-- ── 15. SEO ────────────────────────────────────────────────────────────────
--
-- One column per thing, not a `seo jsonb` grab-bag.
--
-- A blob is fine while nothing queries it and stops being fine the moment
-- something does: the sitemap builder wants to ORDER BY priority and filter on
-- indexable, the admin wants to find every listing missing an OG image, and
-- neither can use an index inside a jsonb. Columns also make the shape visible
-- — `seo_index boolean` says what it is, `seo->>'index'` says nothing about
-- whether the value is true, "true" or "1".
--
-- The bilingual ones stay jsonb because they hold {ar, en} like every other
-- translatable string in this schema. That is a value shape, not a bag.
--
-- Everything here is OPTIONAL and generated from the listing when left blank —
-- see src/marketplace/lib/seo.js. Nothing a seller has to fill in.

-- ── search result ──
-- meta_title / meta_description / meta_keywords / canonical_url already exist
-- (section 5). The rest of the search-result surface:

-- The one phrase this page is meant to win. Drives the generated keyword list
-- and gives an editor something to check the copy against.
alter table listings add column if not exists focus_keyword jsonb;

-- Robots, split in two because they are two independent instructions and
-- "noindex, follow" is a real and common combination.
alter table listings add column if not exists seo_index  boolean not null default true;
alter table listings add column if not exists seo_follow boolean not null default true;

-- ── share cards ──
-- og_title / og_description already exist (section 5).

-- The image a share card shows. Separate from the listing's photos on purpose:
-- a 4:3 gallery shot cropped to 1.91:1 loses the car, so a seller who cares
-- picks a wide one. Blank falls back to the main photo.
alter table listings add column if not exists og_image_url text;
alter table listings add column if not exists og_type      text not null default 'product';

-- Twitter/X reads its own tags first and only falls back to OG for what it
-- cannot find. Given separately so a seller can write a shorter line for the
-- platform that shows less of it.
alter table listings add column if not exists twitter_card        text not null default 'summary_large_image';
alter table listings add column if not exists twitter_title       jsonb;
alter table listings add column if not exists twitter_description jsonb;
alter table listings add column if not exists twitter_image_url   text;

-- ── sitemap ──
-- Read by the sitemap builder, which is why these are columns and not a blob:
-- it sorts on priority and filters on indexable.
alter table listings add column if not exists seo_priority   numeric(2,1) not null default 0.5
  check (seo_priority >= 0 and seo_priority <= 1);
alter table listings add column if not exists seo_changefreq text not null default 'weekly';

-- ── structured data ──
-- Overrides merged over the generated schema.org Vehicle/Product node. Free
-- jsonb because it IS arbitrary JSON-LD — the one case where a blob is the
-- honest shape.
alter table listings add column if not exists structured_data jsonb;

-- Find the listings whose metadata still needs a human, and let the sitemap
-- skip the excluded ones without a scan.
create index if not exists listings_seo_index_idx on listings (seo_index) where state = 'live';
create index if not exists listings_seo_missing_idx on listings (updated_at desc)
  where state = 'live' and meta_description is null;

-- ── 16. catalog templates ──────────────────────────────────────────────────
--
-- A vendor opening an empty Catalog has to invent 26 brands, 100 colours and
-- 41 specification definitions before they can list one car — and every vendor
-- who does it invents slightly different ones. So the real catalog ships as
-- static JSON (src/marketplace/catalog-templates/) and a vendor installs the
-- parts they want.
--
-- This table is the receipt. One row per row an install created, which is what
-- makes "remove this template" mean something precise: it deletes exactly what
-- it added, and nothing a vendor typed themselves.
--
-- Deliberately NOT a `from_template` column on the seven catalog tables. That
-- would be seven migrations, and it would answer "did a template create this?"
-- while leaving "which install, and when?" unanswerable. It also keeps the
-- catalog tables ignorant of a feature they do not participate in.
create table if not exists catalog_template_installs (
  id           uuid primary key default gen_random_uuid(),
  template     text not null,
  table_name   text not null,
  row_id       uuid not null,
  -- Null for a platform-wide install. The catalog is shared, so an install is
  -- normally global; the column exists so a future per-vendor catalog does not
  -- need a migration.
  vendor_id    uuid references vendors (id) on delete cascade,
  installed_by text,
  created_at   timestamptz not null default now(),
  /**
   * One receipt per row PER SELLER.
   *
   * This was `unique (table_name, row_id)` — right while an install was
   * platform-wide and vendor_id was always null, wrong the moment installs
   * became per-vendor: it says the year 2026 may appear in one showroom's
   * catalog and no other, when the whole point of a shared catalog is that
   * every showroom points at the same 2026.
   *
   * The live database already carries the three-column index — it predates the
   * constraint line below and `create table if not exists` never applied it —
   * which is why installs work there and would have failed on a fresh deploy,
   * where installTemplate's `onConflict: 'vendor_id, table_name, row_id'` had
   * no index to match.
   */
  unique (table_name, row_id, vendor_id)
);

-- For a database created before the line above was corrected. Cheap and
-- re-runnable; does nothing where the index already exists.
create unique index if not exists catalog_template_installs_vendor_row_idx
  on catalog_template_installs (vendor_id, table_name, row_id);

create index if not exists catalog_template_installs_tpl_idx
  on catalog_template_installs (template, created_at desc);

alter table catalog_template_installs enable row level security;


-- ── 17. auth: roles, vendor membership, row level security ─────────────────
--  Marketplace auth — roles, vendor membership, and row level security
--
--
--  ── Why this file exists ──────────────────────────────────────────────────
--
--  Identity is Supabase Auth on this same database, so auth.uid() is available
--  inside every policy and the rules live next to the data they protect. That
--  is the whole reason for choosing it over an external provider: a forgotten
--  check in application code returns NOTHING instead of EVERYTHING.
--
--  ── This will not break the running app ───────────────────────────────────
--
--  Every server query today goes through getMarketplaceDb(), which holds the
--  SERVICE ROLE key. Service role bypasses RLS entirely. So these policies are
--  inert until code is moved onto the anon client — which means they can be
--  applied now and adopted route by route, rather than in one risky switch.
--
--  ── Three roles ───────────────────────────────────────────────────────────
--
--    buyer   any signed-in user. The default. Needs no row anywhere.
--    vendor  a member of an APPROVED vendor, via vendor_members.
--    staff   platform operator: catalog, templates, moderation, payouts.
--    admin   staff, plus the things staff may see but not do.
--
--  Note that "vendor" is not really a value of profiles.role — it is a
--  MEMBERSHIP. A person is a vendor because they belong to a showroom, not
--  because a column says so; those two can disagree, and the membership is the
--  one that can be revoked in a single delete.

-- ── 17.1 Roles and profiles ──────────────────────────────────────────────────

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type app_role as enum ('buyer', 'staff', 'admin');
  end if;
end $$;

create table if not exists profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       app_role not null default 'buyer',
  full_name  text,
  phone      text,
  locale     text not null default 'ar',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on profiles (role) where role <> 'buyer';

-- A profile for every user, created WITH the user rather than on first visit.
-- Doing it in application code means the one path that forgets leaves a user
-- with no role at all, and the failure shows up much later as a permission bug.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, locale)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.phone,
    coalesce(new.raw_user_meta_data ->> 'locale', 'ar')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Anyone who signed up before this file was applied.
insert into profiles (id, full_name, phone, locale)
select u.id,
       u.raw_user_meta_data ->> 'full_name',
       u.phone,
       coalesce(u.raw_user_meta_data ->> 'locale', 'ar')
from auth.users u
on conflict (id) do nothing;


-- ── 17.2 Vendor membership ───────────────────────────────────────────────────
--
-- vendors.owner_user_id holds ONE person. A showroom has a manager and three
-- salespeople, and giving them a shared login is how an audit trail becomes
-- useless. This is the join table that fixes it; owner_user_id stays as the
-- record of who applied.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'vendor_member_role') then
    create type vendor_member_role as enum ('owner', 'manager', 'staff');
  end if;
end $$;

create table if not exists vendor_members (
  vendor_id  uuid not null references vendors (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       vendor_member_role not null default 'staff',
  created_at timestamptz not null default now(),
  primary key (vendor_id, user_id)
);

create index if not exists vendor_members_user_idx on vendor_members (user_id);

-- Carry across whoever already owns a vendor. owner_user_id is text and may
-- hold an id from the old NextAuth/Odoo scheme, so only values that are
-- actually uuids AND exist in auth.users are taken; anything else is left for a
-- human to reconcile rather than silently dropped or wrongly matched.
insert into vendor_members (vendor_id, user_id, role)
select v.id, u.id, 'owner'
from vendors v
join auth.users u on u.id::text = v.owner_user_id
on conflict do nothing;


-- ── 17.3 Helpers ─────────────────────────────────────────────────────────────
--
-- SECURITY DEFINER, all of them, and this is the important part: a policy on
-- table X that reads table Y needs permission to read Y, and if Y's own policy
-- reads X you have infinite recursion. Postgres reports it as a confusing
-- "infinite recursion detected in policy". Definer functions break the loop by
-- running as the owner, so the policy asks a question instead of doing a query.
--
-- STABLE lets the planner call them once per statement rather than per row.

create or replace function auth_role()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from profiles where id = auth.uid()), 'buyer'::app_role);
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() in ('staff', 'admin');
$$;

create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth_role() = 'admin';
$$;

-- The vendors this user may act for. APPROVED only, so suspending a showroom
-- takes effect on the next query rather than at next sign-in.
create or replace function my_vendor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select vm.vendor_id
  from vendor_members vm
  join vendors v on v.id = vm.vendor_id
  where vm.user_id = auth.uid()
    and v.state = 'approved';
$$;

create or replace function owns_vendor(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target is not null and target in (select my_vendor_ids());
$$;

-- My role in one showroom, and that showroom's stored state.
--
-- These two exist for one reason: a policy ON vendor_members that reads
-- vendor_members recurses, and so does a policy on vendors that reads vendors.
-- Postgres reports it as "infinite recursion detected in policy for relation",
-- which is a confusing way to be told the rule asked itself a question. A
-- definer function runs as the owner, with RLS off, so the loop never forms.
create or replace function my_vendor_role(target uuid)
returns vendor_member_role
language sql
stable
security definer
set search_path = public
as $$
  select role from vendor_members where vendor_id = target and user_id = auth.uid();
$$;

create or replace function is_vendor_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from vendor_members where vendor_id = target and user_id = auth.uid()
  );
$$;

create or replace function vendor_state_of(target uuid)
returns vendor_state
language sql
stable
security definer
set search_path = public
as $$
  select state from vendors where id = target;
$$;

-- Whether a listing belongs to one of my vendors. Used by every child table of
-- listings, which is why it is a function and not a repeated subquery.
create or replace function owns_listing(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from listings l
    where l.id = target and l.vendor_id in (select my_vendor_ids())
  );
$$;


-- ── 17.4 RLS on the tables that did not have it ──────────────────────────────

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'profiles', 'vendor_members', 'spec_attribute_values', 'car_attribute_kinds',
    'vendor_backups', 'catalog_template_installs'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = tbl) then
      execute format('alter table %I enable row level security', tbl);
    end if;
  end loop;
end $$;


-- ── 17.5 Profiles and membership ─────────────────────────────────────────────

drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles
  for select using (id = auth.uid() or is_staff());

-- Self-update, but NOT of `role`. A column-level rule is the wrong tool here —
-- a policy cannot forbid one column — so the check is that the role you are
-- writing equals the role you already have. Staff change roles; nobody
-- promotes themselves.
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = auth_role());

drop policy if exists profiles_staff_write on profiles;
create policy profiles_staff_write on profiles
  for all using (is_staff()) with check (is_staff());

drop policy if exists vendor_members_read on vendor_members;
create policy vendor_members_read on vendor_members
  for select using (user_id = auth.uid() or is_vendor_member(vendor_id) or is_staff());

-- Only an owner or a manager adds colleagues — not every salesperson with a
-- login.
drop policy if exists vendor_members_manage on vendor_members;
create policy vendor_members_manage on vendor_members
  for all using (is_staff() or my_vendor_role(vendor_id) in ('owner', 'manager'))
  with check (is_staff() or my_vendor_role(vendor_id) in ('owner', 'manager'));


-- ── 17.6 Catalog — shared data, staff-owned ──────────────────────────────────
--
-- This is the rule that was missing from the design, not just from the code:
-- brands, models and specifications are SHARED across every vendor, so a
-- vendor renaming "Toyota" renames it for the whole platform.
--
-- Staff write freely. A vendor may still ADD a row the catalog is missing —
-- that is what created_by_vendor_id is for — and may edit or delete only what
-- they themselves added.

do $$
declare tbl text;
begin
  foreach tbl in array array[
    'car_brands', 'car_models', 'car_trims', 'car_colors', 'car_attributes'
  ] loop
    execute format('drop policy if exists %I on %I', tbl || '_staff_write', tbl);
    execute format(
      'create policy %I on %I for all using (is_staff()) with check (is_staff())',
      tbl || '_staff_write', tbl
    );

    execute format('drop policy if exists %I on %I', tbl || '_vendor_own', tbl);
    execute format(
      'create policy %I on %I for all
         using (owns_vendor(created_by_vendor_id))
         with check (owns_vendor(created_by_vendor_id))',
      tbl || '_vendor_own', tbl
    );
  end loop;
end $$;

-- No created_by_vendor_id on these, so they are staff-only outright.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'car_years', 'spec_attributes', 'spec_attribute_values', 'categories',
    'trim_specs', 'car_attribute_kinds', 'commission_rules'
  ] loop
    if exists (select 1 from pg_tables where schemaname = 'public' and tablename = tbl) then
      execute format('drop policy if exists %I on %I', tbl || '_staff_write', tbl);
      execute format(
        'create policy %I on %I for all using (is_staff()) with check (is_staff())',
        tbl || '_staff_write', tbl
      );
    end if;
  end loop;
end $$;

drop policy if exists catalog_template_installs_staff on catalog_template_installs;
create policy catalog_template_installs_staff on catalog_template_installs
  for all using (is_staff()) with check (is_staff());


-- ── 17.7 Vendors ─────────────────────────────────────────────────────────────

-- A member sees their own showroom whatever its state — an applicant must be
-- able to watch their application, and the public policy only shows approved.
drop policy if exists vendors_member_read on vendors;
create policy vendors_member_read on vendors
  for select using (is_staff() or is_vendor_member(id));

-- Anyone signed in may APPLY, and only as themselves.
drop policy if exists vendors_apply on vendors;
create policy vendors_apply on vendors
  for insert to authenticated
  with check (owner_user_id = auth.uid()::text and state = 'applied');

-- Owners and managers edit the showroom. `state` is not theirs to change —
-- same trick as profiles.role: the value written must equal the value already
-- stored, so approving yourself is not expressible.
drop policy if exists vendors_owner_update on vendors;
create policy vendors_owner_update on vendors
  for update using (my_vendor_role(id) in ('owner', 'manager'))
  -- vendor_state_of() reads the STORED row; `state` here is the row being
  -- written. Equal means the update left it alone. Reading vendors directly in
  -- a policy on vendors would recurse.
  with check (state = vendor_state_of(id));

drop policy if exists vendors_staff_write on vendors;
create policy vendors_staff_write on vendors
  for all using (is_staff()) with check (is_staff());


-- ── 17.8 Listings and their children ─────────────────────────────────────────

drop policy if exists listings_vendor_all on listings;
create policy listings_vendor_all on listings
  for all using (owns_vendor(vendor_id)) with check (owns_vendor(vendor_id));

drop policy if exists listings_staff_all on listings;
create policy listings_staff_all on listings
  for all using (is_staff()) with check (is_staff());

do $$
declare tbl text;
begin
  foreach tbl in array array['listing_variants', 'listing_specs'] loop
    execute format('drop policy if exists %I on %I', tbl || '_vendor_all', tbl);
    execute format(
      'create policy %I on %I for all
         using (owns_listing(listing_id)) with check (owns_listing(listing_id))',
      tbl || '_vendor_all', tbl
    );

    execute format('drop policy if exists %I on %I', tbl || '_staff_all', tbl);
    execute format(
      'create policy %I on %I for all using (is_staff()) with check (is_staff())',
      tbl || '_staff_all', tbl
    );
  end loop;
end $$;


-- ── 17.9 Media ───────────────────────────────────────────────────────────────

drop policy if exists media_assets_vendor_all on media_assets;
create policy media_assets_vendor_all on media_assets
  for all using (owns_vendor(vendor_id) or owner_user_id = auth.uid()::text)
  with check (owns_vendor(vendor_id) or owner_user_id = auth.uid()::text);

drop policy if exists media_assets_staff_all on media_assets;
create policy media_assets_staff_all on media_assets
  for all using (is_staff()) with check (is_staff());

drop policy if exists vendor_backups_vendor_all on vendor_backups;
create policy vendor_backups_vendor_all on vendor_backups
  for all using (owns_vendor(vendor_id) or is_staff())
  with check (owns_vendor(vendor_id) or is_staff());


-- ── 17.10 Orders, enquiries, bookings ────────────────────────────────────────
--
-- Two sides to every one of these: the buyer who placed it and the vendor it
-- was placed with. Both read; neither sees the other's other business.

drop policy if exists orders_buyer_read on orders;
create policy orders_buyer_read on orders
  for select using (buyer_user_id = auth.uid()::text);

drop policy if exists orders_buyer_insert on orders;
create policy orders_buyer_insert on orders
  for insert to authenticated with check (buyer_user_id = auth.uid()::text);

drop policy if exists orders_vendor_all on orders;
create policy orders_vendor_all on orders
  for all using (owns_vendor(vendor_id)) with check (owns_vendor(vendor_id));

drop policy if exists orders_staff_all on orders;
create policy orders_staff_all on orders
  for all using (is_staff()) with check (is_staff());

-- Children of an order inherit its audience.
create or replace function can_see_order(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from orders o
    where o.id = target
      and (o.buyer_user_id = auth.uid()::text
           or o.vendor_id in (select my_vendor_ids())
           or is_staff())
  );
$$;

do $$
declare tbl text;
begin
  foreach tbl in array array['order_lines', 'order_events', 'disputes', 'payout_lines'] loop
    execute format('drop policy if exists %I on %I', tbl || '_party_all', tbl);
    execute format(
      'create policy %I on %I for all
         using (can_see_order(order_id)) with check (can_see_order(order_id))',
      tbl || '_party_all', tbl
    );
  end loop;
end $$;

drop policy if exists bookings_party_all on bookings;
create policy bookings_party_all on bookings
  for all using (buyer_user_id = auth.uid()::text or owns_vendor(vendor_id) or is_staff())
  with check (buyer_user_id = auth.uid()::text or owns_vendor(vendor_id) or is_staff());

drop policy if exists payouts_vendor_read on payouts;
create policy payouts_vendor_read on payouts
  for select using (owns_vendor(vendor_id) or is_staff());

-- Money moves on the platform's say-so, never the recipient's.
drop policy if exists payouts_staff_write on payouts;
create policy payouts_staff_write on payouts
  for all using (is_staff()) with check (is_staff());


-- ── 17.11 What a buyer owns ──────────────────────────────────────────────────

do $$
declare tbl text;
begin
  foreach tbl in array array['saved_listings', 'saved_searches', 'addresses'] loop
    execute format('drop policy if exists %I on %I', tbl || '_self_all', tbl);
    execute format(
      'create policy %I on %I for all
         using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text)',
      tbl || '_self_all', tbl
    );
  end loop;
end $$;

-- Reviews are already publicly readable when not hidden; this is the write side.
drop policy if exists reviews_author_write on reviews;
create policy reviews_author_write on reviews
  for all using (buyer_user_id = auth.uid()::text) with check (buyer_user_id = auth.uid()::text);

drop policy if exists reviews_staff_all on reviews;
create policy reviews_staff_all on reviews
  for all using (is_staff()) with check (is_staff());


-- ── 17.12 Audit log ──────────────────────────────────────────────────────────
--
-- Readable by staff, writable by nobody through this connection. An audit trail
-- that its subject can edit is not an audit trail; entries are written by the
-- service role, which bypasses RLS.

drop policy if exists audit_log_staff_read on audit_log;
create policy audit_log_staff_read on audit_log for select using (is_staff());


-- ═══════════════════════════════════════════════════════════════════════════
--  Making yourself an admin — run once, with your own email:
--
--    update profiles set role = 'admin'
--    where id = (select id from auth.users where email = 'you@example.com');
--
--  And to attach yourself to a showroom:
--
--    insert into vendor_members (vendor_id, user_id, role)
--    select v.id, u.id, 'owner'
--    from vendors v, auth.users u
--    where v.slug = 'your-vendor-slug' and u.email = 'you@example.com'
--    on conflict do nothing;
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 18. per-seller catalog ─────────────────────────────────────────────────
--  Per-seller catalog
--
--  Idempotent.
--
--  ── What changes ──────────────────────────────────────────────────────────
--
--  A new seller now opens the Catalog tab and finds it EMPTY, and fills it by
--  installing the templates they actually want. Two sellers can install
--  different ones; neither sees the other's.
--
--  ── What does NOT change: the rows are still shared ───────────────────────
--
--  There is still exactly one "Toyota" row, and every seller who installs the
--  brands template points at it. Giving each vendor their own copy would look
--  tidier and break the marketplace:
--
--    · A listing stores a brand_id. Forty copies of Toyota means the browse
--      filter "Toyota" returns one seller's cars.
--    · The search facets would list the same brand once per vendor.
--    · car_models is unique (brand_id, slug) — per-vendor copies would need
--      that uniqueness relaxed, and then nothing stops two spellings of the
--      same model existing side by side.
--
--  So the ROWS are shared and the SELECTION is per vendor. The receipt table
--  already had a vendor_id column reserved for exactly this; all it needed was
--  a uniqueness rule that lets two sellers point at the same row.

-- ── 18.1 One receipt per row PER VENDOR ──────────────────────────────────────
--
-- Was unique (table_name, row_id): one receipt per row, full stop. The second
-- seller to install the brands template hit a duplicate key on all twenty-six.

alter table catalog_template_installs
  drop constraint if exists catalog_template_installs_table_name_row_id_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'catalog_template_installs_vendor_row_key'
  ) then
    -- NULLS NOT DISTINCT so the legacy platform-wide receipts (vendor_id null)
    -- still cannot be duplicated. Without it Postgres treats every null as
    -- unique and the same global row could be recorded any number of times.
    alter table catalog_template_installs
      add constraint catalog_template_installs_vendor_row_key
      unique nulls not distinct (vendor_id, table_name, row_id);
  end if;
end $$;

create index if not exists catalog_template_installs_vendor_idx
  on catalog_template_installs (vendor_id, table_name);


-- ── 18.2 The existing 400-odd receipts ───────────────────────────────────────
--
-- They were written by a platform-wide install, before any of this existed,
-- and they carry vendor_id null. Leaving them as-is is what makes every seller
-- start clean: the reader below only counts receipts that name a vendor.
--
-- They are NOT deleted, because deleting them would lose the record of which
-- rows arrived from which template — the thing "Remove" needs in order to know
-- what it may take away. Staff still see the whole catalog regardless.


-- ── 18.3 What a seller may see ───────────────────────────────────────────────
--
-- Three sources, and the third is the one that is easy to forget:
--
--   1. rows they installed          — a receipt naming them
--   2. rows they created themselves — created_by_vendor_id
--   3. rows their own listings use  — so a brand can never vanish out from
--      under a car they are already selling, whatever they uninstall
--
-- SECURITY DEFINER for the usual reason: this is read by policies, and a
-- policy that queries a policed table recurses.

create or replace function vendor_catalog_rows(target uuid, tbl text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
    select i.row_id
    from catalog_template_installs i
    where i.vendor_id = target and i.table_name = tbl;

  if tbl = 'car_brands' then
    return query select b.id from car_brands b where b.created_by_vendor_id = target;
    return query select distinct l.brand_id from listings l
      where l.vendor_id = target and l.brand_id is not null;
  elsif tbl = 'car_models' then
    return query select m.id from car_models m where m.created_by_vendor_id = target;
    return query select distinct l.model_id from listings l
      where l.vendor_id = target and l.model_id is not null;
  elsif tbl = 'car_trims' then
    return query select t.id from car_trims t where t.created_by_vendor_id = target;
    return query select distinct l.trim_id from listings l
      where l.vendor_id = target and l.trim_id is not null;
  elsif tbl = 'car_colors' then
    return query select c.id from car_colors c where c.created_by_vendor_id = target;
    return query select distinct l.color_id from listings l
      where l.vendor_id = target and l.color_id is not null;
  end if;
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  To give an existing seller the catalog they were already using — for a
--  showroom that had listings before this change:
--
--    insert into catalog_template_installs (template, table_name, row_id, vendor_id)
--    select i.template, i.table_name, i.row_id,
--           (select id from vendors where slug = 'your-slug')
--    from catalog_template_installs i
--    where i.vendor_id is null
--    on conflict do nothing;
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  19. EMAIL CODE THROTTLE
--
--  The marketplace mints its own sign-up and password-reset codes now: Supabase
--  generates the token (admin generate_link, which sends nothing and is not
--  rate limited) and we deliver it over our own SMTP. That removes the two
--  emails-per-hour ceiling on Supabase's built-in mailer — and with it, the
--  only thing that was stopping an anonymous visitor from posting a stranger's
--  address into the "send me a code" form a thousand times.
--
--  So the limit has to live here. Two windows, because two different abuses:
--
--    per address   a burst at one inbox — mail bombing someone
--    per hour      total volume, which is what gets an SMTP account suspended
--
--  Rows are the audit trail as well as the counter, which is why sends are
--  recorded rather than counted in memory: a server that restarts, or a second
--  instance, must not reset somebody's budget.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists auth_otp_sends (
  id         bigint generated always as identity primary key,
  email      text        not null,
  purpose    text        not null check (purpose in ('signup', 'recovery')),
  sent_at    timestamptz not null default now()
);

create index if not exists auth_otp_sends_email_idx on auth_otp_sends (email, sent_at desc);
create index if not exists auth_otp_sends_time_idx  on auth_otp_sends (sent_at desc);

-- No policies and RLS on: nothing but the service role may read or write this.
-- It records unconfirmed email addresses, which is exactly the list an attacker
-- would want, and no signed-in user has any reason to see it.
alter table auth_otp_sends enable row level security;

/**
 * May we send this address a code, and record it if so.
 *
 * One function rather than a count followed by an insert, because those two
 * statements race: two requests a millisecond apart both read "0 sent" and both
 * send. Checking and recording in a single statement makes the limit real.
 *
 * Returns the number of seconds to wait, or 0 when the send may go ahead.
 */
-- The first version of this took (text, text, int, interval, int). Postgres
-- overloads on the argument list rather than replacing, so without this drop a
-- database that ran the earlier section 19 would end up holding BOTH — and a
-- two-argument call from PostgREST matches neither uniquely, failing with
-- 'function is not unique' rather than sending a code.
drop function if exists otp_send_allowed(text, text, int, interval, int);

create or replace function otp_send_allowed(
  target text,
  kind text,
  cooldown interval default '60 seconds',
  per_address int default 5,
  address_window interval default '24 hours',
  per_hour int default 300
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  last_at  timestamptz;
  recent   int;
  oldest   timestamptz;
  global   int;
begin
  -- 1. The cooldown. This is the one a real person meets: they pressed the
  --    button twice, or the code was slow arriving. A minute, then try again —
  --    NOT a fifteen-minute wall, which is what a tight burst limit turns into
  --    the moment somebody is genuinely waiting for an email.
  select max(sent_at) into last_at
  from auth_otp_sends
  where email = lower(target);

  if last_at is not null and last_at > now() - cooldown then
    return greatest(1, ceil(extract(epoch from (last_at + cooldown - now())))::int);
  end if;

  -- 2. The daily ceiling for one address: five codes in 24 hours, sign-up and
  --    reset together. The app passes these explicitly (OTP_DAILY_LIMIT in
  --    src/marketplace/lib/env.ts) and tells the person the rule up front.
  select count(*), min(sent_at) into recent, oldest
  from auth_otp_sends
  where email = lower(target) and sent_at > now() - address_window;

  if recent >= per_address then
    return greatest(1, ceil(extract(epoch from (oldest + address_window - now())))::int);
  end if;

  -- 3. The platform-wide ceiling, which exists to protect the SMTP account's
  --    reputation rather than any one inbox. It reports a flat minute: telling
  --    a stranger how close the whole system is to its limit is not information
  --    they need.
  select count(*) into global
  from auth_otp_sends
  where sent_at > now() - interval '1 hour';

  if global >= per_hour then
    return 60;
  end if;

  insert into auth_otp_sends (email, purpose) values (lower(target), kind);
  return 0;
end;
$$;

revoke all on function otp_send_allowed(text, text, interval, int, interval, int) from public, anon, authenticated;

/**
 * Housekeeping. Codes expire in minutes; rows older than a day are only
 * useful to somebody who steals the database.
 */
create or replace function prune_auth_otp_sends()
returns void
language sql
security definer
set search_path = public
as $$
  delete from auth_otp_sends where sent_at < now() - interval '1 day';
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 20. LEADS — vendor-defined forms, and the CRM that receives them
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A lead is what a buyer sends from a listing, and what the seller works in
-- their pipeline. The two halves of this section are:
--
--   vendor_form_fields   what THIS seller asks a buyer for. A finance broker
--                        wants monthly income and employer; a used-car dealer
--                        wants a trade-in and a budget. There is no field set
--                        that suits both, so the seller builds their own.
--
--   leads.answers        what the buyer actually typed, stored on the lead.
--
-- ── Why the answers live in jsonb, not in columns ───────────────────────────
--
-- The alternative is a lead_field_values table with a row per answer. It reads
-- more "correct" and it is worse here: every list of leads becomes a join and a
-- pivot, and a seller's inbox is the most-viewed page in the dashboard. The
-- answers are only ever read as a set, alongside the lead they belong to, so
-- they are stored as a set.
--
-- What is NOT in jsonb is the field DEFINITION. Those are rows, because the
-- builder edits them one at a time, they are ordered, and a jsonb blob of them
-- would be rewritten wholesale on every edit — losing the other tab's changes.
--
-- ── Answers keep the label they were asked under ────────────────────────────
--
-- Each answer stores the label as well as the value. A seller who renames
-- "Budget" to "Budget (SAR)" next month must not silently rewrite what four
-- hundred buyers were asked, and a deleted field must not blank the leads that
-- answered it. The definition is for RENDERING the form; the answer is a
-- historical record of one conversation.

-- Renamed from inquiry_field_type, and the rename comes FIRST on purpose: the
-- create below would otherwise mint a fresh lead_field_type on a database that
-- already has the old one, leaving vendor_form_fields.type pointing at a name
-- nothing else uses. `create table if not exists` skips the existing table, so
-- the column's type can only be fixed here.
do $$ begin
  if exists (select 1 from pg_type where typname = 'inquiry_field_type')
     and not exists (select 1 from pg_type where typname = 'lead_field_type') then
    alter type inquiry_field_type rename to lead_field_type;
  end if;
end $$;

do $$ begin
  create type lead_field_type as enum (
    'text', 'textarea', 'number', 'select', 'multiselect',
    'radio', 'checkbox', 'date', 'phone', 'email'
  );
exception when duplicate_object then null; end $$;

create table if not exists vendor_form_fields (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references vendors (id) on delete cascade,
  -- Stable machine name, used as the key in leads.answers. Generated from
  -- the label once and never changed afterwards, so renaming a label cannot
  -- orphan the answers already filed under it.
  field_key   text not null,
  label       jsonb not null default '{}'::jsonb,
  help        jsonb,
  placeholder jsonb,
  type        lead_field_type not null default 'text',
  -- [{ value, label: {ar, en} }] for select / multiselect / radio. Empty for
  -- every other type.
  options     jsonb not null default '[]'::jsonb,
  required    boolean not null default false,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (vendor_id, field_key)
);

create index if not exists vendor_form_fields_vendor_idx
  on vendor_form_fields (vendor_id, sort_order)
  where active;

-- The column existed with nothing keeping it current: every write set it by
-- hand, which is a rule that holds until the one write that forgets. The
-- trigger is the same one the other fifteen tables use.
drop trigger if exists vendor_form_fields_updated_at on vendor_form_fields;
create trigger vendor_form_fields_updated_at before update on vendor_form_fields
  for each row execute function set_updated_at();

-- ── 20.1 Who may read and write the form ────────────────────────────────────

alter table vendor_form_fields enable row level security;

-- The seller owns their own form. is_vendor_member() is the same SECURITY
-- DEFINER helper the rest of the seller policies use, so this cannot recurse.
drop policy if exists vendor_form_fields_owner_all on vendor_form_fields;
create policy vendor_form_fields_owner_all on vendor_form_fields
  for all
  using (is_vendor_member(vendor_id) or is_staff())
  with check (is_vendor_member(vendor_id) or is_staff());

-- Anyone may READ the active fields of an approved showroom — the buyer filling
-- the form has to be able to see what they are being asked, and a signed-out
-- visitor sees the form before they sign in to send it.
drop policy if exists vendor_form_fields_public_read on vendor_form_fields;
create policy vendor_form_fields_public_read on vendor_form_fields
  for select
  using (active and vendor_state_of(vendor_id) = 'approved');

-- ── 20.2 Layout: how the form LOOKS, not just what it asks ──────────────────
--
-- Two additions, both about presentation, and both stored because a seller who
-- arranges their form and finds it rearranged tomorrow will not arrange it
-- twice.
--
-- `width` is a fraction of the row, not a pixel count. A buyer's form is
-- rendered on a phone, a laptop and inside a dialog, and a field that is "320px"
-- in a 300px column is a horizontal scrollbar. Three values only — full, half,
-- third — because they compose into a grid that always adds up, and because a
-- builder offering twelve column spans is a builder nobody finishes using.
--
-- `lead_form_style` is a named preset — the SHAPE of a field, chosen from five
-- that were each designed as a whole.
--
-- `lead_form_theme` is the three things on top of it: accent colour, corner
-- radius, density. jsonb rather than three columns because they are one
-- decision ("how should this look"), always read together, never queried on,
-- and adding a fourth axis should not be a migration.
--
-- It is deliberately NOT free CSS. A seller choosing from six accents and three
-- radii cannot produce grey text on a grey background or a form that scrolls
-- sideways on a phone; a seller given a colour picker and a pixel box can do
-- both, and the buyer is the one who pays for it. The closed sets are what make
-- handing over the styling safe — see src/marketplace/lib/form-styles.js, which
-- is the only thing that reads this and validates every value on the way out.

do $$ begin
  create type form_field_width as enum ('full', 'half', 'third');
exception when duplicate_object then null; end $$;

alter table vendor_form_fields
  add column if not exists width form_field_width not null default 'full';

alter table vendors
  add column if not exists lead_form_style text not null default 'classic';

alter table vendors
  add column if not exists lead_form_theme jsonb not null default '{}'::jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- 21. LEADS — their own table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- THE table a showroom works. One row per person who asked about a car,
-- carrying their contact details, the answers to that showroom's own questions,
-- a stage, an owner and a follow-up date.
--
-- ── Why it is not the enquiry thread it replaced ────────────────────────────
--
-- The marketplace used to store this on `inquiries` — a chat thread — with the
-- thread's state doing double duty as a pipeline stage. Three things were wrong
-- with that, and each of them is a column or a constraint here:
--
--   1. unique (listing_id, buyer_user_id) — one row per buyer per listing is
--      right for a chat and wrong for a lead. The same person asking about the
--      same car twice, six months apart, is two opportunities, so there is no
--      uniqueness rule below.
--   2. `state` had to be a chat state AND a sales stage. "declined" means the
--      seller refused an offer; "lost" means the deal died. Not the same word,
--      so `stage` is its own enum in a sales vocabulary.
--   3. `on delete cascade` from listings deleted the leads a car produced —
--      the sales history a seller most wants to keep. listing_id is SET NULL
--      here, with the title snapshotted beside it.
--
-- §21.2 carries any surviving thread across and then drops the tables.

do $$ begin
  create type lead_stage as enum ('new', 'contacted', 'quoted', 'won', 'lost');
exception when duplicate_object then null; end $$;

create table if not exists leads (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors (id) on delete cascade,

  -- SET NULL, not cascade. The car goes; the lead and everything the buyer told
  -- you about themselves stays. listing_title is the snapshot that keeps the
  -- row readable afterwards.
  listing_id    uuid references listings (id) on delete set null,
  listing_title jsonb,

  buyer_user_id text not null,

  -- Captured at submission, never read live off the profile. A buyer changing
  -- their number next week must not rewrite the number the seller was given for
  -- a deal already in progress.
  contact_name  text not null,
  contact_phone text not null,
  contact_email text,

  -- The vendor's own questions, as answered. See §20 for why this is jsonb and
  -- why each answer carries the label it was asked under.
  answers       jsonb not null default '{}'::jsonb,
  message       text,

  stage         lead_stage not null default 'new',
  -- Free text, deliberately. A seller's reason for losing a deal is not a
  -- dropdown anybody can design in advance.
  outcome_note  text,

  assigned_to   text,
  follow_up_at  timestamptz,

  source        text not null default 'listing_form',

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The seller's pipeline view: their leads, newest first, filtered by stage.
create index if not exists leads_vendor_idx on leads (vendor_id, stage, created_at desc);
create index if not exists leads_buyer_idx  on leads (buyer_user_id, created_at desc);
create index if not exists leads_listing_idx on leads (listing_id);
create index if not exists leads_followup_idx on leads (vendor_id, follow_up_at)
  where follow_up_at is not null;

-- Searching the answers. Without this, "find the lead that said Riyadh" is a
-- full scan of every lead the showroom has ever received.
create index if not exists leads_answers_idx on leads using gin (answers);

drop trigger if exists leads_updated_at on leads;
create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();

alter table leads enable row level security;

-- The showroom works them; the buyer may see what they sent. Nobody else.
drop policy if exists leads_party_all on leads;
create policy leads_party_all on leads
  for all
  using (owns_vendor(vendor_id) or buyer_user_id = auth.uid()::text or is_staff())
  with check (owns_vendor(vendor_id) or buyer_user_id = auth.uid()::text or is_staff());


-- ── 21.1 Live leads ────────────────────────────────────────────────────────
--
-- A lead that lands while the seller has the pipeline open should appear in it,
-- not on the next refresh.
--
-- Supabase Realtime broadcasts row changes to subscribed clients, but only for
-- tables in the `supabase_realtime` publication — opt-in per table, and the
-- reason a correct-looking subscription silently receives nothing.
--
-- RLS still applies to what is broadcast: a client is only sent rows it could
-- have selected anyway. leads_party_all above is that rule, so one showroom
-- cannot subscribe to another's pipeline.
--
-- REPLICA IDENTITY FULL so an UPDATE carries the OLD row as well as the new
-- one. Without it a stage change arrives with no way to tell which column the
-- lead moved out of, and a board cannot take the card off the old pile.

alter table leads replica identity full;

-- ── Publishing, and SAYING SO when it does not work ────────────────────────
--
-- This block used to swallow its own failure. `exception when others` with a
-- `raise notice` meant the schema run finished green while realtime was never
-- switched on, and the symptom downstream is the worst kind: the browser's
-- channel reports SUBSCRIBED, looks perfectly healthy, and silently receives
-- nothing for ever.
--
-- It still must not ABORT the run — a database left half-migrated because an
-- enhancement could not be enabled is worse than an enhancement that is off.
-- So the shape is: try, then CHECK, then complain loudly with the exact
-- statement to run by hand.
--
-- WARNING rather than NOTICE, because psql and the Supabase SQL editor both
-- show warnings by default and notices are easy to scroll past.
--
-- Three ways this legitimately refuses, and only one is "no publication":
--
--   · no supabase_realtime publication at all  — a plain Postgres database
--   · the publication is FOR ALL TABLES        — 55000, and adding one table to
--                                                it is an error, not a no-op
--                                                (it is already covered)
--   · the role does not own the publication    — 42501, needs the owner

do $$
declare
  published boolean;
  all_tables boolean;
  why text := null;
begin
  select coalesce(bool_or(puballtables), false) into all_tables
  from pg_publication where pubname = 'supabase_realtime';

  -- FOR ALL TABLES already covers leads, and adding to it is an error.
  if all_tables then
    raise notice 'Realtime: supabase_realtime is FOR ALL TABLES — leads is already covered.';
    return;
  end if;

  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise warning
      'Realtime: there is no supabase_realtime publication. Live leads will not work. Create it with: create publication supabase_realtime with (publish = ''insert,update,delete'');';
    return;
  end if;

  begin
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
    ) then
      execute 'alter publication supabase_realtime add table leads';
    end if;
  exception when others then
    why := sqlerrm;
  end;

  -- The point of the whole block: did it actually take?
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'leads'
  ) into published;

  if published then
    raise notice 'Realtime: leads is published. Live leads are on.';
  else
    raise warning
      'REALTIME IS OFF FOR leads%. The seller badge will only update on refresh. Run this as the publication owner: alter publication supabase_realtime add table leads;',
      coalesce(' (' || why || ')', '');
  end if;
end $$;

-- ── Checking it by hand ────────────────────────────────────────────────────
--
-- One row back means live leads work. No rows means they do not, whatever the
-- dashboard's Replication page appears to show:
--
--   select * from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename = 'leads';


-- ── 21.2 Retiring the enquiry threads ───────────────────────────────────────
--
-- There used to be a second way in: `inquiries` and `inquiry_messages`, a chat
-- thread per buyer per listing, with its own seller inbox beside the pipeline.
-- Both tables are dropped here.
--
-- ── Why removed rather than kept alongside ──────────────────────────────────
--
--   · A seller with two inboxes checks one of them. Splitting "somebody asked
--     about a car" across a pipeline and a chat list meant neither was the
--     place where the work happened, and a lead could sit unworked because its
--     owner was watching the other page.
--   · A thread carried `unique (listing_id, buyer_user_id)` and cascaded from
--     its listing. Both are wrong for a sales record — see §21 above — so the
--     two could never be merged, only chosen between.
--
-- A showroom now works leads and calls or emails back on the contact details
-- the lead carries. That is the ordinary shape of a CRM.
--
-- ── NOTHING IS THROWN AWAY ──────────────────────────────────────────────────
--
-- Every thread becomes a lead FIRST, including the ones that never went through
-- a form: those arrive as a lead whose `message` is what the buyer actually
-- typed. Only then are the tables dropped. Replies are not carried across —
-- there is nowhere left to hold a conversation — so the opening message is what
-- survives, which is the part that says what the person wanted.
--
-- Idempotent by construction rather than by a guard: the block reads a table it
-- then drops, so a second run finds nothing and returns immediately. That also
-- means it can only ever migrate once, which is what stops a re-run of this
-- file from duplicating somebody's pipeline.

do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'inquiries'
  ) then
    return;
  end if;

  -- §20 may never have run on this database, in which case these columns do not
  -- exist and the select below fails to PLAN rather than returning nulls.
  -- Adding them costs one statement each and they die with the table forty
  -- lines later.
  alter table inquiries add column if not exists answers       jsonb not null default '{}'::jsonb;
  alter table inquiries add column if not exists contact_name  text;
  alter table inquiries add column if not exists contact_phone text;
  alter table inquiries add column if not exists contact_email text;
  alter table inquiries add column if not exists source        text;

  insert into leads (
    vendor_id, listing_id, listing_title, buyer_user_id,
    contact_name, contact_phone, contact_email,
    answers, message, stage, source, created_at
  )
  select
    i.vendor_id,
    i.listing_id,
    l.name,
    i.buyer_user_id,
    -- Both are NOT NULL on leads. A thread that never captured them still has
    -- to land as a readable row rather than abort the migration.
    coalesce(nullif(i.contact_name, ''), 'Buyer'),
    coalesce(i.contact_phone, ''),
    i.contact_email,
    coalesce(i.answers, '{}'::jsonb),
    (
      select m.body
      from inquiry_messages m
      where m.inquiry_id = i.id and m.sender = 'buyer' and m.body is not null
      order by m.created_at
      limit 1
    ),
    -- The thread state, read as a sales stage. Anything still open is new.
    case i.state
      when 'accepted'   then 'won'::lead_stage
      when 'declined'   then 'lost'::lead_stage
      when 'offer_made' then 'quoted'::lead_stage
      else 'new'::lead_stage
    end,
    coalesce(nullif(i.source, ''), 'listing_form'),
    i.created_at
  from inquiries i
  left join listings l on l.id = i.listing_id;

  -- CASCADE, because a policy, an index and possibly leads.inquiry_id all point
  -- at these. Messages first: dropping the parent would take them anyway, but
  -- naming both says what is going rather than leaving it to a cascade.
  drop table if exists inquiry_messages cascade;
  drop table if exists inquiries cascade;
end $$;

-- CASCADE above removed the FOREIGN KEY and left the column sitting there full
-- of ids that no longer resolve. Dropping it is a separate statement because a
-- database that never had it must not fail on one that did.
alter table leads drop column if exists inquiry_id;

-- Only reachable once nothing is typed as them.
drop type if exists inquiry_state;
drop type if exists inquiry_type;


-- ── 21.3 Read / unread ──────────────────────────────────────────────────────
--
-- The sidebar badge used to count leads that arrived WHILE THE TAB WAS OPEN,
-- which made it a notification rather than a state: it reset on reload, it was
-- zero every morning no matter how many leads came in overnight, and clicking
-- the page emptied it whether or not anyone had actually looked at anything.
--
-- A lead is now read or unread, and the badge counts the unread ones. That
-- survives a refresh, a new browser and a night with the laptop shut, which is
-- the only version of the number that can be trusted enough to act on.
--
-- ── Read by the SHOWROOM, not by each person ────────────────────────────────
--
-- One timestamp on the lead, not a lead_reads (lead_id, user_id) join table.
--
-- This is a SHARED inbox — a queue three salespeople work between them, like a
-- support desk. Per-person read state would show all three of them "12 unread"
-- for the same twelve leads, and each would have to clear the same queue
-- separately; worse, it would hide the useful fact that a colleague has already
-- picked one up. Showroom-wide means the badge answers the question the
-- showroom actually has: how many has NOBODY here looked at.
--
-- read_by records WHO opened it first, which is the part a manager wants when
-- a lead was read and never called.
--
-- Nullable, and null means unread — so every lead that already exists starts
-- unread, which is the truthful answer for rows that predate this column.

alter table leads add column if not exists read_at timestamptz;
alter table leads add column if not exists read_by text;

-- The badge query is `count(*) where vendor_id = ? and read_at is null`, run on
-- every dashboard page load and again after every live event. A partial index
-- holds only the unread rows — which is a handful per showroom — so it stays
-- small however many thousand worked leads pile up behind it.
create index if not exists leads_unread_idx on leads (vendor_id)
  where read_at is null;


-- ── 21.3.1 A seller's delete is RECOVERABLE ────────────────────────────────
--
-- Placed here, before §21.4, because the partial indexes below have to know
-- about these columns. Sub-numbered rather than appended at the end for that
-- reason alone.
--
-- ── What went wrong with a hard delete ─────────────────────────────────────
--
-- Deleting a lead was `delete from leads`, on the argument that spam exists and
-- nothing downstream reports on leads. Both halves are still true and the
-- conclusion was wrong: the delete button sits in a table row, one line away
-- from Open, and a mis-tap destroyed a customer — their name, their number,
-- every answer they gave — with no way back and no record that it happened.
-- "Ring the person again" is not a recovery procedure when their number was the
-- thing that was deleted.
--
-- So the row is marked instead of removed. It leaves every seller view at once,
-- exactly as before, and it can be put back.
--
-- ── Why not a `leads_trash` table ──────────────────────────────────────────
--
-- Moving the row somewhere else means the restore has to move it back, and the
-- restore is the path that must never fail — it runs when somebody has already
-- made one mistake. A column changes nothing about the row's identity, its
-- foreign keys or its indexes, so restoring is one UPDATE that cannot half
-- happen.
--
-- ── deleted_by, not just deleted_at ────────────────────────────────────────
--
-- A showroom is several people sharing one pipeline (§21.3). "Who deleted the
-- lead I was working" is the first question asked, and without this column the
-- answer is nobody knows.

alter table leads add column if not exists deleted_at timestamptz;
alter table leads add column if not exists deleted_by text;

-- The trash view: one showroom's deleted leads, newest first. Partial, so it
-- holds only the handful in the bin rather than every lead ever received.
create index if not exists leads_deleted_idx on leads (vendor_id, deleted_at desc)
  where deleted_at is not null;

-- ── Every partial index has to learn about it ──────────────────────────────
--
-- A deleted lead must not be counted as unread and must not appear in the
-- buyer's list. Both indexes below were built before this column existed, so
-- they are rebuilt — dropped by name rather than `create if not exists`, which
-- would look at the name, find it, and keep the old definition for ever.

drop index if exists leads_unread_idx;
create index leads_unread_idx on leads (vendor_id)
  where read_at is null and deleted_at is null;

-- buyer_hidden_at is introduced further down, in §21.8. On a FRESH database
-- this file has not reached it yet and the index below would fail to plan, so
-- the column is claimed here as well. Both statements are `if not exists`, so
-- whichever runs second does nothing.
alter table leads add column if not exists buyer_hidden_at timestamptz;

drop index if exists leads_buyer_visible_idx;
create index leads_buyer_visible_idx on leads (buyer_user_id, created_at desc)
  where buyer_hidden_at is null and deleted_at is null;


-- ── 21.4 One OPEN request per buyer per car ─────────────────────────────────
--
-- A buyer who presses Send twice — or comes back tomorrow having forgotten —
-- should be told the showroom already has their request, not quietly file a
-- second one. Two identical rows in a pipeline is a salesperson ringing the
-- same person about the same car twice, which is worse for both of them than
-- the mild friction of being told.
--
-- ── Why OPEN, and not simply "ever" ─────────────────────────────────────────
--
-- §21 argues against `unique (listing_id, buyer_user_id)` and that argument
-- still holds: the same person asking about the same car six months later is a
-- second opportunity, not an edit of the first. A permanent bar would also
-- mean a buyer whose deal fell through in March can never enquire again.
--
-- So the rule is scoped to the stages where the showroom still owes them an
-- answer — new, contacted, quoted. Once the lead is won or lost the slot frees
-- and they may ask again. "You already asked" is only true while it is true.
--
-- ── The index is the backstop, not the mechanism ────────────────────────────
--
-- sendLead() looks for an open lead first and returns ALREADY_SENT, which is
-- what a buyer actually sees. The index exists for the case that check cannot
-- cover: two submissions in the same instant, where both reads happen before
-- either write. The action catches 23505 and reports the same message.
--
-- ── Existing duplicates ─────────────────────────────────────────────────────
--
-- Creating this on a database that already has duplicate open leads FAILS, and
-- failing would abort the whole schema run over a constraint that only affects
-- what happens next. So it is attempted inside a block that reports instead:
-- the warning names how many groups are in the way and the query to see them.
-- Close or lose the extras — leave the newest open — and re-run this file.

do $$
declare
  clashes int;
begin
  -- Built before §21.3.1 added deleted_at: it would keep a slot occupied by a
  -- lead sitting in the bin, so a buyer whose request a seller deleted by
  -- mistake could never send another. Dropped so it is rebuilt below.
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'leads_one_open_per_car_idx'
      and indexdef not like '%deleted_at%'
  ) then
    execute 'drop index leads_one_open_per_car_idx';
  end if;

  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'leads_one_open_per_car_idx'
  ) then
    return;
  end if;

  select count(*) into clashes from (
    select 1 from leads
    where stage in ('new', 'contacted', 'quoted') and listing_id is not null
    group by vendor_id, listing_id, buyer_user_id
    having count(*) > 1
  ) dupes;

  if clashes > 0 then
    raise warning
      'Duplicate-request guard NOT created: % buyer/car pair(s) already have more than one open lead. Move the extras to won or lost, then re-run this file. To see them: select vendor_id, listing_id, buyer_user_id, count(*) from leads where stage in (''new'',''contacted'',''quoted'') and listing_id is not null group by 1,2,3 having count(*) > 1;',
      clashes;
    return;
  end if;

  -- listing_id is in the key and can be null (a lead outlives its car). Nulls
  -- are distinct in a unique index, so leads whose listing was deleted never
  -- block one another — which is right: there is no car left to ask about.
  execute 'create unique index leads_one_open_per_car_idx
             on leads (vendor_id, listing_id, buyer_user_id)
             where stage in (''new'', ''contacted'', ''quoted'') and deleted_at is null';

  raise notice 'Duplicate-request guard created.';
end $$;

-- ── 21.5 One searchable line per lead ───────────────────────────────────────
--
-- The pipeline pages on the server now — eight rows at a time out of however
-- many thousand a showroom has accumulated — and that only works if the FILTER
-- runs on the server too. A search box that quietly searches the current page
-- is worse than no search box: it answers "not found" for a lead that exists.
--
-- Four of the five things a seller searches are plain columns. The fifth is
-- `answers`, and that is the interesting one: "find the lead that said Riyadh"
-- does not know which question Riyadh was the answer to, so it cannot be a
-- lookup on a key. It has to be a substring match across every value.
--
-- ── Why a maintained column and not a generated one ─────────────────────────
--
-- `generated always as (…) stored` would be tidier and cannot express this: a
-- generated column's expression must be immutable and may not contain a
-- subquery, and flattening a jsonb object's values needs jsonb_each_text, which
-- is a set-returning function in a subquery. A BEFORE trigger has neither
-- restriction.
--
-- Lowercased once, here, so the query is a plain `ilike '%term%'` against an
-- already-folded column rather than a `lower()` per row per keystroke.

alter table leads add column if not exists search_text text;

create or replace function leads_search_text()
returns trigger language plpgsql as $$
begin
  new.search_text := lower(concat_ws(' ',
    new.contact_name,
    new.contact_phone,
    new.contact_email,
    new.message,
    -- Both languages of the snapshotted car title: a seller types the name in
    -- whichever one they think in.
    new.listing_title ->> 'ar',
    new.listing_title ->> 'en',
    -- ── Only the ANSWERS, never the questions ──────────────────────────────
    --
    -- An entry in `answers` is {type, label, value} — the label is stored
    -- beside the value so a renamed question cannot rewrite history (§20).
    -- Flattening the whole object put every label in here too, which quietly
    -- ruins the search: a showroom that asks "Do you have a trade-in?" would
    -- match every one of its leads on the word "trade", and searching "select"
    -- would return the lot.
    --
    -- jsonb_each, not jsonb_each_text, so the shape can be examined rather
    -- than stringified. Three shapes exist and all three are real: an object
    -- for anything the form builder produced, a bare array or scalar for the
    -- older rows §21.2 migrated across.
    (
      select string_agg(flat.txt, ' ')
      from jsonb_each(coalesce(new.answers, '{}'::jsonb)) as entry,
      lateral (
        select case
          when jsonb_typeof(entry.value) = 'object' then
            case
              -- A multi-select answer: its value is itself an array.
              when jsonb_typeof(entry.value -> 'value') = 'array' then (
                select string_agg(item #>> '{}', ' ')
                from jsonb_array_elements(entry.value -> 'value') as item
              )
              else entry.value ->> 'value'
            end
          when jsonb_typeof(entry.value) = 'array' then (
            select string_agg(item #>> '{}', ' ')
            from jsonb_array_elements(entry.value) as item
          )
          -- #>> '{}' rather than ::text: it unwraps a jsonb string instead of
          -- keeping the quotes around it.
          else entry.value #>> '{}'
        end as txt
      ) as flat
    )
  ));
  return new;
end $$;

drop trigger if exists leads_search_text on leads;
create trigger leads_search_text before insert or update on leads
  for each row execute function leads_search_text();

-- ── Trigram index ──────────────────────────────────────────────────────────
--
-- `ilike '%term%'` is unanchored, so a btree cannot help it — only a trigram
-- index can. pg_trgm ships with Supabase; on a database where it cannot be
-- installed the search still works and simply scans, which for a showroom's
-- own leads is a small table. Not worth failing a schema run over.

do $$
begin
  create extension if not exists pg_trgm;
  execute 'create index if not exists leads_search_idx on leads using gin (search_text gin_trgm_ops)';
exception when others then
  raise notice 'Lead search index not created (%). Search still works, unindexed.', sqlerrm;
end $$;

-- ── Backfilling, and repairing ─────────────────────────────────────────────
--
-- `set search_text = null` looks like it clears the column — it is the BEFORE
-- trigger above that fills it in, and writing null is simply the cheapest way
-- to push a row through it.
--
-- Two groups, and both conditions are self-limiting so a re-run of this file
-- rewrites nothing:
--
--   · never indexed          — search_text is null
--   · indexed by the FIRST version of the trigger, which flattened the whole
--     answer object. Its fingerprint is a literal `"label":` in the text, which
--     the corrected version can no longer produce. After this runs, no row
--     matches, so the repair happens exactly once.
--
-- One side effect, stated rather than hidden: the updated_at trigger fires on
-- these rows too, so they get a fresh updated_at. Nothing sorts, filters or
-- reports on leads.updated_at — the pipeline is ordered by created_at
-- throughout — so this costs nothing, but it is worth knowing in advance.

update leads set search_text = null
where search_text is null or search_text like '%"label":%';


-- ── 21.6 The buyer can withdraw ─────────────────────────────────────────────
--
-- A buyer who has changed their mind, bought elsewhere, or pressed Send on the
-- wrong car has no way to say so. What happens instead is that they stop
-- answering their phone, and a salesperson spends three days chasing a deal
-- that ended a week ago. Letting them cancel costs the showroom nothing and
-- saves it exactly that.
--
-- ── A stage, not a flag ─────────────────────────────────────────────────────
--
-- `cancelled` joins won and lost as a terminal stage rather than becoming a
-- `cancelled boolean` beside them. Two reasons:
--
--   · every stage filter, count and tab already understands stages, and a
--     parallel boolean would have to be threaded through all of them;
--   · it frees the one-open-request slot (§21.4) automatically, because that
--     index only covers new/contacted/quoted. A buyer who cancels by mistake
--     can ask again, which a boolean on an otherwise-open lead would forbid.
--
-- It is DISTINCT from `lost`. Lost is the seller's judgement about a deal that
-- died; cancelled is the buyer's own decision, and a showroom reviewing why it
-- is not selling needs to be able to tell those apart.
--
-- Top level, not inside a do-block: a new enum value cannot be added and then
-- USED in the same transaction, and a do-block is one. Nothing later in this
-- file refers to 'cancelled' for that reason — the value is only ever written
-- by the application.

alter type lead_stage add value if not exists 'cancelled';

-- When, and why in the buyer's own words. Both nullable: a lead that was never
-- cancelled has neither, and the reason is optional because forcing someone to
-- justify withdrawing is how you get "asdf".
alter table leads add column if not exists cancelled_at timestamptz;
alter table leads add column if not exists cancel_reason text;


-- ── 21.8 Clearing a finished request from the BUYER's list ──────────────────
--
-- A cancelled request still sits in "My requests" for ever, and a buyer with
-- six of them wants their list to be the things that are actually live.
--
-- ── Why this is not a DELETE ────────────────────────────────────────────────
--
-- The row is the SHOWROOM's record, not the buyer's copy of it. A hard delete
-- from this side would mean:
--
--   · the showroom's sales history rewritten by the other party. A seller
--     reviewing "how many people asked and how many bought" would be counting
--     whatever the buyers had not tidied away;
--   · somebody could enquire, take up a salesperson's morning, cancel, and then
--     erase the evidence that any of it happened;
--   · the cancellation itself would vanish — and knowing that a buyer withdrew
--     is exactly what stops the next call being made.
--
-- So `buyer_hidden_at` hides it from the buyer's own list and changes nothing
-- the showroom sees. It is their view of the row, not the row.
--
-- Nullable, null meaning visible, so everything that already exists stays where
-- it is.

alter table leads add column if not exists buyer_hidden_at timestamptz;

-- The buyer's list is `where buyer_user_id = ? and buyer_hidden_at is null`,
-- ordered by created_at. leads_buyer_idx already covers the first and third;
-- this partial index keeps the hidden rows out of the scan entirely.
create index if not exists leads_buyer_visible_idx
  on leads (buyer_user_id, created_at desc)
  where buyer_hidden_at is null;


-- ── 21.7 Live leads, over BROADCAST ─────────────────────────────────────────
--
-- The seller's dashboard listens on a private topic, `leads:<vendor_id>`, and
-- the MESSAGE IS SENT BY THE SERVER ACTION, not from this database.
--
-- ── Three mechanisms were tried; only the third works here ──────────────────
--
--   1. postgres_changes on `leads` (§21.1). The channel reports SUBSCRIBED and
--      delivers nothing — even to a client holding the SERVICE ROLE key, which
--      bypasses RLS entirely. A schema-wide postgres_changes subscription on
--      the same connection reports TIMED_OUT. It needs a publication, a
--      replication slot and the realtime service's WAL reader, and one of those
--      is not working on this project.
--
--   2. A trigger here calling realtime.send(). Also silent — and worse than
--      silent: a trigger on `leads` MUST swallow its own errors, because a
--      buyer's request can never be allowed to fail over a badge, so the reason
--      was invisible by construction.
--
--   3. An HTTP POST to the realtime broadcast endpoint, from the server action
--      that caused the change. Measured on this project: 202, and the message
--      arrives on a subscribed private channel. No publication, no replication
--      slot, no WAL, no realtime.send(), no partitioned realtime.messages
--      insert.
--
-- So the trigger is gone and src/marketplace/lib/realtime.js does the sending.
-- That is also the more honest place for it: an action knows WHAT happened and
-- why — a new request, a cancellation, a stage change — where a trigger only
-- sees that a row moved.
--
-- Dropped rather than left in place: a trigger that silently does nothing is
-- the thing that made this take three attempts to diagnose.

drop trigger if exists leads_notify on leads;
drop function if exists leads_notify();

-- ── Who may listen — STILL REQUIRED ────────────────────────────────────────
--
-- The sending moved out of the database; the receiving did not. The seller's
-- browser subscribes as an ordinary authenticated user, and a PRIVATE channel
-- delivers only what a policy on realtime.messages allows. Without this, the
-- subscription is refused and the dashboard hears nothing.
--
-- Private rather than public because the TOPIC is the sensitive part: the
-- payload carries no names or numbers, but knowing that `leads:<uuid>` is busy
-- tells a competitor how many requests a showroom gets.
--
-- If the seller's console shows CHANNEL_ERROR on the leads channel, this policy
-- is the first thing to check — that is the failure it produces, and it is a
-- loud one, unlike everything else in this section's history.
--
-- CASE rather than `and`, because Postgres may evaluate the two halves of an
-- AND in either order: a malformed topic would reach the ::uuid cast and raise
-- instead of returning false. The regex has to be a gate, not a companion.

do $$
begin
  execute 'drop policy if exists leads_broadcast_receive on realtime.messages';
  execute $p$
    create policy leads_broadcast_receive on realtime.messages
      for select to authenticated
      using (
        case
          when realtime.topic() ~ '^leads:[0-9a-fA-F-]{36}$'
            then owns_vendor(substring(realtime.topic() from 7)::uuid)
          else false
        end
      )
  $p$;
  raise notice 'Realtime: broadcast policy for leads created.';
exception when others then
  raise warning
    'Could not create the realtime.messages policy (%). Live leads will not be delivered. It must be created by the owner of realtime.messages.', sqlerrm;
end $$;


-- ── 21.9 Live status for the BUYER ─────────────────────────────────────────
--
-- The showroom's dashboard is not the only screen that goes stale. A buyer
-- watching their request sees "Sent — waiting for the showroom" long after
-- somebody rang them and sent a price, because nothing told the page to look
-- again. That is the exact complaint that made this page show a status at all,
-- and a status that lags is barely better than none: it teaches the buyer that
-- the page is decoration and sends them back to the phone.
--
-- Same mechanism as the seller's, one topic per PERSON: `buyer:<user_id>`.
-- Sent from the server action that moved the stage (see
-- src/marketplace/lib/realtime.js), never from a trigger — §21.7 records at
-- length why triggers do not work on this project.
--
-- ── Why a separate policy ──────────────────────────────────────────────────
--
-- leads_broadcast_receive resolves through owns_vendor(), which a buyer is not.
-- Policies on the same table are OR'd, so each one answers for its own topic
-- shape and returns false for the other's — a buyer cannot reach a showroom's
-- topic and a showroom cannot reach a buyer's.
--
-- The test is auth.uid() against the id IN the topic, so a buyer can only ever
-- listen to themselves. Nothing else needs checking: there is no membership
-- here, no shared inbox, no colleague. One person, one channel.
--
-- CASE rather than `and`, for the reason given in §21.7: an AND lets Postgres
-- reach the ::uuid cast on a malformed topic and raise instead of returning
-- false. The regex must be a gate.

do $$
begin
  execute 'drop policy if exists requests_broadcast_receive on realtime.messages';
  execute $p$
    create policy requests_broadcast_receive on realtime.messages
      for select to authenticated
      using (
        case
          when realtime.topic() ~ '^buyer:[0-9a-fA-F-]{36}$'
            then auth.uid() = substring(realtime.topic() from 7)::uuid
          else false
        end
      )
  $p$;
  raise notice 'Realtime: broadcast policy for buyer requests created.';
exception when others then
  raise warning
    'Could not create the buyer realtime.messages policy (%). A buyer''s request page will still update, on its slower fallback. It must be created by the owner of realtime.messages.', sqlerrm;
end $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 22. LEAD FORM TABS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- A showroom that asks twelve questions has a form nobody finishes. Splitting
-- it — "About you", "The car", "Finance" — turns one intimidating column into
-- three short ones, and lets a buyer see how much is left.
--
-- ── A table, not a string on the field ──────────────────────────────────────
--
-- The obvious shortcut is `vendor_form_fields.tab text` and derive the tab list
-- from the distinct values. It fails on the two things a seller does most:
--
--   renaming    every field carrying the old string has to be rewritten, and a
--               half-finished rewrite leaves two tabs where there was one
--   reordering  distinct values have no order of their own, so the tabs would
--               shuffle whenever a field moved
--
-- So a tab is a row, with its own label and its own sort order, and a field
-- points at it.
--
-- ── Nullable on purpose ─────────────────────────────────────────────────────
--
-- `tab_id` null means "not in a tab", and a form where no field has a tab
-- renders as one flat list — which is the right default and what every existing
-- form keeps doing without being migrated. Tabs are something a seller opts
-- into when their form gets long enough to need them.
--
-- ON DELETE SET NULL, so deleting a tab releases its fields into the flat list
-- rather than deleting the questions inside it. Deleting a container should
-- never delete the contents.

create table if not exists vendor_form_tabs (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors (id) on delete cascade,
  label      jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_form_tabs_vendor_idx
  on vendor_form_tabs (vendor_id, sort_order);

alter table vendor_form_fields
  add column if not exists tab_id uuid references vendor_form_tabs (id) on delete set null;

create index if not exists vendor_form_fields_tab_idx
  on vendor_form_fields (tab_id) where tab_id is not null;

drop trigger if exists vendor_form_tabs_updated_at on vendor_form_tabs;
create trigger vendor_form_tabs_updated_at before update on vendor_form_tabs
  for each row execute function set_updated_at();

alter table vendor_form_tabs enable row level security;

-- Same audience as the fields they group: the showroom writes them, and anyone
-- may read the tabs of an approved showroom, because a buyer has to be able to
-- see the form before signing in to send it.
drop policy if exists vendor_form_tabs_owner_all on vendor_form_tabs;
create policy vendor_form_tabs_owner_all on vendor_form_tabs
  for all
  using (is_vendor_member(vendor_id) or is_staff())
  with check (is_vendor_member(vendor_id) or is_staff());

drop policy if exists vendor_form_tabs_public_read on vendor_form_tabs;
create policy vendor_form_tabs_public_read on vendor_form_tabs
  for select
  using (vendor_state_of(vendor_id) = 'approved');


-- ═══════════════════════════════════════════════════════════════════════════
-- 23. PROFILE COMPLETENESS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Has this person given us the two things every transaction needs — a number
-- to ring and an address to deliver to?
--
-- ── Why this is a function and not two queries ──────────────────────────────
--
-- proxy.js asks it on EVERY marketplace request, so that a signed-in visitor
-- with an unfinished profile cannot simply navigate around the gate. Two
-- selects would be two PostgREST round trips on every page load and every
-- prefetch; this is one, and Postgres answers it from two index lookups.
--
-- ── Why SECURITY DEFINER ────────────────────────────────────────────────────
--
-- Same reason as the helpers in §17.3: it is called with the visitor's own
-- token, and running as the owner means it cannot be affected by a future
-- policy change on profiles or addresses. It reads nothing back — it returns a
-- boolean about the CALLER and about nobody else, so there is nothing here for
-- a definer function to leak.
--
-- ── Trimmed ─────────────────────────────────────────────────────────────────
--
-- A row of spaces is not an address. A required field invites exactly that, and
-- a gate somebody can pass with the spacebar is not a gate.

create or replace function profile_complete()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from profiles p
      where p.id = auth.uid()
        and coalesce(btrim(p.phone), '') <> ''
    )
    and exists (
      -- addresses.user_id is TEXT — it predates Supabase auth on this database
      -- and still holds ids from the old scheme for some rows.
      select 1 from addresses a
      where a.user_id = auth.uid()::text
        and coalesce(btrim(a.city), '') <> ''
        and coalesce(btrim(a.district), '') <> ''
        and coalesce(btrim(a.street), '') <> ''
    );
$$;

-- Signed-in visitors ask this about themselves on every request. anon may call
-- it too and always gets false, because auth.uid() is null for them — which is
-- the correct answer and not worth a second code path.
grant execute on function profile_complete() to authenticated, anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- 24. STORAGE BUCKETS
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── Why this is here and not in a script ────────────────────────────────────
--
-- It was a Node script — setup-storage.cjs — and that made "set up a new
-- database" a two-tool job: run the SQL, then find a terminal, then have the
-- service-role key in your environment, then remember the script exists. Miss
-- the last step and the marketplace looks fine until the first photo upload
-- fails with a bucket that is not there.
--
-- A bucket is a ROW. There is nothing a script can do here that SQL cannot, so
-- the file you already have to run does it, and migrating to a new database is
-- one paste again.
--
-- ── Two buckets, and the split is deliberate ────────────────────────────────
--
-- marketplace-media is PUBLIC: a car photo has to render for a logged-out
-- buyer and for Google's crawler, so there is no version of this that works
-- behind a signed URL.
--
-- marketplace-backups is NOT. A backup is a full JSON export of one showroom —
-- listings, media, leads, orders, reviews — so it carries buyer names and phone
-- numbers. In a public bucket anyone holding the URL could download a
-- showroom's entire customer list with no login. It is private and served
-- through short-lived signed URLs.
--
-- ── The limits are part of the security, not tuning ─────────────────────────
--
-- `allowed_mime_types` on the media bucket is images only, so the public
-- bucket cannot be turned into someone's file host or a way to serve a script
-- from our domain. 8 MB is a phone photo rather than a RAW file. Backups are
-- json only, capped at 50 MB — the project-wide ceiling, above which the
-- storage API refuses the bucket outright rather than failing at upload time.
--
-- ── No policies needed ──────────────────────────────────────────────────────
--
-- Reads of a public bucket are allowed by the storage API on the strength of
-- the `public` flag. Every WRITE goes through the server on the service-role
-- key, which bypasses RLS entirely — so there is no policy here to get wrong,
-- and the path is the ownership boundary the writes enforce:
--
--   vendors/<vendorId>/<listingId>/<file>   listing photos
--   vendors/<vendorId>/gallery/<file>       the showroom's own library
--   vendors/<vendorId>/backups/<file>       exports (private bucket)
--
-- ── Re-runnable, and it CORRECTS ────────────────────────────────────────────
--
-- `on conflict do update` rather than `do nothing`, deliberately.
-- marketplace-media was once created with an images-only allowlist and later
-- asked to hold backups, which silently rejected every one with a 415 long
-- after the code writing them looked correct. Bringing an existing bucket back
-- in line is the whole reason to re-run this.
--
-- Tolerant of being refused: on a project where the SQL editor's role cannot
-- write to storage.buckets this reports and moves on rather than aborting a
-- schema run that has otherwise succeeded.

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values
    (
      'marketplace-media', 'marketplace-media', true,
      8 * 1024 * 1024,
      array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']
    ),
    (
      'marketplace-backups', 'marketplace-backups', false,
      50 * 1024 * 1024,
      array['application/json']
    )
  on conflict (id) do update set
    public             = excluded.public,
    file_size_limit    = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  raise notice 'Storage: marketplace-media (public, images, 8MB) and marketplace-backups (private, json, 50MB) are ready.';
exception when others then
  raise warning
    'Could not create the storage buckets (%). Create them by hand in Storage: marketplace-media (public, 8MB, image/* only) and marketplace-backups (private, 50MB, application/json). Uploads fail until they exist.', sqlerrm;
end $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 25. SELLER OFFERS
-- ════════════════════════════════════════════════════════════════════════════
--
-- A price cut on ONE car, for a stated period, with the seller's own name on
-- it — "عرض رمضان", "End of year".
--
-- ── Why this is not just `compare_at` ───────────────────────────────────
--
-- listings.compare_at already produces a struck-through "was" price and a
-- percentage badge, and it is the right tool for a permanently repriced car.
-- It cannot express an OFFER, because it has no clock: a seller who drops the
-- price for Ramadan has to remember to put it back, and the one who forgets is
-- selling at the discount in June. Every real offer needs a start, an end, and
-- an automatic return to the ordinary price.
--
-- ── THE LISTING PRICE IS NEVER TOUCHED ────────────────────────────────
--
-- The obvious implementation is to write the discounted number into
-- listings.price when the offer starts and write it back when it ends. That
-- needs a scheduler, and it fails in the way that costs money: if the job that
-- restores the price does not run — a deploy, an outage, a bug — the car stays
-- discounted for ever and nobody notices, because the listing looks normal.
--
-- So an offer is a ROW that is read alongside the listing, and the price a
-- buyer sees is computed at read time. Nothing schedules anything. An offer
-- that ends stops applying on the next page render, and one that has not
-- started yet cannot leak, because the same comparison governs both.
--
-- ── percent or amount ────────────────────────────────────────────────
--
-- Both, because sellers think in both: "10% off" on a saloon and "5,000 off"
-- on a pickup. Stored as the seller entered it rather than pre-multiplied, so
-- the badge can say what they actually promised.

do $$ begin
  create type offer_discount_type as enum ('percent', 'amount');
exception when duplicate_object then null; end $$;

create table if not exists listing_offers (
  id            uuid primary key default gen_random_uuid(),

  -- Denormalised from the listing so every policy and every seller query is
  -- one lookup. A listing cannot change hands between vendors, so these two
  -- can never disagree.
  vendor_id     uuid not null references vendors (id) on delete cascade,
  listing_id    uuid not null references listings (id) on delete cascade,

  -- The seller's name for it. Optional: an unnamed offer still shows the price
  -- and the saving, which is the part that sells.
  label         jsonb,

  discount_type offer_discount_type not null default 'percent',
  discount_value numeric(12,2) not null check (discount_value > 0),

  -- Null start means "from now", null end means "until I turn it off". Both
  -- are ordinary states, not missing data — a seller running an open-ended
  -- offer should not have to invent a date ten years out.
  starts_at     timestamptz,
  ends_at       timestamptz,

  -- The off switch, separate from the dates. A seller who wants the offer to
  -- stop NOW should not have to edit a date to a time in the past and work out
  -- what timezone it means.
  active        boolean not null default true,

  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- An offer that ends before it starts can never run, and is always a typo.
  constraint listing_offers_window_valid
    check (starts_at is null or ends_at is null or ends_at > starts_at)
);

create index if not exists listing_offers_listing_idx
  on listing_offers (listing_id) where active;
create index if not exists listing_offers_vendor_idx
  on listing_offers (vendor_id, created_at desc);

drop trigger if exists listing_offers_updated_at on listing_offers;
create trigger listing_offers_updated_at before update on listing_offers
  for each row execute function set_updated_at();

-- ── Two offers may never cover the same car at the same moment ─────────────
--
-- Without this the read layer has to pick a winner between overlapping offers,
-- and whatever it picks is a rule nobody agreed to — the buyer sees one price,
-- the seller believes another, and which one shows depends on row order.
--
-- An EXCLUSION constraint states it exactly: same listing, overlapping window,
-- both active → refused. It still allows the thing a seller legitimately wants,
-- which a plain unique index would forbid: scheduling next month's offer while
-- this month's is still running.
--
-- Needs btree_gist (for the `listing_id with =` half). It ships with Supabase;
-- where it cannot be installed this falls back to one active offer per car,
-- which is cruder and still unambiguous. Never left unprotected.

do $$
begin
  create extension if not exists btree_gist;

  if not exists (
    select 1 from pg_constraint where conname = 'listing_offers_no_overlap'
  ) then
    execute $x$
      alter table listing_offers add constraint listing_offers_no_overlap
        exclude using gist (
          listing_id with =,
          tstzrange(coalesce(starts_at, '-infinity'::timestamptz), coalesce(ends_at, 'infinity'::timestamptz)) with &&
        ) where (active)
    $x$;
  end if;

  raise notice 'Offers: overlap guard active (scheduling ahead is allowed).';
exception when others then
  raise warning
    'Offers: could not create the overlap exclusion constraint (%). Falling back to one active offer per car.', sqlerrm;

  begin
    execute 'create unique index if not exists listing_offers_one_active_idx
               on listing_offers (listing_id) where active';
  exception when others then
    raise warning 'Offers: the fallback guard could not be created either (%). Overlapping offers are NOT prevented.', sqlerrm;
  end;
end $$;

alter table listing_offers enable row level security;

-- The showroom manages its own; anybody may READ an offer on a live listing,
-- because the price a buyer is quoted has to be verifiable from the listing
-- they are looking at.
drop policy if exists listing_offers_vendor_all on listing_offers;
create policy listing_offers_vendor_all on listing_offers
  for all
  using (owns_vendor(vendor_id) or is_staff())
  with check (owns_vendor(vendor_id) or is_staff());

drop policy if exists listing_offers_public_read on listing_offers;
create policy listing_offers_public_read on listing_offers
  for select using (
    active and exists (
      select 1 from listings l where l.id = listing_id and l.state = 'live'
    )
  );

-- ── A note on SORTING ───────────────────────────────────────────────
--
-- "Price: low to high" orders by listings.price, which is the price BEFORE any
-- offer. A discounted car therefore sorts by its undiscounted price. Stated
-- here rather than discovered later: fixing it properly means materialising an
-- effective price, and that reintroduces the scheduler this design exists to
-- avoid. The browse list is small and the badge shows the real price, so the
-- order is mildly wrong and never misleading about what a car costs.

-- ── 25.1 The NAME of an offer is catalog data ────────────────────────────
--
-- `listing_offers.label` started as free text in the seller's form, and free
-- text is how the same occasion becomes four things: "عرض رمضان",
-- "رمضان", "Ramadan offer", "ramadan". Nothing groups, nothing filters, and
-- the marketplace cannot show "all Ramadan offers" because it has no idea the
-- four are one thing. This is the same failure that put models in car_brands
-- and made spec_attribute_values necessary — see §14.
--
-- So an offer name is a CATALOG ROW, picked from a list, exactly like a brand
-- or a colour. It gets the whole catalog apparatus for free: the Catalog tab
-- manages it, a template installs a ready-made set (the Saudi occasions), and
-- §18's per-seller scoping means each showroom sees the names it installed.
--
-- ── label is KEPT, as a snapshot ──────────────────────────────────────
--
-- The offer stores BOTH the id and the text that was chosen. Same reasoning as
-- leads.answers (§20): the id is for grouping, the snapshot is the historical
-- record. A staff member renaming "White Friday" next year must not rewrite
-- what a showroom advertised last year, and deleting a name must not blank the
-- offers that used it — which is why the FK is ON DELETE SET NULL and the
-- reader falls back to the snapshot.

create table if not exists offer_names (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        jsonb not null default '{}'::jsonb,
  description jsonb,
  icon_url    text,
  image_url   text,
  sequence    integer not null default 0,
  is_custom   boolean not null default false,
  approved    boolean not null default true,
  created_by_vendor_id uuid,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists offer_names_seq_idx on offer_names (sequence) where active;
create index if not exists offer_names_pending_idx
  on offer_names (created_by_vendor_id) where is_custom and not approved;

drop trigger if exists offer_names_updated_at on offer_names;
create trigger offer_names_updated_at before update on offer_names
  for each row execute function set_updated_at();

alter table offer_names enable row level security;

drop policy if exists offer_names_public_read on offer_names;
create policy offer_names_public_read on offer_names for select using (active);

-- Shared reference data, so the same rule as brands (§17.6): staff write
-- freely, and a seller may edit only what they added themselves.
drop policy if exists offer_names_staff_write on offer_names;
create policy offer_names_staff_write on offer_names
  for all using (is_staff()) with check (is_staff());

drop policy if exists offer_names_vendor_own on offer_names;
create policy offer_names_vendor_own on offer_names
  for all
  using (owns_vendor(created_by_vendor_id))
  with check (owns_vendor(created_by_vendor_id));

-- The link, added by ALTER so a database that already ran §25 gains it.
alter table listing_offers
  add column if not exists offer_name_id uuid references offer_names (id) on delete set null;

create index if not exists listing_offers_name_idx
  on listing_offers (offer_name_id) where offer_name_id is not null;

-- ── §18 has to know about the new table ───────────────────────────────
--
-- vendor_catalog_rows() decides what a seller sees on a Catalog tab. Its first
-- branch returns installed receipts for ANY table, so offer names installed
-- from the template already appear. What it does not cover is a name a seller
-- typed themselves — without this they would add one and watch it vanish from
-- the tab they added it on.
--
-- create or replace, so re-running this file updates the function in place.

create or replace function vendor_catalog_rows(target uuid, tbl text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $v$
begin
  return query
    select i.row_id
    from catalog_template_installs i
    where i.vendor_id = target and i.table_name = tbl;

  if tbl = 'car_brands' then
    return query select b.id from car_brands b where b.created_by_vendor_id = target;
    return query select distinct l.brand_id from listings l
      where l.vendor_id = target and l.brand_id is not null;
  elsif tbl = 'car_models' then
    return query select m.id from car_models m where m.created_by_vendor_id = target;
    return query select distinct l.model_id from listings l
      where l.vendor_id = target and l.model_id is not null;
  elsif tbl = 'car_trims' then
    return query select t.id from car_trims t where t.created_by_vendor_id = target;
    return query select distinct l.trim_id from listings l
      where l.vendor_id = target and l.trim_id is not null;
  elsif tbl = 'car_colors' then
    return query select c.id from car_colors c where c.created_by_vendor_id = target;
    return query select distinct l.color_id from listings l
      where l.vendor_id = target and l.color_id is not null;
  elsif tbl = 'offer_names' then
    return query select o.id from offer_names o where o.created_by_vendor_id = target;
    -- And any name an offer of theirs is already using, so it cannot disappear
    -- from under a running offer.
    return query select distinct lo.offer_name_id from listing_offers lo
      where lo.vendor_id = target and lo.offer_name_id is not null;
  end if;
end;
$v$;

-- ════════════════════════════════════════════════════════════════════════════
-- 26. MEDIA FOLDERS
-- ════════════════════════════════════════════════════════════════════════════
--
-- The library has three fixed tabs — Photos, Icons, Logos — and `kind` is what
-- drives them. That is a TYPE, not a place: it tells the pickers what to offer
-- (a brand-logo field opens on Logos), and it is the same three tabs for every
-- showroom on the platform.
--
-- A seller with two hundred photos needs the other axis. "Exteriors", "Interior
-- shots", "Ramadan campaign", "Showroom" — their own shelves, named in their own
-- words, holding whatever they decide belongs together. So folders sit BESIDE
-- kind rather than replacing it: a file has one type and, optionally, one place.
--
-- ── A table, not a tag ──────────────────────────────────────────────────────
--
-- media_assets.tags already exists and could carry a folder name. It fails the
-- two things a seller does most, for the same reasons §22 gives about form tabs:
--
--   renaming    every asset carrying the old string has to be rewritten, and a
--               half-finished rewrite leaves two folders where there was one
--   reordering  distinct strings have no order of their own
--
-- tags also means something else already — it is how shared template artwork
-- records which template it came from (see getVendorMedia) — and overloading it
-- would make "which template" and "which folder" the same field.
--
-- ── The name is plain text ──────────────────────────────────────────────────
--
-- Not the {ar, en} jsonb every buyer-facing label in this schema uses, and
-- deliberately: nobody but the showroom ever sees a folder name. Asking a seller
-- to name their own shelf twice, in two languages, to organise their own files
-- is ceremony with no reader.
--
-- ── ON DELETE SET NULL ──────────────────────────────────────────────────────
--
-- Deleting a folder must never delete the pictures in it. Same rule as §22:
-- deleting a container releases its contents, it does not destroy them. The
-- files return to "no folder" and are still in the library.

create table if not exists media_folders (
  id         uuid primary key default gen_random_uuid(),
  vendor_id  uuid not null references vendors (id) on delete cascade,
  name       text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One folder of a given name per showroom. Two "Exteriors" tabs side by side
  -- is a seller wondering which one their photos went into.
  unique (vendor_id, name)
);

create index if not exists media_folders_vendor_idx
  on media_folders (vendor_id, sort_order, created_at);

drop trigger if exists media_folders_updated_at on media_folders;
create trigger media_folders_updated_at before update on media_folders
  for each row execute function set_updated_at();

alter table media_assets
  add column if not exists folder_id uuid references media_folders (id) on delete set null;

-- Partial: most files are in no folder, and the query this serves is always
-- "what is in THIS folder".
create index if not exists media_assets_folder_idx
  on media_assets (folder_id) where folder_id is not null;

alter table media_folders enable row level security;

-- Seller-only, both ways. A folder name is internal organisation — there is no
-- public read policy here because no buyer-facing page reads one.
drop policy if exists media_folders_owner_all on media_folders;
create policy media_folders_owner_all on media_folders
  for all
  using (is_vendor_member(vendor_id) or is_staff())
  with check (is_vendor_member(vendor_id) or is_staff());

-- ── 26.1 The folder in the BUCKET ──────────────────────────────────────────
--
-- A seller who makes an "Exteriors" folder expects to find Exteriors in their
-- storage bucket too, not a flat `gallery/` heap that only the dashboard can
-- make sense of. So a folder carries the path segment its uploads live under.
--
-- ── Why a stored slug and not the name ─────────────────────────────────────
--
-- Names are Arabic as often as not, and a storage key is a URL path: it has to
-- be ASCII, and two folders whose names both transliterate to nothing must not
-- collide. Deriving the segment at upload time would also mean RENAMING a
-- folder silently changed where new files landed while old ones stayed put.
--
-- Stored once, at creation, and never rewritten by a rename — so the bucket
-- layout is stable and the database stays the only thing that decides which
-- folder a file is in.
--
-- Nullable: folders made before this column existed simply keep uploading to
-- `gallery/`, which is where their files already are.

alter table media_folders add column if not exists slug text;

-- Per showroom, because two showrooms have their own buckets and cannot
-- collide with each other.
create unique index if not exists media_folders_slug_idx
  on media_folders (vendor_id, slug) where slug is not null;

-- Folders made before this column existed get one now, so their next upload
-- lands in a named prefix instead of the flat gallery/. Idempotent: the filter
-- is `slug is null`, which is empty on the second run.
--
-- The name is reduced to an ASCII segment; a name with nothing ASCII in it
-- (Arabic, most usefully) falls back to `folder`, and row_number() keeps two
-- such folders from claiming the same one.
update media_folders
set slug = d.base || case when d.rn = 1 then '' else '-' || d.rn end
from (
  select
    id,
    coalesce(
      nullif(btrim(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-'), ''),
      'folder'
    ) as base,
    row_number() over (
      partition by
        vendor_id,
        coalesce(
          nullif(btrim(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '-'), ''),
          'folder'
        )
      order by created_at
    ) as rn
  from media_folders
  where slug is null
) d
where media_folders.id = d.id;

-- ════════════════════════════════════════════════════════════════════════════
-- 27. STOREFRONT SEO
-- ════════════════════════════════════════════════════════════════════════════
--
-- A showroom's own page is a landing page — it is what a buyer reaches from a
-- search for "معرض سيارات الرياض" — and until now nothing about how it appears
-- in that search was the seller's to decide. The title was the showroom name,
-- the description was the bio, and the share card was whatever the cover photo
-- happened to be, cropped by the platform to 1.91:1.
--
-- ── Columns, not a `seo jsonb` blob ─────────────────────────────────────────
--
-- Same argument §15 makes for listings, and for the same reason: a sitemap
-- builder filters on `seo_index` and cannot use an index inside a jsonb, and
-- `seo_index boolean` says what it is where `seo->>'index'` says nothing about
-- whether the value is true, "true" or "1". The two bilingual ones stay jsonb
-- because they hold {ar, en} like every other translatable string here.
--
-- ── All optional, all generated when blank ──────────────────────────────────
--
-- Nothing here is a field a seller must fill in. Blank means "work it out from
-- the showroom", which is exactly what the page did before this section
-- existed — so a showroom that never opens the SEO panel is no worse off.

alter table vendors add column if not exists meta_title       jsonb;
alter table vendors add column if not exists meta_description jsonb;

-- The share card. Separate from banner_url deliberately: a 4:1 cover cropped
-- to a 1.91:1 card loses the middle of the picture, so a seller who cares picks
-- a second image. Blank falls back to the cover, then to the logo.
alter table vendors add column if not exists og_image_url     text;

-- The off switch. A showroom mid-setup, or one that sells only to trade, has a
-- legitimate reason not to be in the index — and telling a search engine not to
-- list you is not the same as being unlisted on the marketplace itself.
alter table vendors add column if not exists seo_index        boolean not null default true;

-- Robots is TWO instructions, not one. "noindex, follow" is a real and common
-- combination — do not list this page, but do follow the links on it to the
-- cars, which should be listed.
alter table vendors add column if not exists seo_follow       boolean not null default true;

-- ── The phrases a buyer would actually type ────────────────────────────────
--
-- meta_keywords is the list; focus_keyword is the ONE phrase this page is meant
-- to win, which is what an editor checks the copy against. Both {ar, en}, and
-- the list side holds an ARRAY per language — the same shape listings use, so
-- one keyword editor serves both.
alter table vendors add column if not exists meta_keywords    jsonb;
alter table vendors add column if not exists focus_keyword    jsonb;

-- ── The share card, in full ────────────────────────────────────────────────
--
-- og_image_url above is the picture; these are the words on it. Separate from
-- meta_title and meta_description because a share card is read in a chat window
-- rather than a results page: shorter, warmer, and often a different promise.
-- Blank falls back to the meta pair, then to the showroom itself.
alter table vendors add column if not exists og_title         jsonb;
alter table vendors add column if not exists og_description   jsonb;

-- `profile` rather than the listings default of `product`: a showroom is an
-- organisation, not a thing with a price.
alter table vendors add column if not exists og_type          text not null default 'profile';

-- X reads its own tags first and only falls back to OG for what it cannot
-- find, so a seller can write a shorter line for the platform that shows less
-- of it.
alter table vendors add column if not exists twitter_card        text not null default 'summary_large_image';
alter table vendors add column if not exists twitter_title       jsonb;
alter table vendors add column if not exists twitter_description jsonb;
alter table vendors add column if not exists twitter_image_url   text;

-- ── Sitemap ────────────────────────────────────────────────────────────────
--
-- A showroom page changes when its cars do, which is oftener than a single
-- listing — so the default priority is 0.7 against a listing's 0.5. It is the
-- page a brand search should land on.
alter table vendors add column if not exists seo_priority   numeric(2,1) not null default 0.7
  check (seo_priority >= 0 and seo_priority <= 1);
alter table vendors add column if not exists seo_changefreq text not null default 'weekly';

-- ── The rest ───────────────────────────────────────────────────────────────

-- Blank points at the showroom's own URL, which is right in almost every case.
-- It exists for the showroom that also has its own website and wants that to
-- count as the original.
alter table vendors add column if not exists canonical_url  text;

-- Overrides merged over the generated schema.org node. Free jsonb because it IS
-- arbitrary JSON-LD — the one case where a blob is the honest shape.
alter table vendors add column if not exists structured_data jsonb;

-- The sitemap reads these two: only approved, indexable showrooms belong in it,
-- and priority is what it sorts on.
create index if not exists vendors_seo_index_idx on vendors (seo_index)
  where state = 'approved' and deleted_at is null;

-- The showrooms whose search metadata still needs a human.
create index if not exists vendors_seo_missing_idx on vendors (updated_at desc)
  where state = 'approved' and meta_description is null;

-- ════════════════════════════════════════════════════════════════════════════
-- 28. THE ABOUT PAGE
-- ════════════════════════════════════════════════════════════════════════════
--
-- `bio` is one paragraph, and it has two jobs it cannot both do well: it is the
-- search-result description AND the only thing a showroom can say about itself.
-- A description has to be one flat line under 160 characters; an About section
-- wants headings, a list of what they specialise in, and photographs.
--
-- So `about` is the long form and `bio` stays exactly as it is — still the
-- fallback description, still what the vendor cards print. Nothing that reads
-- bio today has to learn anything.
--
-- ── Stored as the EDITOR'S DOCUMENT, not as HTML ────────────────────────────
--
-- This is the important decision. A rich-text field means a seller can put
-- arbitrary markup on a public page, and this is a MULTI-VENDOR marketplace:
-- storing their HTML and printing it back is how one showroom runs a script in
-- a buyer's browser on a page that carries our domain and their session.
--
-- Sanitising HTML is the usual answer and it is a permanent argument with an
-- attacker — every sanitiser has a bypass list. So no HTML is stored at all.
-- The editor's document is kept as ProseMirror/TipTap JSON, and the page
-- renders it by walking the tree and emitting React elements for the node types
-- it recognises: paragraphs, headings, lists, quotes, images, links, and bold /
-- italic / underline marks. An unknown node renders as nothing.
--
-- There is no path from stored data to raw markup, so there is nothing to
-- sanitise and nothing to bypass. dangerouslySetInnerHTML never appears.
--
-- {ar, en} like every other translatable value here — each language holds its
-- own document.

alter table vendors add column if not exists about jsonb;

-- ════════════════════════════════════════════════════════════════════════════
-- 29. SOCIAL LINKS — a LIST, not eight columns of one
-- ════════════════════════════════════════════════════════════════════════════
--
-- `social` is an object with eight fixed keys: whatsapp, instagram, x,
-- snapchat, tiktok, youtube, facebook, website. Every one of them is a decision
-- the platform made on the showroom's behalf, and the shape says three things
-- that are not true:
--
--   · that a showroom has at most one of each. A group with two Instagram
--     accounts — one for cars, one for the workshop — cannot list both.
--   · that these eight are the ones that matter. A Saudi showroom links to
--     Haraj, to Maroof, to a WhatsApp GROUP, to a Telegram channel, to their
--     Google Business listing. None of those has a key, so none can be added
--     without a migration and a deploy.
--   · that the ORDER is ours. A showroom whose customers are all on WhatsApp
--     wants it first; the object has no order at all.
--
-- So a link is a ROW IN A LIST:
--
--   [{ key, label, url, icon }]
--
--   key    a known platform slug, or 'custom'. The known ones bring their
--          brand mark and their handle-to-URL rule (wa.me for a phone number,
--          instagram.com/ for a handle) — that logic is worth keeping, so the
--          list does not throw it away in the name of being general.
--   label  what to call it. Only meaningful for a custom link; a known
--          platform is called what the platform is called.
--   url    exactly what the seller typed — a handle, a bare domain or a whole
--          URL. Normalised when it is rendered, never on the way in.
--   icon   for a custom link, one of a CLOSED set of marks (see
--          src/marketplace/lib/social.js). Not a URL and not free text: a
--          seller who could point an icon at any address could put a tracking
--          pixel in every visitor's browser, and one who could type a class
--          name could break the row.
--
-- ── `social` is kept, and kept in step ──────────────────────────────────────
--
-- The old object is not dropped. Both writers mirror the known platforms back
-- into it, so anything still reading `vendor.social` keeps working, and the
-- backfill below means a showroom that never opens the new editor loses
-- nothing. social_links is the source of truth; social is the shadow.

alter table vendors add column if not exists social_links jsonb not null default '[]'::jsonb;

-- Carry the eight keys across, in the order the storefront used to print them,
-- for every showroom that has not started a list yet.
--
-- Idempotent by its filter: `social_links = '[]'` is false the moment a seller
-- saves anything, so a re-run cannot duplicate or overwrite their list. A
-- showroom with an empty `social` is skipped entirely rather than being given
-- an empty array it already has.
update vendors v
set social_links = built.links
from (
  select
    id,
    (
      select coalesce(jsonb_agg(jsonb_build_object('key', k, 'url', social ->> k) order by ord), '[]'::jsonb)
      from unnest(array['whatsapp','instagram','x','snapchat','tiktok','youtube','facebook','website'])
        with ordinality as t(k, ord)
      where coalesce(btrim(social ->> k), '') <> ''
    ) as links
  from vendors
  where social_links = '[]'::jsonb
    and social is not null
    and social <> '{}'::jsonb
) built
where v.id = built.id and built.links <> '[]'::jsonb;

-- ════════════════════════════════════════════════════════════════════════════
-- 30. PER-VENDOR CATALOG — every showroom owns its own rows
-- ════════════════════════════════════════════════════════════════════════════
--
-- §18 made the SELECTION per-seller while the ROWS stayed shared: one "Toyota"
-- that every showroom pointed at. This section ends that. A catalog row now
-- belongs to exactly one showroom, and a template is what it always should have
-- been — a starter file that gives you YOUR OWN COPIES, not a pointer into
-- somebody else's list.
--
-- ── Why the old design had to go ────────────────────────────────────────────
--
-- Sharing was defended on the grounds that browse filters by brand_id, so forty
-- copies of Toyota would split the results forty ways. That is true of the ID
-- and not of the ROW: the public site now groups by SLUG, so every showroom's
-- `toyota` lands on one brand page while the rows behind it stay private. The
-- shared key was always the slug; the shared row was never necessary to it.
--
-- What sharing did cost was real and visible:
--
--   · one showroom renaming "Toyota" renamed it for everyone
--   · a seller's Category dropdown listed their neighbours' categories, typos
--     and all — `seats`, `seatss`, `seatsss`, `setas`
--   · adding the year 2025 failed with a duplicate-key error naming a row the
--     seller could not see, because `value` was globally unique
--   · deleting had to be forbidden on anything you did not create, because it
--     would delete it out from under strangers
--
-- Every one of those is one row with several owners.
--
-- ── What this does to existing data ─────────────────────────────────────────
--
-- Nothing is deleted and no listing changes what it means. For each row two
-- showrooms both hold: the first keeps the original, the second gets a copy,
-- and that showroom's listings are repointed at the copy. Their cars keep the
-- same brand, model, trim, year and colour — by name — on rows only they own.
--
-- Idempotent, via catalog_split_map: a row already split is found there and
-- skipped, so re-running this file copies nothing twice.

-- ── 30.1 An owner column on the two tables that never had one ───────────────
--
-- This is what made a seller's own year and their own specification vanish the
-- moment they saved: the row belonged to nobody, so it was in nobody's catalog.
-- Five "seats" specs and two orphan years in this database are what that looked
-- like from the seller's side.

alter table car_years       add column if not exists created_by_vendor_id uuid;
alter table spec_attributes add column if not exists created_by_vendor_id uuid;
alter table car_years       add column if not exists approved  boolean not null default true;
alter table spec_attributes add column if not exists is_custom boolean not null default false;
alter table spec_attributes add column if not exists approved  boolean not null default true;

-- ── 30.2 The record of what was split ───────────────────────────────────────
--
-- A real table rather than a temporary one, and kept afterwards: it is what
-- makes the migration re-runnable, and the only way to answer "which row did
-- this showroom's Toyota come from" once the copies exist.

create table if not exists catalog_split_map (
  table_name text not null,
  vendor_id  uuid not null references vendors (id) on delete cascade,
  old_id     uuid not null,
  new_id     uuid not null,
  created_at timestamptz not null default now(),
  primary key (table_name, vendor_id, old_id)
);

alter table catalog_split_map enable row level security;

-- ── 30.3 Uniqueness becomes PER SHOWROOM ────────────────────────────────────
--
-- This has to happen before the split below: while `slug` is globally unique a
-- second showroom's copy of `toyota` cannot be inserted at all.
--
-- `nulls not distinct` matters. Postgres treats every NULL as distinct by
-- default, so a plain unique (slug, created_by_vendor_id) would let PLATFORM
-- rows — the ones with no owner — hold the same slug any number of times, which
-- is the duplication this whole section exists to stop. Spelling it out keeps
-- one `toyota` per showroom AND one platform-level `toyota`.
--
-- car_models and car_trims need nothing: they are already unique per parent
-- (brand_id, slug) and (model_id, slug), and their parents are per-showroom
-- after the split, so their uniqueness becomes per-showroom with them.

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('car_brands',      'slug'),
      ('car_colors',      'slug'),
      ('spec_attributes', 'slug'),
      ('offer_names',     'slug'),
      ('car_years',       'value')
    ) as x(tbl, col)
  loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t.tbl) then
      continue;
    end if;

    -- The global rule, by its Postgres-assigned name.
    execute format('alter table %I drop constraint if exists %I', t.tbl, t.tbl || '_' || t.col || '_key');

    if not exists (
      select 1 from pg_constraint where conname = t.tbl || '_' || t.col || '_vendor_key'
    ) then
      begin
        execute format(
          'alter table %I add constraint %I unique nulls not distinct (%I, created_by_vendor_id)',
          t.tbl, t.tbl || '_' || t.col || '_vendor_key', t.col
        );
      exception when others then
        -- Duplicates already present, or a Postgres older than 15 (which has no
        -- NULLS NOT DISTINCT). Say so rather than aborting a schema run: the
        -- split below still works, it is only the guard against future
        -- duplicates that is missing.
        raise warning 'Per-vendor uniqueness on %.% not created (%). Duplicates are not prevented on that table.', t.tbl, t.col, sqlerrm;
      end;
    end if;
  end loop;
end $$;

-- ── 30.4 Claim or copy, one row at a time ───────────────────────────────────
--
-- Three outcomes, and only the third costs anything:
--
--   nobody owns it       this showroom claims it. The common case, and free.
--   this showroom owns   nothing to do.
--   someone else owns    a private copy, and their listings move onto it.
--
-- Generic over the table rather than seven near-identical blocks, because the
-- column lists differ and hand-writing them is how one gets forgotten when a
-- column is added later. The list is read from information_schema, so a column
-- added to car_brands next year is copied without anyone remembering to come
-- back here.
--
-- `source_id` is deliberately NOT copied. It is unique on every one of these
-- tables — it means "the row upstream this came from", and a copy did not come
-- from upstream, it came from another row. Copying it would fail the insert;
-- leaving it null is also the truth.
--
-- `id` and `created_at` are left to their defaults: a copy is a new row made
-- now, not a forgery of the original.

create or replace function catalog_split_row(tbl text, target uuid, source_row uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  cols  text;
  owner uuid;
  hits  int;
  fresh uuid;
begin
  -- Already done on an earlier run of this file.
  select m.new_id into fresh
  from catalog_split_map m
  where m.table_name = tbl and m.vendor_id = target and m.old_id = source_row;
  if found then return fresh; end if;

  execute format('select count(*) from %I where id = $1', tbl) into hits using source_row;
  if hits = 0 then return null; end if;  -- receipt for a row since deleted

  execute format('select created_by_vendor_id from %I where id = $1', tbl)
    into owner using source_row;

  if owner is null then
    execute format('update %I set created_by_vendor_id = $1 where id = $2', tbl)
      using target, source_row;
    fresh := source_row;

  elsif owner = target then
    fresh := source_row;

  else
    select string_agg(quote_ident(column_name), ', ')
      into cols
      from information_schema.columns
     where table_schema = 'public'
       and table_name = tbl
       and column_name not in ('id', 'source_id', 'created_by_vendor_id', 'created_at');

    execute format(
      'insert into %I (%s, created_by_vendor_id) select %s, $1 from %I where id = $2 returning id',
      tbl, cols, cols, tbl
    ) into fresh using target, source_row;
  end if;

  insert into catalog_split_map (table_name, vendor_id, old_id, new_id)
  values (tbl, target, source_row, fresh)
  on conflict do nothing;

  return fresh;
end;
$$;

-- Parents first: a model copied before its brand would be repointed below at a
-- brand that did not exist yet.
do $$
declare
  tbl text;
  rec record;
begin
  foreach tbl in array array[
    'car_brands', 'car_models', 'car_trims',
    'car_years', 'car_colors', 'spec_attributes', 'offer_names', 'car_attributes'
  ] loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = tbl) then
      continue;
    end if;

    for rec in
      select distinct i.vendor_id, i.row_id
      from catalog_template_installs i
      where i.vendor_id is not null and i.table_name = tbl
    loop
      perform catalog_split_row(tbl, rec.vendor_id, rec.row_id);
    end loop;
  end loop;
end $$;

-- ── 30.5 A copy's parent must be the copier's parent ────────────────────────
--
-- catalog_split_row copies a row verbatim, so a copied model still points at
-- the ORIGINAL brand — which now belongs to someone else. Repointed here, after
-- every table has been split, so both halves of the pair are known to exist.
--
-- Only where the parent was itself copied (`new_id <> old_id`). A model whose
-- brand this showroom simply claimed is already pointing at the right row.

update car_models m
set brand_id = bm.new_id
from catalog_split_map mm
join catalog_split_map bm
  on bm.table_name = 'car_brands' and bm.vendor_id = mm.vendor_id and bm.new_id <> bm.old_id
where mm.table_name = 'car_models'
  and mm.new_id = m.id and mm.new_id <> mm.old_id
  and m.brand_id = bm.old_id;

update car_trims t
set model_id = mm.new_id
from catalog_split_map tm
join catalog_split_map mm
  on mm.table_name = 'car_models' and mm.vendor_id = tm.vendor_id and mm.new_id <> mm.old_id
where tm.table_name = 'car_trims'
  and tm.new_id = t.id and tm.new_id <> tm.old_id
  and t.model_id = mm.old_id;

-- A copied specification needs its option list copied too, or a `select` spec
-- arrives in the new catalog with nothing to select.
insert into spec_attribute_values (attribute_id, name, sequence, active)
select m.new_id, v.name, v.sequence, v.active
from catalog_split_map m
join spec_attribute_values v on v.attribute_id = m.old_id
where m.table_name = 'spec_attributes'
  and m.new_id <> m.old_id
  and not exists (
    select 1 from spec_attribute_values x where x.attribute_id = m.new_id
  );

-- ── 30.6 The listings follow their showroom's copy ──────────────────────────
--
-- A car whose brand_id still points at another showroom's Toyota would show the
-- right name and be filed in a catalog its seller cannot open. Scoped by
-- `l.vendor_id = m.vendor_id` throughout, so one showroom's cars are only ever
-- moved onto that showroom's own rows.
--
-- Only where the row was actually copied. A claimed row kept its id and every
-- listing pointing at it is already correct.

update listings l set brand_id = m.new_id
from catalog_split_map m
where m.table_name = 'car_brands' and m.vendor_id = l.vendor_id
  and l.brand_id = m.old_id and m.new_id <> m.old_id;

update listings l set model_id = m.new_id
from catalog_split_map m
where m.table_name = 'car_models' and m.vendor_id = l.vendor_id
  and l.model_id = m.old_id and m.new_id <> m.old_id;

update listings l set trim_id = m.new_id
from catalog_split_map m
where m.table_name = 'car_trims' and m.vendor_id = l.vendor_id
  and l.trim_id = m.old_id and m.new_id <> m.old_id;

update listings l set year_id = m.new_id
from catalog_split_map m
where m.table_name = 'car_years' and m.vendor_id = l.vendor_id
  and l.year_id = m.old_id and m.new_id <> m.old_id;

update listings l set color_id = m.new_id
from catalog_split_map m
where m.table_name = 'car_colors' and m.vendor_id = l.vendor_id
  and l.color_id = m.old_id and m.new_id <> m.old_id;

update listings l set interior_color_id = m.new_id
from catalog_split_map m
where m.table_name = 'car_colors' and m.vendor_id = l.vendor_id
  and l.interior_color_id = m.old_id and m.new_id <> m.old_id;

update listing_variants v set color_id = m.new_id
from listings l, catalog_split_map m
where l.id = v.listing_id
  and m.table_name = 'car_colors' and m.vendor_id = l.vendor_id
  and v.color_id = m.old_id and m.new_id <> m.old_id;

update listing_specs s set attribute_id = m.new_id
from listings l, catalog_split_map m
where l.id = s.listing_id
  and m.table_name = 'spec_attributes' and m.vendor_id = l.vendor_id
  and s.attribute_id = m.old_id and m.new_id <> m.old_id;

update listing_offers o set offer_name_id = m.new_id
from catalog_split_map m
where m.table_name = 'offer_names' and m.vendor_id = o.vendor_id
  and o.offer_name_id = m.old_id and m.new_id <> m.old_id;

-- Trim-level spec defaults, which are what make picking a trim prefill its
-- spec sheet. Copied for a copied trim, with the attribute remapped where that
-- was copied too.
insert into trim_specs (trim_id, attribute_id, value, display_value)
select tm.new_id, coalesce(sm.new_id, ts.attribute_id), ts.value, ts.display_value
from catalog_split_map tm
join trim_specs ts on ts.trim_id = tm.old_id
left join catalog_split_map sm
  on sm.table_name = 'spec_attributes' and sm.vendor_id = tm.vendor_id
 and sm.old_id = ts.attribute_id
where tm.table_name = 'car_trims' and tm.new_id <> tm.old_id
on conflict (trim_id, attribute_id) do nothing;


-- ── 30.7 What a showroom sees is simply what it OWNS ────────────────────────
--
-- The old function answered from three sources — install receipts, an owner
-- column on five of the nine tables, and listings in use — and its owner branch
-- had to be written out per table, which is exactly why car_years and
-- spec_attributes were left out and their rows became invisible.
--
-- Ownership is now the whole answer, and it is a column on every catalog table,
-- so the first branch is one dynamic statement that cannot be forgotten for a
-- table again.
--
-- The receipt branch is GONE. A receipt no longer confers membership — it
-- records which template a row came from, which is what Templates → Remove
-- needs and nothing else.
--
-- The in-use branch stays, and matters more than before: it is what stops a row
-- disappearing out from under a car that is already using it.

create or replace function vendor_catalog_rows(target uuid, tbl text)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $v$
declare
  col text;
begin
  if target is null then return; end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tbl
      and column_name = 'created_by_vendor_id'
  ) then
    return query execute
      format('select id from %I where created_by_vendor_id = $1', tbl) using target;
  end if;

  col := case tbl
    when 'car_brands' then 'brand_id'
    when 'car_models' then 'model_id'
    when 'car_trims'  then 'trim_id'
    when 'car_years'  then 'year_id'
    when 'car_colors' then 'color_id'
    else null
  end;

  if col is not null then
    return query execute format(
      'select distinct l.%I from listings l where l.vendor_id = $1 and l.%I is not null',
      col, col
    ) using target;
  end if;

  if tbl = 'car_colors' then
    return query select distinct l.interior_color_id from listings l
      where l.vendor_id = target and l.interior_color_id is not null;
  elsif tbl = 'spec_attributes' then
    return query select distinct s.attribute_id
      from listing_specs s join listings l on l.id = s.listing_id
      where l.vendor_id = target;
  elsif tbl = 'offer_names' then
    return query select distinct lo.offer_name_id from listing_offers lo
      where lo.vendor_id = target and lo.offer_name_id is not null;
  end if;
end;
$v$;

-- ── 30.8 The orphans this bug left behind ───────────────────────────────────
--
-- Rows created through the seller form while the owner column did not exist:
-- they saved, belonged to nobody, and were invisible to the person who made
-- them — who then tried again. Five specifications all called "seats", filed
-- under `seats`, `seatss`, `seatsss` and `setas`, plus the years 2019 and 2030.
--
-- NOT adopted automatically, and not deleted. There is no column that says who
-- made them — that absence is the whole bug — so any owner this file picked
-- would be a guess, and a guess here puts one showroom's rows in another's
-- catalog. They stay ownerless, which means they are in nobody's way.
--
-- To see them:
--
--   select 'spec' as kind, id::text, attribute_name ->> 'en' as name
--   from spec_attributes where created_by_vendor_id is null and source_id is null
--   union all
--   select 'year', id::text, value::text
--   from car_years where created_by_vendor_id is null and source_id is null;
--
-- To give them to a showroom, once you know whose they are:
--
--   update spec_attributes set created_by_vendor_id =
--     (select id from vendors where slug = 'their-slug')
--   where id in ( … the ids from above … );

-- ════════════════════════════════════════════════════════════════════════════
-- 31. A COLOUR CAN CARRY ITS OWN PRICE
-- ════════════════════════════════════════════════════════════════════════════
--
-- Pearl white costs more than plain white. Matte costs more than gloss. On a
-- real forecourt the colour is a price decision, and until now a listing had
-- exactly one price for every colour it offered — so a showroom either quoted
-- the cheapest and lost money on the premium colours, or quoted the dearest and
-- looked overpriced on the ordinary ones.
--
-- ── NULLABLE, and that is the whole design ──────────────────────────────────
--
-- Null means "the same as the car". Most colours cost the same, and a required
-- price per colour would make a seller retype the listing price on every one of
-- eight rows — eight chances to fat-finger a digit, and eight numbers to update
-- by hand the day the car is repriced. Null costs nothing to leave alone and
-- follows the listing for ever.
--
-- So `price` here is an OVERRIDE, not a copy. Set it only on the colours that
-- genuinely differ.
--
-- ── compare_at comes too ────────────────────────────────────────────────────
--
-- listings.compare_at is what draws the struck-through "was" price. A colour
-- with its own price and no compare_at of its own would inherit the listing's,
-- which is a different car's arithmetic: "was 200,000, now 185,000" printed
-- beside a colour that was never 200,000. Given here so the pair travels
-- together, and read together — see effectivePrice() in lib/listing.js.
--
-- ── The offer still applies on top ──────────────────────────────────────────
--
-- §25's listing_offers discounts the LISTING. A percentage off is meaningful
-- whatever the base is, so an offer applies to whichever price is in play —
-- the colour's when it has one, the listing's otherwise. Nothing about offers
-- changes here.

alter table listing_variants
  add column if not exists price numeric(12,2) check (price is null or price >= 0);

alter table listing_variants
  add column if not exists compare_at numeric(12,2) check (compare_at is null or compare_at >= 0);
