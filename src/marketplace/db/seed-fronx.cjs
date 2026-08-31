/**
 * Reset the marketplace catalog to ONE real car: Suzuki Fronx GL 2026.
 *
 *   node src/marketplace/db/seed-fronx.cjs
 *
 * ── What it does ────────────────────────────────────────────────────────────
 *
 *   1. WIPES listings, spec definitions, option lists, brands/models/trims/
 *      years/colours and every media_asset row. Vendors and categories survive
 *      — a listing needs both (category_id is NOT NULL, vendor_id is
 *      `on delete restrict`), and neither is car catalog.
 *   2. Reads the real Fronx out of the main site's own page payload, so the
 *      names, values, units, key flags and icon URLs are exactly what
 *      alromaihcars.com renders rather than anything retyped by hand.
 *   3. DOWNLOADS every icon and photo from cdn.alromaihcars.com and uploads it
 *      into our own marketplace-media bucket. The marketplace then owns its
 *      images instead of hotlinking the main site's CDN.
 *   4. Rebuilds: Suzuki → Fronx → GL → 2026, the colours, 8 spec categories,
 *      41 spec attributes, the option kinds the card's spec row needs, and one
 *      live listing wired to all of it.
 *
 * ── Destructive ─────────────────────────────────────────────────────────────
 *
 * The brands, models and trims it deletes came from the Odoo sync. Putting them
 * back means running sync-catalog.cjs against a reachable Odoo. Confirmed with
 * the operator before this file was written; it still refuses to run without
 * --yes so it cannot go off by accident or by tab-completion.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ── env ─────────────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const envVar = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const db = createClient(
  envVar('MARKETPLACE_SUPABASE_URL'),
  envVar('MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

const BUCKET = 'marketplace-media';
const SOURCE = 'http://localhost:3000/en/car/suzuki-fronx-gl-2026';

const log = (...a) => console.log(...a);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

/* ── 1. Read the car out of the main site's flight payload ─────────────────
   The page is a server component, so its data ships as escaped JSON inside the
   RSC stream. Unescaping once and slicing the balanced arrays out is fiddlier
   than JSON.parse on a tidy blob, but it is the SAME data the page renders —
   no scraping of rendered text, no guessing at values a screenshot only shows
   in one language.
   ---------------------------------------------------------------------- */

/** The balanced [...] after "key": — brackets inside strings don't count. */
function sliceArray(src, key) {
  const at = src.indexOf(`"${key}":[`);
  if (at < 0) return null;
  const start = src.indexOf('[', at);
  let depth = 0, inStr = false, esc = false;

  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

async function readCar() {
  const res = await fetch(SOURCE);
  if (!res.ok) fail(`${SOURCE} returned ${res.status}. Is the dev server running?`);

  const text = (await res.text()).replace(/\\"/g, '"');
  const pick = (re) => (text.match(re) || [])[1] ?? null;
  const arr = (key) => {
    const frag = sliceArray(text, key);
    if (!frag) return [];
    try { return JSON.parse(frag); } catch { return []; }
  };

  const car = {
    nameEn: pick(/"name":\{"en_US":"(Suzuki Fronx[^"]*)"/),
    nameAr: pick(/"name":\{"en_US":"Suzuki Fronx[^"]*","ar_001":"([^"]+)"/),
    slug: pick(/"slug":"(suzuki-fronx[^"]*)"/),
    price: Number(pick(/"cashPriceWithVat":([\d.]+)/)),
    brandEn: pick(/"brand":\{"@type":"Brand","name":"([^"]+)"/),
    brandAr: pick(/"brand":\{"@type":"Brand","name":"[^"]*","alternateName":"([^"]+)"/),
    modelEn: pick(/"model":\{"id":\d+,"name":\{"en_US":"([^"]+)"/),
    modelAr: pick(/"model":\{"id":\d+,"name":\{"en_US":"[^"]*","ar_001":"([^"]+)"/),
    trimEn: pick(/"trim":\{"id":\d+,"name":\{"en_US":"([^"]+)"/),
    trimAr: pick(/"trim":\{"id":\d+,"name":\{"en_US":"[^"]*","ar_001":"([^"]+)"/),
    year: Number(pick(/"year":\{"id":\d+,"name":\{"en_US":"(\d{4})"/)),
    specs: arr('specifications'),
    media: arr('media'),
  };

  if (!car.specs.length) fail('No specifications found in the payload.');
  if (!car.year) fail('Could not read the model year.');
  return car;
}

/* ── 2. Assets: download from the CDN, upload to our bucket ───────────────── */

const MIME = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const uploaded = new Map(); // source URL → our public URL, so shared icons upload once

/**
 * Download one asset, upload it to our bucket, and REGISTER it in media_assets.
 *
 * The registration is the half that is easy to forget and the half that makes
 * the icon reusable. Storage holds the bytes and spec_attributes holds a URL,
 * but every picker in the dashboard — the kind editor, the spec editor, the
 * listing form — lists from media_assets. An icon that is only in storage
 * renders on the car page and is invisible everywhere a human might pick it,
 * so the next kind someone adds has nothing to choose from.
 *
 * @param folder  path under vendors/<id>/ — keeps storage policies writable
 *                against the first path segments once auth lands.
 * @param kind    media_kind enum: 'icon' or 'photo'. Drives the library filter.
 */
async function mirror(sourceUrl, folder, vendorId, kind = 'photo', meta = {}) {
  if (!sourceUrl) return null;
  if (uploaded.has(sourceUrl)) return uploaded.get(sourceUrl);

  let res;
  try {
    res = await fetch(sourceUrl);
  } catch (err) {
    log(`      ! fetch failed ${err.message}`);
    return null;
  }
  if (!res.ok) { log(`      ! ${res.status} ${sourceUrl.slice(-46)}`); return null; }

  const body = Buffer.from(await res.arrayBuffer());

  // The CDN path is Arabic in places, and Supabase Storage keys must be ASCII.
  // A hash of the source URL keeps it unique, stable across re-runs, and legal.
  const ext = (sourceUrl.split('.').pop() || 'png').split('?')[0].toLowerCase();
  const hash = require('crypto').createHash('sha1').update(sourceUrl).digest('hex').slice(0, 12);
  const key = `vendors/${vendorId}/${folder}/${hash}.${ext}`;

  const { error } = await db.storage.from(BUCKET).upload(key, body, {
    contentType: MIME[ext] ?? 'application/octet-stream',
    upsert: true,
  });
  if (error) { log(`      ! upload ${error.message}`); return null; }

  const { data } = db.storage.from(BUCKET).getPublicUrl(key);

  // upsert on storage_path (its unique key) so a re-run updates rather than
  // colliding — the storage upload above is already upsert:true.
  const { error: rowError } = await db.from('media_assets').upsert({
    vendor_id: vendorId,
    kind,
    storage_path: key,
    url: data.publicUrl,
    filename: meta.filename ?? sourceUrl.split('/').pop(),
    mime_type: MIME[ext] ?? null,
    size_bytes: body.length,
    alt: meta.alt ?? null,
    tags: meta.tags ?? null,
  }, { onConflict: 'storage_path' });
  if (rowError) log(`      ! media_assets ${rowError.message}`);

  uploaded.set(sourceUrl, data.publicUrl);
  return data.publicUrl;
}

/* ── 3. Wipe ──────────────────────────────────────────────────────────────── */

async function wipe() {
  // Order matters: children before parents, because the FKs that are not
  // `on delete cascade` are `on delete restrict` and will refuse.
  const tables = [
    'listing_specs', 'listing_variants', 'leads',
    'saved_listings', 'listings',
    'trim_specs', 'spec_attribute_values', 'spec_attributes',
    'car_attributes', 'car_attribute_kinds',
    'car_trims', 'car_models', 'car_brands', 'car_years', 'car_colors',
    'media_assets',
  ];

  for (const table of tables) {
    // `car_attribute_kinds` is keyed by slug, everything else by uuid id.
    const col = table === 'car_attribute_kinds' ? 'slug' : 'id';
    const { error } = await db.from(table).delete().neq(col, col === 'slug' ? ' ' : '00000000-0000-0000-0000-000000000000');
    log(error ? `   ✗ ${table}: ${error.message}` : `   · ${table}`);
  }

  // Every object we previously uploaded for this vendor.
  const { data: files } = await db.storage.from(BUCKET).list('vendors', { limit: 1000 });
  log(`   · storage: ${files?.length ?? 0} vendor folder(s) left in place (objects are overwritten by key)`);
}

/* ── 4. Rebuild ───────────────────────────────────────────────────────────── */

const i18n = (ar, en) => ({ ...(ar ? { ar } : {}), ...(en ? { en } : {}) });
const slugify = (s) => String(s).toLowerCase().trim()
  .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

async function insert(table, row, label) {
  const { data, error } = await db.from(table).insert(row).select('id').maybeSingle();
  if (error) fail(`${table} (${label}): ${error.message}`);
  return data.id;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    fail('Refusing to run without --yes. This DELETES every listing, spec and\n' +
         '  catalog row, including the brands/models/trims from the Odoo sync.');
  }

  log('\n▸ Reading the Fronx from the main site…');
  const car = await readCar();
  log(`   ${car.nameEn} · ${car.brandEn} ${car.modelEn} ${car.trimEn} ${car.year} · SAR ${car.price}`);
  log(`   ${car.specs.length} specs, ${car.media.length} media`);

  const { data: vendor } = await db.from('vendors').select('id, slug').limit(1).maybeSingle();
  if (!vendor) fail('No vendor exists to own the listing.');

  const { data: category } = await db.from('categories')
    .select('id, slug').eq('listing_type', 'car').limit(1).maybeSingle();
  if (!category) fail('No car category exists; a listing needs category_id.');

  log(`   vendor: ${vendor.slug} · category: ${category.slug}`);

  log('\n▸ Wiping…');
  await wipe();

  log('\n▸ Catalog…');
  const brandId = await insert('car_brands', {
    slug: slugify(car.brandEn), name: i18n(car.brandAr, car.brandEn), active: true,
  }, 'brand');

  const modelId = await insert('car_models', {
    brand_id: brandId, slug: slugify(car.modelEn), name: i18n(car.modelAr, car.modelEn), active: true,
  }, 'model');

  const trimId = await insert('car_trims', {
    model_id: modelId, slug: slugify(car.trimEn), name: i18n(car.trimAr, car.trimEn), active: true,
  }, 'trim');

  const yearId = await insert('car_years', { value: car.year }, 'year');

  // Colours come off the media names ("… - Black - Exterior - …"), which is
  // where the main site gets its swatches from too.
  // ONE colour, deliberately. The brief is a single clean car in every list —
  // one brand, one model, one trim, one year, one colour — so the catalog is
  // legible while the real data is still being assembled.
  const colourNames = [...new Set(
    car.media.map((m) => (m.name || '').split(' - ')[3]).filter((c) => c && c.length < 20)
  )].slice(0, 1);
  const colourIds = {};
  for (const c of colourNames) {
    colourIds[c] = await insert('car_colors', { slug: slugify(c), name: i18n(null, c) }, `colour ${c}`);
  }
  log(`   Suzuki → Fronx → GL → ${car.year}, ${colourNames.length} colour(s): ${colourNames.join(', ')}`);

  log('\n▸ Spec definitions (downloading icons)…');
  const specRows = [];
  let seq = 0;
  const categorySeq = new Map();

  for (const s of car.specs) {
    const catEn = s.categoryName?.en_US || 'General';
    if (!categorySeq.has(catEn)) categorySeq.set(catEn, categorySeq.size);

    const icon = await mirror(s.iconUrl, 'spec-icons', vendor.id, 'icon', {
      filename: `${slugify(s.attributeName?.en_US || 'spec')}.svg`,
      tags: ['spec', slugify(catEn)],
    });
    const catIcon = await mirror(s.categoryIconUrl, 'category-icons', vendor.id, 'icon', {
      filename: `${slugify(catEn)}-category.svg`,
      tags: ['spec-category'],
    });

    specRows.push({
      slug: `${slugify(catEn)}-${slugify(s.attributeName?.en_US || 'spec')}-${seq}`,
      category_name: i18n(s.categoryName?.ar_001, catEn),
      category_icon_url: catIcon,
      category_sequence: categorySeq.get(catEn),
      attribute_name: i18n(s.attributeName?.ar_001, s.attributeName?.en_US),
      attribute_icon_url: icon,
      attribute_sequence: seq++,
      // Bilingual, not the raw upstream object. Dropping it in whole is what
      // put a literal {"en_US":"L","ar_001":"L"} in the editor's Unit field.
      unit_code: s.unitCode
        ? i18n(s.unitCode.ar_001 ?? s.unitCode.ar, s.unitCode.en_US ?? s.unitCode.en ?? s.unitCode)
        : null,
      // The REAL type from upstream — 25 yesno, 9 numeric, 6 select, 1 multi
      // on this car. Seeding everything as 'text' is what made the editor
      // render a plain box where the car page shows a tick, and left the
      // catalog and the listing form disagreeing about what a field even is.
      display_type: s.displayType || 'text',
      is_key: !!s.isKey,
      show_on_card: !!s.isKey,
      active: true,
    });
  }

  const { data: specDefs, error: specErr } = await db
    .from('spec_attributes').insert(specRows).select('id, slug');
  if (specErr) fail(`spec_attributes: ${specErr.message}`);
  // The answer for each spec, stored in the catalog as a pickable option.
  // Without these a choice-type spec has an empty dropdown and the editor can
  // only offer free text — which is how one seller types "Automatic", another
  // "automatic" and a third "أوتوماتيك" into the same field.
  const bySlug = new Map(specDefs.map((d) => [d.slug, d.id]));

  // ONLY choice types get options. Giving a numeric spec a single option turned
  // its input into a one-entry dropdown in the editor — which is exactly how
  // every field on the Specifications tab ended up an empty select.
  const CHOICE = new Set(['select', 'multi', 'yesno']);

  const valueRows = specRows
    .map((row, i) => {
      if (!CHOICE.has(row.display_type)) return null;
      const v = car.specs[i].valueName;
      const name = i18n(v?.ar_001, v?.en_US || car.specs[i].displayValue);
      if (!Object.keys(name).length) return null;
      return { attribute_id: bySlug.get(row.slug), name, sequence: 0, active: true };
    })
    .filter((r) => r && r.attribute_id);

  const { data: savedValues, error: valErr } = await db
    .from('spec_attribute_values').insert(valueRows).select('id, attribute_id');
  if (valErr) log(`   ! spec_attribute_values: ${valErr.message}`);

  // attribute_id → option id, so a choice spec stores the OPTION rather than
  // its text. That is what makes the editor's dropdown come up pre-selected.
  const optionFor = new Map((savedValues ?? []).map((r) => [r.attribute_id, r.id]));

  log(`   ${specDefs.length} attributes across ${categorySeq.size} categories`);
  log(`   ${valueRows.length} catalog value(s) for choice specs`);
  log(`   ${uploaded.size} icon(s) uploaded to ${BUCKET}`);

  log('\n▸ Option kinds (for the card spec row)…');
  const bySpec = (en) => car.specs.find((s) => s.attributeName?.en_US === en);
  const KINDS = [
    { slug: 'transmission', ar: 'ناقل الحركة', en: 'Transmission', from: 'Transmission', seq: 0 },
    { slug: 'fuel', ar: 'الوقود', en: 'Fuel Type', from: 'Fuel Type', seq: 1 },
    { slug: 'body_type', ar: 'نوع الهيكل', en: 'Body style', from: 'Body style', seq: 2 },
    { slug: 'seats', ar: 'المقاعد', en: 'Seats', from: 'Seats', seq: 3 },
    { slug: 'condition', ar: 'الحالة', en: 'Condition', from: null, seq: 4 },
  ];

  const attributes = {};
  for (const k of KINDS) {
    const src = k.from ? bySpec(k.from) : null;
    const icon = src
      ? await mirror(src.iconUrl, 'spec-icons', vendor.id, 'icon', {
          filename: `${k.slug}.svg`, tags: ['kind', k.slug],
        })
      : null;

    await db.from('car_attribute_kinds').insert({
      slug: k.slug, name: i18n(k.ar, k.en), icon_url: icon,
      show_on_card: k.slug !== 'condition', sequence: k.seq, active: true,
    });

    // `condition` is the one kind with no counterpart on the spec sheet — it
    // describes the LISTING, not the car, so its options are fixed.
    const values = k.slug === 'condition'
      ? [{ slug: 'new', ar: 'جديد', en: 'New' }, { slug: 'used', ar: 'مستعمل', en: 'Used' }]
      : [{ slug: slugify(src?.valueName?.en_US || src?.displayValue || 'value'),
           ar: src?.valueName?.ar_001, en: src?.valueName?.en_US || src?.displayValue }];

    for (const [i, v] of values.entries()) {
      await db.from('car_attributes').insert({
        kind: k.slug, slug: v.slug, name: i18n(v.ar, v.en),
        icon_url: icon, sequence: i, active: true,
      });
    }
    attributes[k.slug] = values[0].slug;
  }
  attributes.condition = 'new';
  log(`   ${KINDS.length} kinds: ${KINDS.map((k) => k.slug).join(', ')}`);

  log('\n▸ Photos (downloading)…');
  const photos = car.media
    .filter((m) => m.contentType === 'image' && m.apiCdnUrl)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));

  const media = [];
  for (const m of photos) {
    const url = await mirror(m.apiCdnUrl, 'gallery', vendor.id, 'photo', {
      filename: m.name || undefined,
      alt: i18n(m.altText?.ar_001, m.altText?.en_US),
      tags: [m.mediaType].filter(Boolean),
    });
    if (!url) continue;

    media.push({
      url,
      alt: i18n(m.altText?.ar_001, m.altText?.en_US),
      // thumbs → exterior: the marketplace has two buckets, not three.
      category: m.mediaType === 'interior' ? 'interior' : 'exterior',
      primary: m.mediaType === 'thumbs' || (media.length === 0 && !!m.isPrimary),
    });
  }
  if (media.length && !media.some((x) => x.primary)) media[0].primary = true;
  log(`   ${media.length} photo(s) uploaded`);

  log('\n▸ Listing…');
  const listingId = await insert('listings', {
    slug: car.slug,
    vendor_id: vendor.id,
    category_id: category.id,
    type: 'car',
    state: 'live',
    brand_id: brandId,
    model_id: modelId,
    year_id: yearId,
    trim_id: trimId,
    name: i18n(car.nameAr, car.nameEn),
    price: car.price,
    vat_included: true,
    city: 'Riyadh',
    media,
    attributes: { ...attributes, year: car.year, mileage_km: 0, trim: car.trimEn },
    published_at: new Date().toISOString(),
  }, 'listing');

  // The spec sheet: one row per attribute, carrying the rendered label.
  const byId = new Map(specDefs.map((d) => [d.slug, d.id]));
  const specLinks = specRows.map((row, i) => {
    const attributeId = byId.get(row.slug);
    const label = i18n(car.specs[i].valueName?.ar_001, car.specs[i].valueName?.en_US);
    const option = optionFor.get(attributeId);

    return {
      listing_id: listingId,
      attribute_id: attributeId,
      // A choice spec stores the option id in `raw` — durable, survives a
      // renamed label, and it is what the editor's dropdown binds to. Free
      // text and numbers keep just the label.
      value: option ? { raw: option, label } : { label },
      display_value: car.specs[i].displayValue || car.specs[i].valueName?.en_US || '',
      sequence: i,
    };
  }).filter((r) => r.attribute_id);

  const { error: linkErr } = await db.from('listing_specs').insert(specLinks);
  if (linkErr) fail(`listing_specs: ${linkErr.message}`);

  log(`   ${car.slug} · ${specLinks.length} specs · ${media.length} photos`);
  log(`\n✓ Done. /en/marketplace/listing/${car.slug}\n`);
}

main().catch((err) => fail(err.stack || err.message));
