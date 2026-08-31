/**
 * Import every car brand from the main site, with its logo.
 *
 *   node src/marketplace/db/seed-brand-logos.cjs
 *
 * ── What it does ────────────────────────────────────────────────────────────
 *
 *   1. Reads the brand list from the main site's own endpoint
 *      (/api/graphql/car-brands), so names and logos are exactly what
 *      alromaihcars.com shows rather than anything retyped here.
 *   2. DOWNLOADS each logo off cdn.alromaihcars.com and uploads it into our
 *      marketplace-media bucket — the marketplace owns its images instead of
 *      hotlinking the main site's CDN, which would break the day that CDN
 *      moves or locks down its referrer.
 *   3. Registers each one in media_assets as kind='logo'. That is the half
 *      that makes it reusable: storage holds the bytes and car_brands holds a
 *      URL, but every picker in the dashboard lists media_assets. A logo that
 *      is only in storage cannot be picked for anything.
 *   4. Upserts car_brands on `slug`, setting name and logo_url.
 *
 * ── Not destructive ─────────────────────────────────────────────────────────
 *
 * Unlike seed-fronx.cjs this deletes nothing. Brands already present are
 * updated in place, so the Suzuki row the Fronx listing hangs off keeps its id
 * and the listing keeps working. Re-running is a no-op beyond refreshing
 * logos, and the storage keys are a hash of the source URL, so the same logo
 * lands on the same key every time instead of piling up copies.
 *
 * ── Requires ────────────────────────────────────────────────────────────────
 *
 * The 'logo' value on the media_kind enum. It is in schema.sql; if this script
 * reports it missing, run that one line in the SQL editor first.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ── env ─────────────────────────────────────────────────────────────────────
const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const envVar = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const db = createClient(
  envVar('MARKETPLACE_SUPABASE_URL'),
  envVar('MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

const BUCKET = 'marketplace-media';
const SOURCE = process.env.BRANDS_URL || 'http://localhost:3000/api/graphql/car-brands';

const log = (...a) => console.log(...a);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
};

const slugify = (s) => String(s).toLowerCase().trim()
  .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

const i18n = (ar, en) => {
  const out = {};
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return Object.keys(out).length ? out : null;
};

/** Download one logo, upload it to our bucket, and register it in media_assets. */
async function mirror(sourceUrl, vendorId, meta = {}) {
  if (!sourceUrl) return null;

  let res;
  try {
    res = await fetch(sourceUrl);
  } catch (err) {
    log(`    ! fetch failed — ${err.message}`);
    return null;
  }
  if (!res.ok) { log(`    ! ${res.status} ${sourceUrl.slice(-50)}`); return null; }

  const body = Buffer.from(await res.arrayBuffer());

  // A hash of the source URL: unique, stable across re-runs, and ASCII —
  // Supabase Storage keys must be, and CDN paths here are not always.
  const ext = (sourceUrl.split('?')[0].split('.').pop() || 'png').toLowerCase();
  const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex').slice(0, 12);
  const key = `vendors/${vendorId}/logos/${hash}.${ext}`;

  const { error } = await db.storage.from(BUCKET).upload(key, body, {
    contentType: MIME[ext] ?? 'application/octet-stream',
    upsert: true,
  });
  if (error) { log(`    ! upload — ${error.message}`); return null; }

  const { data } = db.storage.from(BUCKET).getPublicUrl(key);

  const { error: rowError } = await db.from('media_assets').upsert({
    vendor_id: vendorId,
    kind: 'logo',
    storage_path: key,
    url: data.publicUrl,
    filename: meta.filename ?? sourceUrl.split('/').pop(),
    mime_type: MIME[ext] ?? null,
    size_bytes: body.length,
    alt: meta.alt ?? null,
  }, { onConflict: 'storage_path' });

  if (rowError) {
    // The enum is the one thing this script cannot fix for itself — DDL needs
    // the SQL editor. Say exactly what to paste rather than 26 identical rows
    // of the same Postgres error.
    if (/invalid input value for enum media_kind/i.test(rowError.message)) {
      fail(
        "media_kind has no 'logo' value yet.\n\n" +
        '  Run this once in the Supabase SQL editor, then re-run this script:\n\n' +
        "    alter type media_kind add value if not exists 'logo';\n"
      );
    }
    log(`    ! media_assets — ${rowError.message}`);
  }

  return data.publicUrl;
}

(async () => {
  log('\n── Brand logos ──────────────────────────────────────────────\n');

  // Media belongs to a vendor. Any vendor will do — the library is shared
  // across the dashboard — so use the first one rather than inventing a row.
  const { data: vendor, error: vendorError } = await db
    .from('vendors').select('id, name').order('created_at').limit(1).maybeSingle();
  if (vendorError) fail(`vendors — ${vendorError.message}`);
  if (!vendor) fail('No vendor exists. Create one before importing media.');

  log(`  vendor : ${vendor.id}`);
  log(`  source : ${SOURCE}\n`);

  let brands;
  try {
    const res = await fetch(SOURCE);
    if (!res.ok) fail(`${SOURCE} returned ${res.status}. Is the dev server running?`);
    const json = await res.json();
    brands = Array.isArray(json) ? json : (json.brands ?? json.data ?? json.items ?? []);
  } catch (err) {
    fail(`Could not read the brand list — ${err.message}`);
  }

  if (!brands.length) fail('The brand list came back empty.');
  log(`  ${brands.length} brands\n`);

  let withLogo = 0;
  let seq = 0;

  for (const b of brands) {
    const en = b.name?.en_US ?? b.name?.en ?? b.name ?? '';
    const ar = b.name?.ar_001 ?? b.name?.ar ?? '';
    const slug = b.slug || slugify(en);
    if (!slug) { log(`  ? skipped a brand with no name or slug`); continue; }

    log(`  ${en || slug}`);

    const source = b.logoCdnUrl ?? b.logo_cdn_url ?? b.logoUrl ?? b.logo_url ?? null;
    const logoUrl = await mirror(source, vendor.id, {
      filename: `${slug}-logo.${(source?.split('?')[0].split('.').pop() || 'png').toLowerCase()}`,
      alt: i18n(ar ? `شعار ${ar}` : null, en ? `${en} logo` : null),
    });
    if (logoUrl) withLogo += 1;
    else if (source) log('    · no logo stored');

    // Upsert on slug: an existing brand keeps its id, so the listings hanging
    // off it are untouched. Only overwrite logo_url when we actually have one
    // — a failed download must not erase a logo that is already there.
    const row = {
      slug,
      name: i18n(ar, en) ?? { en: slug },
      active: b.active !== false,
      sequence: seq += 10,
    };
    if (logoUrl) row.logo_url = logoUrl;

    const { error } = await db.from('car_brands').upsert(row, { onConflict: 'slug' });
    if (error) log(`    ! car_brands — ${error.message}`);
  }

  const { count } = await db
    .from('car_brands').select('id', { count: 'exact', head: true });

  log(`\n✓ ${brands.length} brands processed · ${withLogo} logos stored · ${count} brands in the catalog\n`);
})();
