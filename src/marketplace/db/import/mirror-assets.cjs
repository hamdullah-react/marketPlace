#!/usr/bin/env node
/**
 * Takes every remaining third-party asset into this platform's own storage,
 * and files the whole library into folders.
 *
 *   node src/marketplace/db/import/mirror-assets.cjs [--vendor=sauda] [--dry]
 *
 * post-cars.cjs copied the PHOTOS. It left four things pointing at the
 * dealership CDN, because they hang off the catalog rather than off a listing:
 *
 *   spec_attributes.attribute_icon_url    the mark on a spec tile
 *   spec_attributes.category_icon_url     the mark on a spec group
 *   car_brands.logo_url                   the brand mark
 *   car_colors.image_url                  a colour's swatch image, if any
 *
 * Every one of those renders on a public page, so the marketplace was serving
 * another company's server on its own car pages — and would lose the lot the
 * day those URLs move.
 *
 * ── The icons are RECOLOURED ───────────────────────────────────────────────
 *
 * They arrive with `fill="#46194F"` — the dealership's purple — baked in, and
 * SpecSheet renders them with <img>, which cannot inherit a colour from CSS.
 * So the fill is rewritten to this platform's brand colour as the file is
 * copied. Not a cosmetic nicety: a purple icon on a green tile reads as a
 * third-party widget, which is exactly what it was.
 *
 * The colour is read from site_settings.theme, so it follows the Appearance
 * screen. It is baked into the FILE, so changing the theme later means
 * re-running this — stated here rather than discovered. Doing it the other way
 * (inline <svg> with currentColor) is a change to how every spec tile renders,
 * which is a bigger thing than an import script should decide.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const args = process.argv.slice(2);
const flag = (n, d = null) => {
  const hit = args.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.slice(n.length + 3) : d;
};
const VENDOR_SLUG = flag('vendor', 'sauda');
const ENV_FILE = flag('env', 'vps') === 'local' ? '.env.local' : '.env.vps';
const DRY = args.includes('--dry');
/** Re-copy assets we already hold — for when the recolour rule changes. */
const REFRESH = args.includes('--refresh');

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

const env = loadEnv(ENV_FILE);
const URL_BASE = env.MARKETPLACE_SUPABASE_URL || process.env.MARKETPLACE_SUPABASE_URL;
const KEY = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY || process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error(`No Supabase credentials in ${ENV_FILE}.`);
  process.exit(1);
}

const enc = encodeURIComponent;

async function rest(p, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${p}`, {
    method,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
const select = (p) => rest(p);
const insert = (t, r) => rest(t, { method: 'POST', body: r, prefer: 'return=representation' });
const patch = (t, q, r) => rest(`${t}?${q}`, { method: 'PATCH', body: r, prefer: 'return=representation' });

const MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml']);

async function storage(p, { method = 'POST', body, headers = {} } = {}) {
  const res = await fetch(`${URL_BASE}/storage/v1/${p}`, {
    method, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...headers }, body,
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/**
 * Repaint an SVG in the platform's brand colour.
 *
 * Only explicit colours are touched: `fill="none"` is how an SVG says "do not
 * paint this", and rewriting it would flood every outline icon into a solid
 * blob. `currentColor` is left alone for the same reason — it is already
 * deferring to whatever renders it.
 */
function recolour(svg, brand) {
  /**
   * Only the inks that are NOT white.
   *
   * These icons are two-tone: a filled hexagon with the symbol knocked out of
   * it in white. Repainting every colour — which the first version did — made
   * the symbol the same green as the hexagon behind it, so twenty icons
   * became twenty solid green hexagons with nothing in them. White is the
   * ICON; everything else is the background it sits on.
   *
   * `{3,}` and not `{3,8}`, because several carry a malformed colour
   * (`fill="#46194F332C2B"` — two colours concatenated by whatever exported
   * them). A bounded pattern skips those entirely and leaves them purple.
   */
  const WHITE = /^#(fff|ffffff)$/i;

  return svg.replace(
    /(fill|stroke|stop-color|flood-color)(\s*[=:]\s*)"?(#[0-9a-fA-F]{3,})"?/g,
    (whole, _prop, _sep, colour) => (WHITE.test(colour) ? whole : whole.replace(colour, brand))
  );
}


async function main() {
  const [vendor] = await select(`vendors?slug=eq.${enc(VENDOR_SLUG)}&select=id,slug&limit=1`);
  if (!vendor) throw new Error(`No showroom "${VENDOR_SLUG}".`);
  const V = vendor.id;
  const bucket = `vendor-${V}`;

  const [settings] = await select('site_settings?select=theme&limit=1');
  const brand = (settings?.theme?.primary ?? '#0b6b3a').toLowerCase();

  console.log(`Target:   ${URL_BASE} (${ENV_FILE})`);
  console.log(`Showroom: ${vendor.slug}`);
  console.log(`Brand:    ${brand}${DRY ? '   — DRY RUN' : ''}\n`);

  // ── Folders ──
  /* The library's own shelves. `slug` is the storage prefix new uploads land
     under, so it is ASCII and fixed at creation (§26.1). */
  const FOLDERS = [
    { name: 'Exterior', slug: 'exterior' },
    { name: 'Interior', slug: 'interior' },
    { name: 'Icons', slug: 'icons' },
    { name: 'Brands', slug: 'brands' },
  ];

  const folderId = {};
  for (const f of FOLDERS) {
    const [found] = await select(
      `media_folders?vendor_id=eq.${V}&name=eq.${enc(f.name)}&select=id&limit=1`
    );
    if (found) { folderId[f.slug] = found.id; continue; }
    if (DRY) { folderId[f.slug] = `dry-${f.slug}`; continue; }
    const [made] = await insert('media_folders', {
      vendor_id: V, name: f.name, slug: f.slug, sort_order: FOLDERS.indexOf(f),
    });
    folderId[f.slug] = made.id;
  }
  console.log(`Folders:  ${FOLDERS.map((f) => f.name).join(', ')}`);

  // ── Copy one asset in ──
  const done = new Map();

  /**
   * `paint` decides whether the file is repainted in the brand colour.
   *
   * TRUE for catalog icons, which are single-colour marks and are meant to
   * belong to whoever renders them. FALSE for a brand LOGO: Suzuki's blue and
   * Jetour's mark are the brand, and a mask or a repaint turns them into a
   * green silhouette of themselves. The first run of this script did exactly
   * that to the Suzuki logo.
   */
  async function take(src, { folder, kind, alt, paint = false }) {
    /* Only a real remote URL. One spec row carries the literal string
       "false" where a URL belongs, which reached fetch() and came back as
       "Failed to parse URL from false" — a confusing way to be told the data
       is junk. Anything that is not http(s) is left exactly as it is. */
    if (!src || typeof src !== 'string' || !/^https?:\/\//i.test(src)) return src;
    // Already ours — nothing to do, unless the recolour rule changed, in
    // which case the file is re-fetched from our own bucket and rewritten.
    if (src.includes('/storage/v1/object/public/') && !REFRESH) return src;
    if (done.has(src)) return done.get(src);

    const hash = crypto.createHash('sha1').update(src).digest('hex').slice(0, 16);
    const name = (src.split('/').pop() ?? 'asset').split('?')[0]
      .toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-60) || 'asset.svg';
    const key = `${folder}/${hash}-${name}`;
    const publicUrl = `${URL_BASE}/storage/v1/object/public/${bucket}/${key}`;

    try {
      const [already] = await select(`media_assets?storage_path=eq.${enc(key)}&select=url&limit=1`);
      if (already && !REFRESH) { done.set(src, already.url ?? publicUrl); return done.get(src); }
      if (DRY) { done.set(src, publicUrl); return publicUrl; }

      const res = await fetch(src, { signal: AbortSignal.timeout(45_000) });
      if (!res.ok) throw new Error(`source ${res.status}`);

      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      if (!IMAGE_MIME.has(type)) throw new Error(`type ${type || 'unknown'}`);

      let bytes = Buffer.from(await res.arrayBuffer());
      if (paint && type === 'image/svg+xml') bytes = Buffer.from(recolour(bytes.toString('utf8'), brand), 'utf8');
      if (bytes.length > MAX_BYTES) throw new Error('over 8 MB');

      const up = await storage(`object/${bucket}/${key}`, {
        body: bytes, headers: { 'Content-Type': type, 'x-upsert': 'true' },
      });
      if (!up.ok) throw new Error(`upload ${up.status} ${up.text.slice(0, 120)}`);

      await insert('media_assets', {
        vendor_id: V, kind, folder_id: folderId[folder] ?? null,
        storage_path: key, url: publicUrl, filename: name,
        mime_type: type, size_bytes: bytes.length, alt: alt ?? null,
      });

      done.set(src, publicUrl);
      return publicUrl;
    } catch (err) {
      console.warn(`    kept on the source CDN — ${name} (${err.message})`);
      done.set(src, src);
      return src;
    }
  }

  // ── Spec icons ──
  const specs = await select(
    'spec_attributes?select=id,slug,attribute_name,attribute_icon_url,category_icon_url&limit=500'
  );
  let specMoved = 0;
  for (const s of specs) {
    const a = await take(s.attribute_icon_url, { folder: 'icons', kind: 'icon', alt: s.attribute_name, paint: true });
    const c = await take(s.category_icon_url, { folder: 'icons', kind: 'icon', alt: s.attribute_name, paint: true });
    if (a === s.attribute_icon_url && c === s.category_icon_url) continue;
    if (!DRY) {
      await patch('spec_attributes', `id=eq.${s.id}`, {
        attribute_icon_url: a ?? null, category_icon_url: c ?? null,
      });
    }
    specMoved += 1;
  }
  console.log(`Specs:    ${specMoved} of ${specs.length} repointed at our own storage`);

  // ── Brand logos ──
  const brands = await select(`car_brands?created_by_vendor_id=eq.${V}&select=id,slug,name,logo_url`);
  let brandMoved = 0;
  for (const b of brands) {
    const url = await take(b.logo_url, { folder: 'brands', kind: 'logo', alt: b.name });
    if (url === b.logo_url) continue;
    if (!DRY) await patch('car_brands', `id=eq.${b.id}`, { logo_url: url ?? null });
    brandMoved += 1;
  }
  console.log(`Brands:   ${brandMoved} of ${brands.length} logos copied`);

  // ── Colour swatch images ──
  const colors = await select(`car_colors?created_by_vendor_id=eq.${V}&select=id,slug,name,image_url`);
  let colourMoved = 0;
  for (const c of colors) {
    if (!c.image_url) continue;
    const url = await take(c.image_url, { folder: 'icons', kind: 'icon', alt: c.name });
    if (url === c.image_url) continue;
    if (!DRY) await patch('car_colors', `id=eq.${c.id}`, { image_url: url });
    colourMoved += 1;
  }
  console.log(`Colours:  ${colourMoved} swatch image(s) copied`);

  // ── File the car photos into Exterior / Interior ──
  /**
   * The photos are already in our bucket under listings/<id>/…; what they
   * lacked was a shelf in the library, so the media page showed 343 loose
   * files. The CATEGORY lives on listings.media, not on media_assets, so the
   * two are matched on the URL.
   *
   * The storage key is deliberately NOT rewritten. Moving 343 objects to
   * re-prefix them would break every URL already written into a listing for a
   * cosmetic change to a path nobody reads — §26.1 makes the same call for
   * folders created after their files.
   */
  const listings = await select(`listings?vendor_id=eq.${V}&select=id,media&limit=200`);
  const wanted = new Map();
  for (const l of listings) {
    for (const m of Array.isArray(l.media) ? l.media : []) {
      if (m?.url) wanted.set(m.url, m.category === 'interior' ? 'interior' : 'exterior');
    }
  }

  let filed = 0;
  if (!DRY) {
    /* Matched in memory and patched BY ID.
       Filtering by `url=in.(…)` put forty full storage URLs into a query
       string and PostgREST answered 414 URI Too Long — which is a property of
       the identifier, not of the batch size, so a smaller batch of URLs would
       only have moved the cliff. A uuid is 36 characters and fixed. */
    const assets = await select(`media_assets?vendor_id=eq.${V}&select=id,url,folder_id&limit=2000`);
    const byFolder = { exterior: [], interior: [] };

    for (const a of assets) {
      if (a.folder_id) continue;
      const cat = wanted.get(a.url);
      if (cat) byFolder[cat].push(a.id);
    }

    for (const [slug, ids] of Object.entries(byFolder)) {
      for (let i = 0; i < ids.length; i += 50) {
        const chunk = ids.slice(i, i + 50);
        const rows = await patch(
          'media_assets',
          `id=in.(${chunk.join(',')})`,
          { folder_id: folderId[slug] }
        );
        filed += rows?.length ?? 0;
      }
    }
  }
  console.log(`Photos:   ${filed} filed into Exterior / Interior`);

  // ── Anything left pointing elsewhere ──
  const left = await select('spec_attributes?select=id&attribute_icon_url=like.*alromaihcars*');
  const left2 = await select('spec_attributes?select=id&category_icon_url=like.*alromaihcars*');
  const left3 = await select('car_brands?select=id&logo_url=like.*alromaihcars*');
  const remaining = left.length + left2.length + left3.length;
  console.log(
    remaining
      ? `\nStill on the dealership CDN: ${remaining} reference(s).`
      : `\nNothing references the dealership CDN any more.`
  );
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
