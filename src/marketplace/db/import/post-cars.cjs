#!/usr/bin/env node
/**
 * Imports the scraped cars into the marketplace.
 *
 *   node src/marketplace/db/import/post-cars.cjs [--vendor=sauda] [--dry] [--state=live]
 *
 * Reads alromaih-cars.json (written by scrape-alromaih.cjs) and writes the
 * catalog, the listings and everything hanging off them. Changes no
 * application code and is never imported by the app — it is a one-off tool
 * that talks to PostgREST with the service key, exactly as seed.cjs does.
 *
 * ── Order is not arbitrary ─────────────────────────────────────────────────
 *
 * brands → models → trims, because each is a foreign key of the next and a
 * model inserted before its brand has nothing to point at. Years and colours
 * are independent. Specifications come before listings because a listing_spec
 * references spec_attributes. Listings last, then their children.
 *
 * ── Everything belongs to ONE showroom ─────────────────────────────────────
 *
 * §30 of schema.sql gives every showroom its own catalog rows, so every row
 * written here carries created_by_vendor_id. Importing without it would create
 * platform-level rows that no showroom can edit or retire — the ownerless
 * orphans §30.8 exists to describe.
 *
 * ── Re-running is safe ─────────────────────────────────────────────────────
 *
 * Catalog rows are matched on (slug, vendor) before being created, and a
 * listing is matched on its English name within the showroom. So a second run
 * adds what is missing and skips what is there, rather than producing a second
 * copy of twenty cars. --force re-imports listings that already exist.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA = path.join(__dirname, 'alromaih-cars.json');

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const VENDOR_SLUG = flag('vendor', 'sauda');
const STATE = flag('state', 'live');
const ENV_FILE = flag('env', 'vps');
const DRY = args.includes('--dry');
const FORCE = args.includes('--force');
/** --no-images leaves the source URLs alone, for a quick re-run of the rest. */
const MIRROR = !args.includes('--no-images');

/* ── Which database ───────────────────────────────────────────────────────
 *
 * ONE file, named explicitly, and `.env.vps` is the default.
 *
 * This read `.env.local` first, on the ordinary reasoning that a local file
 * beats a deployment one. That reasoning is wrong for an importer: .env.local
 * on this machine still points at the ORIGINAL hosted project, so the first
 * dry run resolved a different showroom id than the live database has and a
 * real run would have written twenty cars into the retired one — quietly, and
 * looking entirely successful.
 *
 * So there is no precedence to get wrong. `--env=local` is a deliberate
 * choice, the resolved host is printed before anything is written, and the
 * process environment is only consulted when neither file has the value.
 */
function loadEnv(file) {
  const full = path.join(__dirname, '..', '..', '..', '..', file);
  if (!fs.existsSync(full)) return {};

  const out = {};
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const eq = line.indexOf('=');
    if (eq < 1 || line.trimStart().startsWith('#')) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

const envFile = ENV_FILE === 'local' ? '.env.local' : '.env.vps';
const env = loadEnv(envFile);

const URL_BASE = env.MARKETPLACE_SUPABASE_URL || process.env.MARKETPLACE_SUPABASE_URL;
const KEY =
  env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.error(`No Supabase credentials in ${envFile} or the environment.`);
  process.exit(1);
}

// ── PostgREST ──────────────────────────────────────────────────────────────

async function rest(pathname, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    method,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const select = (p) => rest(p);
const insert = (table, row) =>
  rest(table, { method: 'POST', body: row, prefer: 'return=representation' });
const patch = (table, q, row) =>
  rest(`${table}?${q}`, { method: 'PATCH', body: row, prefer: 'return=representation' });

// ── Storage ────────────────────────────────────────────────────────────────
//
// Every photo is COPIED into this platform's own bucket rather than linked.
//
// Hotlinking the dealership CDN looks free and is a dependency: those URLs are
// theirs to move, expire or re-path, and the day they do, every imported car
// on this marketplace loses its photos at once with nothing here to fix it.
// The listing also stops being self-contained — a showroom cannot replace a
// picture it does not own, and a backup of this database restores rows that
// point at somebody else's server.
//
// Conventions are the upload route's, exactly: a bucket per showroom
// (`vendor-<uuid>`, public, 8 MB, images only) with the key
// `listings/<listingId>/…`, plus a media_assets row so the file appears in
// that showroom's library like any other upload.

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']);
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/svg+xml': 'svg' };

const vendorBucket = (id) => `vendor-${id}`;

async function storage(pathname, { method = 'POST', body, headers = {} } = {}) {
  const res = await fetch(`${URL_BASE}/storage/v1/${pathname}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...headers },
    body,
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function ensureBucket(vendorId) {
  const name = vendorBucket(vendorId);
  const res = await storage('bucket', {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      id: name,
      public: true,
      file_size_limit: MAX_BYTES,
      allowed_mime_types: [...IMAGE_MIME],
    }),
  });

  // An existing bucket comes back 409 / "already exists", which is success.
  if (!res.ok && !/already exists|duplicate|409/i.test(`${res.status} ${res.text}`)) {
    throw new Error(`bucket: ${res.status} ${res.text.slice(0, 200)}`);
  }
  return name;
}

/**
 * Copy one remote image in, and return the URL it now lives at.
 *
 * The key is derived from the SOURCE URL's hash, so re-running the import
 * recognises a picture it already copied instead of filling the bucket with
 * another twenty copies of the same car. Returns the original URL on any
 * failure: a listing with one hotlinked photo beats a listing with a hole.
 */
const mirrored = new Map();

async function mirror(bucket, vendorId, listingId, src, alt) {
  if (!MIRROR || !src) return src;
  if (mirrored.has(src)) return mirrored.get(src);

  try {
    const res = await fetch(src, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`source ${res.status}`);

    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    if (!IMAGE_MIME.has(type)) throw new Error(`type ${type || 'unknown'}`);

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error(`${(bytes.length / 1048576).toFixed(1)} MB over the 8 MB limit`);

    const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
    const name = (src.split('/').pop() ?? 'photo').split('?')[0]
      .toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60) || `photo.${EXT[type]}`;
    const key = `listings/${listingId}/${hash}-${name}`;
    const publicUrl = `${URL_BASE}/storage/v1/object/public/${bucket}/${key}`;

    /* x-upsert, because a re-run writes the same key with the same bytes and
       a 409 there would be noise rather than information. */
    const up = await storage(`object/${bucket}/${key}`, {
      body: bytes,
      headers: { 'Content-Type': type, 'x-upsert': 'true' },
    });
    if (!up.ok) throw new Error(`upload ${up.status} ${up.text.slice(0, 120)}`);

    /* The library row. storage_path is unique, so this is how the import stays
       idempotent across runs without tracking anything of its own. */
    const seen = await select(`media_assets?storage_path=eq.${enc(key)}&select=id&limit=1`);
    if (!seen.length) {
      await insert('media_assets', {
        vendor_id: vendorId,
        kind: 'photo',
        storage_path: key,
        url: publicUrl,
        filename: name,
        mime_type: type,
        size_bytes: bytes.length,
        alt: alt && Object.keys(alt).length ? alt : null,
      });
    }

    mirrored.set(src, publicUrl);
    return publicUrl;
  } catch (err) {
    console.warn(`      photo kept on the source CDN (${err.message})`);
    mirrored.set(src, src);
    return src;
  }
}

// ── Shape helpers ──────────────────────────────────────────────────────────

/** Odoo ships {en_US, ar_001}; this schema stores {ar, en}. */
function i18n(v) {
  if (!v) return {};
  if (typeof v === 'string') return { en: v, ar: v };
  const ar = v.ar_001 ?? v.ar ?? null;
  const en = v.en_US ?? v.en ?? null;
  return { ...(ar ? { ar } : {}), ...(en ? { en } : {}) };
}

const text = (v, lang = 'en') => i18n(v)[lang] ?? i18n(v).en ?? i18n(v).ar ?? '';

/**
 * Odoo ships a description as an HTML fragment. This platform stores none.
 *
 * `listings.description` is read as a plain string and printed as text, and
 * §28's rule is absolute: no HTML is stored anywhere, so there is nothing for
 * a sanitiser to miss. Imported verbatim, a buyer saw the markup itself —
 * `<div data-oe-version="1.2">The <strong>Jetour G700…` — which is both wrong
 * and exactly the content that would have to be escaped on the way out.
 *
 * So the tags are removed and the structure kept as line breaks: a <br>, a
 * closing </p> or </div> and a </li> each end a line, and a <li> becomes a
 * bullet, because a spec list flattened into one paragraph is unreadable.
 */
function plainText(html) {
  if (!html || typeof html !== 'string') return '';
  if (!/[<&]/.test(html)) return html.trim();

  return html
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n• ')
    .replace(/<\s*\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n').map((l) => l.trim()).join('\n')
    .trim();
}

/** Both languages of a description, tags stripped from each. */
function plainI18n(v) {
  const o = i18n(v);
  const out = {};
  if (o.ar) out.ar = plainText(o.ar);
  if (o.en) out.en = plainText(o.en);
  return out;
}

/**
 * ASCII slug. An Arabic-only name reduces to nothing and falls back to the
 * caller's stem — a slug is a URL segment, and transliterating Arabic into one
 * would be a guess nobody asked for (the same rule the create API follows).
 */
function slugify(value, fallback = '') {
  const s = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return s || fallback;
}

// ── Catalog ────────────────────────────────────────────────────────────────

/**
 * Find a row by its natural key, or create it. The cache keeps a run from
 * asking twice for the same brand across twenty cars.
 */
function maker(table, cache = new Map()) {
  return async function ensure(key, filter, row) {
    if (cache.has(key)) return cache.get(key);

    const found = await select(`${table}?${filter}&select=id&limit=1`);
    if (found?.length) {
      cache.set(key, found[0].id);
      return found[0].id;
    }

    /* A real-shaped uuid, because a dry run goes on to FILTER by this id —
       `brand_id=eq.dry-brand:suzuki` is rejected by Postgres as malformed uuid
       input, which made the first dry run fail on all twenty cars for a
       reason that had nothing to do with the data. */
    if (DRY) {
      const n = cache.size + 1;
      cache.set(key, `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`);
      return cache.get(key);
    }

    const made = await insert(table, row);
    const id = made[0].id;
    cache.set(key, id);
    return id;
  };
}

const enc = encodeURIComponent;

async function main() {
  if (!fs.existsSync(DATA)) {
    console.error(`No ${DATA}. Run scrape-alromaih.cjs first.`);
    process.exit(1);
  }

  const { cars, colors: sourceColors = [] } = JSON.parse(fs.readFileSync(DATA, 'utf8'));

  // Printed before anything is written, because "which database" is the one
  // mistake here that cannot be undone by running it again.
  console.log(`Target:   ${URL_BASE}   (from ${envFile})`);
  console.log(`Loaded ${cars.length} cars${DRY ? '  — DRY RUN, nothing will be written' : ''}`);

  // ── Who it all belongs to ──
  const vendors = await select(`vendors?slug=eq.${enc(VENDOR_SLUG)}&select=id,slug,city&limit=1`);
  if (!vendors.length) throw new Error(`No showroom with slug "${VENDOR_SLUG}".`);
  const vendor = vendors[0];

  const cats = await select(`categories?slug=eq.cars&select=id&limit=1`);
  if (!cats.length) throw new Error('No "cars" category — run schema.sql.');
  const categoryId = cats[0].id;

  const V = vendor.id;
  const owned = `created_by_vendor_id=eq.${V}`;

  const bucket = DRY ? vendorBucket(V) : await ensureBucket(V);
  console.log(`Showroom: ${vendor.slug} (${V})`);
  console.log(`Bucket:   ${bucket}${MIRROR ? '' : '   — --no-images, source URLs kept'}\n`);

  /**
   * The band an invented price is drawn from.
   *
   * Taken from the cars that DO carry one rather than hardcoded, so a made-up
   * figure sits among its neighbours instead of advertising itself — and so
   * this stays sensible if the file is re-scraped with different stock.
   */
  const realPrices = cars
    .map((c) => Number(c.cashPriceWithVat) || Number(c.cashPrice) || 0)
    .filter((n) => n > 0);

  const low = realPrices.length ? Math.min(...realPrices) : 60_000;
  const high = realPrices.length ? Math.max(...realPrices) : 180_000;
  // Rounded to the nearest 500, because no showroom prices a car at 147,318.
  const randomPrice = () =>
    Math.round((low + Math.random() * (high - low)) / 500) * 500;

  const ensureBrand = maker('car_brands');
  const ensureModel = maker('car_models');
  const ensureTrim = maker('car_trims');
  const ensureYear = maker('car_years');
  const ensureColor = maker('car_colors');
  const ensureSpec = maker('spec_attributes');

  const colorById = new Map(sourceColors.map((c) => [c.id, c]));

  /**
   * The option list of one choice specification, created on demand.
   *
   * Cached per attribute and read once, because the same twenty answers recur
   * across twenty cars and asking the database each time would be a thousand
   * round trips for a few dozen rows.
   */
  const valuesByAttr = new Map();

  async function ensureSpecValue(attributeId, label, shown) {
    if (!valuesByAttr.has(attributeId)) {
      const rows = await select(
        `spec_attribute_values?attribute_id=eq.${attributeId}&select=id,name&limit=500`
      );
      const map = new Map();
      for (const r of rows) {
        const key = (r.name?.en || r.name?.ar || '').trim().toLowerCase();
        if (key) map.set(key, r.id);
      }
      valuesByAttr.set(attributeId, map);
    }

    const map = valuesByAttr.get(attributeId);
    const key = shown.trim().toLowerCase();
    if (map.has(key)) return map.get(key);

    const made = await insert('spec_attribute_values', {
      attribute_id: attributeId,
      name: label,
      sequence: map.size,
      active: true,
    });
    map.set(key, made[0].id);
    return made[0].id;
  }
  const links = { colors: new Set(), years: new Set() };
  const tally = { listings: 0, skipped: 0, specs: 0, variants: 0, failed: 0, invented: 0 };

  for (const [i, car] of cars.entries()) {
    const label = `${String(i + 1).padStart(2)}/${cars.length} ${car.slug}`;

    try {
      const nameEn = text(car.name, 'en') || car.displayName || car.slug;

      // ── Already here? ──
      // Matched on the English name within this showroom: the source slug is
      // not stored anywhere on a listing, and a marketplace slug carries a
      // random public_ref so it cannot be recomputed.
      const existing = await select(
        `listings?vendor_id=eq.${V}&name->>en=eq.${enc(nameEn)}&select=id,slug&limit=1`
      );
      if (existing.length && !FORCE) {
        console.log(`  ${label} — already imported, skipped`);
        tally.skipped += 1;
        continue;
      }

      // ── Catalog ──
      const brandSlug = slugify(text(car.brand?.name, 'en') || car.brand?.slug, `brand-${car.brandId}`);
      const brandId = await ensureBrand(
        `brand:${brandSlug}`,
        `slug=eq.${enc(brandSlug)}&${owned}`,
        {
          slug: brandSlug,
          name: i18n(car.brand?.name),
          logo_url: car.brand?.logoCdnUrl ?? null,
          description: Object.keys(i18n(car.brand?.description)).length
            ? i18n(car.brand.description)
            : null,
          is_custom: true,
          approved: true,
          active: true,
          created_by_vendor_id: V,
        }
      );

      const modelSlug = slugify(text(car.model?.name, 'en') || car.model?.slug, `model-${car.modelId}`);
      const modelId = await ensureModel(
        `model:${brandSlug}/${modelSlug}`,
        `slug=eq.${enc(modelSlug)}&brand_id=eq.${brandId}`,
        {
          brand_id: brandId,
          slug: modelSlug,
          name: i18n(car.model?.name),
          is_custom: true,
          approved: true,
          active: true,
          created_by_vendor_id: V,
        }
      );

      let trimId = null;
      if (car.trim) {
        const trimSlug = slugify(text(car.trim.name, 'en') || car.trim.code, `trim-${car.trimId}`);
        trimId = await ensureTrim(
          `trim:${modelSlug}/${trimSlug}`,
          `slug=eq.${enc(trimSlug)}&model_id=eq.${modelId}`,
          {
            model_id: modelId,
            slug: trimSlug,
            name: i18n(car.trim.name),
            code: car.trim.code ?? null,
            is_custom: true,
            approved: true,
            active: true,
            created_by_vendor_id: V,
          }
        );
      }

      /* A year is a number, and car_years is unique (value, vendor). The
         source's year.name is "2027"; value is what the schema stores. */
      let yearId = null;
      const yearValue = Number(car.year?.value ?? text(car.year?.name, 'en'));
      if (Number.isFinite(yearValue) && yearValue >= 1950 && yearValue <= 2100) {
        yearId = await ensureYear(
          `year:${yearValue}`,
          `value=eq.${yearValue}&${owned}`,
          { value: yearValue, is_custom: true, created_by_vendor_id: V }
        );
      }

      // ── Colours, from the variants ──
      /**
       * `colorId` is an OBJECT, not an id.
       *
       * It arrives as {id, name:{en_US,ar_001}, code, colorPicker} — so
       * `Colour ${v.colorId}` produced the literal "Colour [object Object]"
       * that reached the catalog and both name boxes on the variant row.
       *
       * It also carries colorPicker, a real hex. The separate /car-colors
       * endpoint has none for any of its 186 rows, so reading the id's object
       * is the ONLY way these colours get a swatch rather than the grey
       * checkerboard the picker falls back to.
       */
      const variantColors = new Map();
      for (const v of car.variants ?? []) {
        const ref = v.colorId;
        if (!ref) continue;

        const refId = typeof ref === 'object' ? ref.id : ref;
        const src = (typeof ref === 'object' ? ref : null) ?? colorById.get(refId);
        if (!src) continue;

        const cname = i18n(src.name);
        const hex = typeof src.colorPicker === 'string' && /^#[0-9a-f]{6}$/i.test(src.colorPicker.trim())
          ? src.colorPicker.trim().toLowerCase()
          : null;
        const cslug = slugify(cname.en || cname.ar, `color-${refId}`);

        const colorId = await ensureColor(
          `color:${cslug}`,
          `slug=eq.${enc(cslug)}&${owned}`,
          {
            slug: cslug,
            name: cname,
            hex,
            image_url: src?.colorImageCdnUrl ?? null,
            is_custom: true,
            approved: true,
            created_by_vendor_id: V,
          }
        );
        variantColors.set(v.id, { colorId, variant: v, name: cname });
      }

      // ── Media ──
      /* exterior first, then interior — the same order the seller form sorts
         into, so an imported car opens on an outside shot like a typed one.
         The copying happens after the listing exists, because the storage key
         is listings/<id>/… and that id does not exist yet. */
      const order = { exterior: 0, thumbs: 0, interior: 1 };
      const sourceMedia = (car.media ?? [])
        .filter((m) => m.contentType === 'image' && m.apiCdnUrl)
        .sort((a, b) => (order[a.mediaType] ?? 0) - (order[b.mediaType] ?? 0));

      // ── Price ──
      /* cashPriceWithVat is what the dealership advertises, so it is the price
         a buyer sees and vat_included is true. Falling back to the ex-VAT
         figure flips the flag rather than quietly presenting one as the other. */
      const withVat = Number(car.cashPriceWithVat) || 0;
      const exVat = Number(car.cashPrice) || 0;
      const real = withVat || exVat;

      /**
       * A car the dealership lists as "price on request" gets a made-up one.
       *
       * Asked for deliberately, and worth being plain about: this number is
       * INVENTED. It is drawn from the band the other nineteen cars actually
       * sit in, so the demo reads as a price list rather than a 0 or an
       * obvious placeholder — but it is not what the showroom quotes, and
       * these rows must not be shown to a buyer as if it were.
       *
       * `available_on_request` therefore goes FALSE once a price is stamped
       * on: leaving it true would print "price on request" beside a figure,
       * which is the one combination that misleads in both directions.
       */
      const invented = !real && Boolean(car.availableOnRequest);
      const price = real || (invented ? randomPrice() : 0);
      if (!price) throw new Error('no price, and not marked available-on-request');

      const sold = Boolean(car.websiteOutOfStock);
      const stem = slugify(`${brandSlug}-${modelSlug}-${yearValue || ''}`, car.slug);

      const listingRow = {
        vendor_id: V,
        category_id: categoryId,
        type: 'car',
        state: sold ? 'sold_out' : STATE,
        brand_id: brandId,
        model_id: modelId,
        year_id: yearId,
        trim_id: trimId,
        name: i18n(car.name),
        // Tags stripped — see plainText(). The source is Odoo HTML.
        description: Object.keys(plainI18n(car.description)).length ? plainI18n(car.description) : null,

        price,
        // An invented price is quoted the way the real ones are — the band it
        // came from is VAT-inclusive, so saying otherwise would misstate it.
        vat_included: Boolean(withVat) || invented,
        vat_percentage: 15,
        available_on_request: false,

        // ── The whole SEO block the source carries ──
        meta_title: i18n(car.metaTitle),
        meta_description: i18n(car.metaDescription),
        meta_keywords: i18n(car.metaKeywords),
        og_title: i18n(car.seoOgTitle),
        og_description: i18n(car.seoOgDescription),
        // Both filled in after the copy, below — they are URLs into a bucket
        // path that contains the listing's own id.
        media: [],
        /**
         * `condition` is why the edit form said "Still needed: Mileage".
         *
         * It defaults to `used` when absent, and a used car must state its
         * mileage before it can be published — so every imported car opened
         * blocked on a field its source has no value for. These are a
         * dealership's new stock, so `new` is both the truthful answer and the
         * one that does not demand an odometer reading nobody has.
         */
        attributes: { condition: 'new' },
        city: vendor.city ?? null,
        is_featured: false,
        published_at: new Date().toISOString(),
      };

      if (DRY) {
        console.log(
          `  ${label} — would create: ${sourceMedia.length} media, ` +
          `${car.specifications?.length ?? 0} specs, ${variantColors.size} colour variant(s)` +
          `${invented ? `, INVENTED price ${price.toLocaleString()}` : ''}`
        );
        tally.listings += 1;
        continue;
      }

      // ── The listing ──
      /* Inserted with a placeholder slug, then renamed using the public_ref
         the database generated: that suffix is what lets two showrooms list
         the identical car without colliding, and it does not exist until the
         row does. Same two-step the seller form uses. */
      let listingId;
      if (existing.length) {
        listingId = existing[0].id;
        await patch('listings', `id=eq.${listingId}&vendor_id=eq.${V}`, listingRow);
      } else {
        const placeholder = `pending-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
        const made = await insert('listings', { ...listingRow, slug: placeholder });
        listingId = made[0].id;
        const slug = `${stem}-${made[0].public_ref}`;
        await patch('listings', `id=eq.${listingId}`, {
          slug,
          canonical_url: `${process.env.NEXT_PUBLIC_BASE_URL ?? ''}/ar/marketplace/listing/${slug}`,
        });
      }

      // ── The photos, into our own bucket ──
      const media = [];
      for (const [idx, m] of sourceMedia.entries()) {
        const alt = i18n(m.altText);
        const url = await mirror(bucket, V, listingId, m.apiCdnUrl, alt);
        media.push({
          url,
          // The storage key, so the library and the delete path can find the
          // object. Null when the copy failed and the URL is still the CDN's.
          path: url.includes('/storage/v1/object/public/') ? url.split(`/${bucket}/`)[1] ?? null : null,
          alt,
          category: m.mediaType === 'interior' ? 'interior' : 'exterior',
          primary: idx === 0,
          main: idx === 0,
        });
      }

      const thumb = await mirror(bucket, V, listingId, car.carThumbnailUrl, i18n(car.name));

      await patch('listings', `id=eq.${listingId}&vendor_id=eq.${V}`, {
        media,
        og_image_url: thumb ?? media[0]?.url ?? null,
      });

      // ── Specifications ──
      await rest(`listing_specs?listing_id=eq.${listingId}`, { method: 'DELETE' });

      const specRows = [];
      for (const [n, s] of (car.specifications ?? []).entries()) {
        const attrName = i18n(s.attributeName);
        const catName = i18n(s.categoryName);
        const attrEn = attrName.en || attrName.ar;
        if (!attrEn) continue;

        /* The category is part of the slug because an attribute name is only
           unique inside one: "Type" exists under Engine and under Seats, and
           one slug for both would merge two different questions. */
        const specSlug = slugify(`${catName.en || catName.ar || ''}-${attrEn}`, `spec-${s.id}`);

        const attributeId = await ensureSpec(
          `spec:${specSlug}`,
          `slug=eq.${enc(specSlug)}&${owned}`,
          {
            slug: specSlug,
            category_name: catName,
            category_icon_url: s.categoryIconUrl ?? null,
            category_sequence: s.categorySequence ?? 0,
            attribute_name: attrName,
            attribute_icon_url: s.iconUrl ?? null,
            attribute_sequence: s.attributeSequence ?? 0,
            unit_code: s.unitCode ? i18n(s.unitCode) : null,
            display_type: s.displayType ?? 'text',
            show_on_card: Boolean(s.displayInCarCard),
            is_key: Boolean(s.isKey),
            active: true,
            is_custom: true,
            approved: true,
            created_by_vendor_id: V,
          }
        );

        const valueLabel = s.valueName ? i18n(s.valueName) : i18n(s.displayValue);
        const shown = valueLabel.en || valueLabel.ar || String(s.displayValue ?? '');
        if (!shown) continue;

        /**
         * A choice spec stores the OPTION'S ID, not its text.
         *
         * The editor binds a dropdown to `value.raw` and matches it against
         * the option list, so free text there matches nothing and every
         * choice field on the Specifications tab opened blank — the value was
         * stored, and nothing could show it.
         *
         * So the answer becomes a real spec_attribute_values row, which is
         * what §14 created that table for: one "Automatic" per attribute
         * instead of "Automatic", "automatic" and "أوتوماتيك" as three
         * values nothing can group or filter on. Free-text specs keep their
         * text, because that is what their input binds to.
         */
        const choice = ['select', 'multi', 'yesno'].includes(s.displayType ?? '');
        const raw = choice
          ? await ensureSpecValue(attributeId, valueLabel, shown)
          : shown;

        specRows.push({
          listing_id: listingId,
          attribute_id: attributeId,
          value: { raw, label: valueLabel },
          display_value: shown,
          sequence: n,
        });
      }

      /* Deduplicated on attribute_id: listing_specs is unique (listing_id,
         attribute_id), and the source legitimately repeats an attribute when
         two categories share a name. The first answer wins. */
      const seen = new Set();
      const uniqueSpecs = specRows.filter((r) => {
        if (seen.has(r.attribute_id)) return false;
        seen.add(r.attribute_id);
        return true;
      });

      if (uniqueSpecs.length) {
        await insert('listing_specs', uniqueSpecs);
        tally.specs += uniqueSpecs.length;
      }

      // ── Colour variants ──
      await rest(`listing_variants?listing_id=eq.${listingId}`, { method: 'DELETE' });

      const variantRows = [];
      const usedColors = new Set();
      let seq = 0;
      for (const { colorId, variant, name } of variantColors.values()) {
        if (usedColors.has(colorId)) continue;   // unique (listing_id, color_id)
        usedColors.add(colorId);

        const own = [];
        for (const [idx, m] of (variant.mediaIds ?? [])
          .filter((x) => x.contentType === 'image' && x.apiCdnUrl)
          .entries()) {
          const alt = i18n(m.altText);
          const url = await mirror(bucket, V, listingId, m.apiCdnUrl, alt);
          own.push({
            url,
            path: url.includes('/storage/v1/object/public/') ? url.split(`/${bucket}/`)[1] ?? null : null,
            alt,
            category: m.mediaType === 'interior' ? 'interior' : 'exterior',
            primary: idx === 0,
            main: idx === 0,
          });
        }

        variantRows.push({
          listing_id: listingId,
          color_id: colorId,
          name,
          is_primary: false,
          media: own,
          sequence: seq++,
        });

        links.colors.add(`${modelId}|${colorId}`);
      }

      if (variantRows.length) {
        await insert('listing_variants', variantRows);
        tally.variants += variantRows.length;
      }

      if (yearId) links.years.add(`${modelId}|${yearId}`);

      /* ── No FAQ ────────────────────────────────────────────────────────
         The source carries none — nothing in its payload is a question — and
         the first run of this script materialised the marketplace's own five
         FALLBACKS as real rows on every car. Wrong twice over: the same five
         answers under twenty cars is boilerplate, and saving them made them
         eligible for FAQPage markup, which lib/faq.js withholds from a
         fallback on purpose.

         So nothing is written, and whatever an earlier run left is removed.
         A showroom writing its own questions still gets them. */
      await rest(`listing_faqs?listing_id=eq.${listingId}`, { method: 'DELETE' });

      tally.listings += 1;
      if (invented) tally.invented += 1;
      const ours = media.filter((m) => m.path).length;
      console.log(
        `  ${label} — ${media.length} media (${ours} copied), ${uniqueSpecs.length} specs, ` +
        `${variantRows.length} colour(s)` +
        `${sold ? ', SOLD' : ''}${invented ? `, INVENTED price ${price.toLocaleString()}` : ''}`
      );
    } catch (err) {
      tally.failed += 1;
      console.warn(`  ${label} — FAILED: ${err.message}`);
    }
  }

  // ── The model palettes ──
  /* What makes the colour and year pickers work at all: since the "WHICH
     COLOURS AND YEARS A MODEL COMES IN" section, a colour reaches a model's
     picker only through a link row. Imported cars that never wrote these would
     leave every model with an empty palette. */
  if (!DRY && (links.colors.size || links.years.size)) {
    const colorLinks = [...links.colors].map((k) => {
      const [model_id, color_id] = k.split('|');
      return { model_id, color_id };
    });
    const yearLinks = [...links.years].map((k) => {
      const [model_id, year_id] = k.split('|');
      return { model_id, year_id };
    });

    if (colorLinks.length) {
      await rest('model_colors', {
        method: 'POST',
        body: colorLinks,
        prefer: 'resolution=ignore-duplicates',
      });
    }
    if (yearLinks.length) {
      await rest('model_years', {
        method: 'POST',
        body: yearLinks,
        prefer: 'resolution=ignore-duplicates',
      });
    }
    console.log(`\nModel palettes: ${colorLinks.length} colour link(s), ${yearLinks.length} year link(s)`);
  }

  console.log(
    `\n${DRY ? 'Would import' : 'Imported'}: ${tally.listings} listing(s), ` +
    `${tally.specs} spec value(s), ${tally.variants} colour variant(s)` +
    `${tally.skipped ? `, ${tally.skipped} already present` : ''}` +
    `${tally.failed ? `, ${tally.failed} FAILED` : ''}`
  );

  if (MIRROR) {
    const copied = [...mirrored.values()].filter((u) => u.includes('/storage/v1/object/public/')).length;
    console.log(`Photos:   ${copied} of ${mirrored.size} now served from this platform's own bucket`);
  }
  if (tally.invented) {
    console.log(
      `Prices:   ${tally.invented} car(s) given an INVENTED price — the source lists them ` +
      `as "on request". Not what the showroom quotes.`
    );
  }
}

main().catch((err) => {
  console.error(`
Failed: ${err.message}`);
  process.exit(1);
});
