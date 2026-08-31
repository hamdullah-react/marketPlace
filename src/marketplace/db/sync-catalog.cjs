#!/usr/bin/env node
/**
 * Syncs the car catalog from the main site's Supabase mirror (DB1) into the
 * marketplace database (DB2).
 *
 *   node src/marketplace/db/sync-catalog.cjs
 *   node src/marketplace/db/sync-catalog.cjs --limit 40   # smaller test slice
 *   node src/marketplace/db/sync-catalog.cjs --reset      # wipe catalog first
 *
 * ONE WAY ONLY, and it copies rather than joins. The marketplace never reads
 * DB1 at request time — see docs/MARKETPLACE-STRUCTURE.md §6. This is the cron
 * that keeps the copy fresh.
 *
 * Idempotent: every table upserts on source_id, and slugs are DETERMINISTIC —
 * the same source row always produces the same slug, so re-running updates in
 * place and never drifts.
 */
const { loadEnv, supabaseRest, supabaseSelectAll } = require('./_env.cjs');

const env = loadEnv();
const MAIN_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const MAIN_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const MP_URL = env.MARKETPLACE_SUPABASE_URL;
const MP_KEY = env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;

if (!MAIN_URL || !MAIN_KEY) { console.error('Missing main-site Supabase env.'); process.exit(1); }
if (!MP_URL || !MP_KEY) { console.error('Missing MARKETPLACE_* Supabase env.'); process.exit(1); }
if (MAIN_URL === MP_URL) { console.error('Refusing to run: both URLs point at the same project.'); process.exit(1); }

const main = supabaseRest(MAIN_URL, MAIN_KEY);
const mp = supabaseRest(MP_URL, MP_KEY);
const mainAll = supabaseSelectAll(MAIN_URL, MAIN_KEY);

const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > -1 ? Number(process.argv[limitArg + 1]) : null;
const RESET = process.argv.includes('--reset');

// ── helpers ───────────────────────────────────────────────────────────────────

/** Upstream multilingual values arrive as {ar_001, en_US} — sometimes JSON-encoded. */
function pick(value, lang) {
  if (value == null) return '';
  let v = value;
  if (typeof v === 'string') {
    try { v = JSON.parse(v); } catch { return v; }
  }
  if (typeof v !== 'object') return String(v);
  return lang === 'ar' ? (v.ar_001 || v.en_US || '') : (v.en_US || v.ar_001 || '');
}

/** Marketplace shape: {"ar": …, "en": …}, dropping empties. */
function i18n(ar, en) {
  const out = {};
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return out;
}

function slugify(s) {
  if (!s) return '';
  const str = String(s);
  if (/[؀-ۿ]/.test(str)) {
    return str.trim().replace(/[^؀-ۿ0-9a-zA-Z]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  }
  return str.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

/**
 * Deterministic slug assignment, scoped to a parent.
 *
 * Two problems a running Set cannot solve:
 *   1. the constraint is unique(parent, slug) — "Territory" may legitimately
 *      exist under two different brands, but not twice under one
 *   2. a Set only knows this batch, so a second run collides with rows the
 *      first run already wrote
 *
 * So: group by parent, then by base slug. A base used once wins it outright;
 * a base used more than once gives every member `base-<source_id>`. Same input
 * always yields the same slug, which makes the upsert genuinely idempotent.
 */
function assignSlugs(rows, { parentOf, baseOf, idOf }) {
  const slugs = new Map();
  const byParent = new Map();

  for (const row of rows) {
    const key = parentOf(row) ?? '∅';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(row);
  }

  for (const group of byParent.values()) {
    const byBase = new Map();
    for (const row of group) {
      const base = baseOf(row) || 'item';
      if (!byBase.has(base)) byBase.set(base, []);
      byBase.get(base).push(row);
    }
    for (const [base, members] of byBase) {
      if (members.length === 1) slugs.set(members[0], base);
      else for (const m of members) slugs.set(m, `${base}-${idOf(m)}`);
    }
  }

  return slugs;
}

// Pages explicitly: PostgREST caps at 1000 rows and truncates silently, so a
// plain ?limit=5000 quietly loses 314 of 1314 trims and looks like success.
const fetchAll = (table, select) =>
  mainAll(`${table}?select=${select}&active=not.is.false&order=odoo_id.asc`, { max: LIMIT ?? Infinity });

const upsert = (table, rows, conflict) =>
  rows.length
    ? mp('POST', `${table}?on_conflict=${conflict}`, rows, 'resolution=merge-duplicates,return=representation')
    : Promise.resolve([]);

// ── sync ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n  ${MAIN_URL}\n       ↓\n  ${MP_URL}\n`);

  if (RESET) {
    // Child-first, so the FKs never block. Safe while no listing references the
    // catalog; once real listings exist, drop --reset and rely on the upsert.
    for (const t of ['trim_specs', 'car_trims', 'car_models', 'car_brands', 'car_years', 'car_colors', 'spec_attributes']) {
      await mp('DELETE', `${t}?id=not.is.null`);
    }
    console.log('  catalog cleared\n');
  }

  // ── brands ──
  const brandRows = await fetchAll('car_brand', 'odoo_id,name,slug,logo_cdn_url');
  const brandSlugs = assignSlugs(brandRows, {
    parentOf: () => 'all',                                  // brand slugs are globally unique
    baseOf: (b) => b.slug || slugify(pick(b.name, 'en')),
    idOf: (b) => b.odoo_id,
  });
  const brands = await upsert('car_brands', brandRows.map((b) => ({
    source_id: b.odoo_id,
    slug: brandSlugs.get(b),
    name: i18n(pick(b.name, 'ar'), pick(b.name, 'en')),
    logo_url: b.logo_cdn_url,
    active: true,
  })), 'source_id');
  console.log(`  car_brands       ${brands.length}`);

  const brandBySource = new Map(brands.map((b) => [b.source_id, b.id]));

  // ── models ──
  const modelRows = await fetchAll('car_model', 'odoo_id,name,slug,brand_id');
  const modelSlugs = assignSlugs(modelRows, {
    parentOf: (m) => m.brand_id,                            // unique(brand_id, slug)
    baseOf: (m) => m.slug || slugify(pick(m.name, 'en')),
    idOf: (m) => m.odoo_id,
  });
  const models = await upsert('car_models', modelRows
    .map((m) => {
      const brandId = brandBySource.get(m.brand_id);
      if (!brandId) return null;                            // brand inactive or missing
      return {
        source_id: m.odoo_id,
        brand_id: brandId,
        slug: modelSlugs.get(m),
        name: i18n(pick(m.name, 'ar'), pick(m.name, 'en')),
        active: true,
      };
    })
    .filter(Boolean), 'source_id');
  console.log(`  car_models       ${models.length}${models.length < modelRows.length ? `  (${modelRows.length - models.length} orphaned)` : ''}`);

  const modelBySource = new Map(models.map((m) => [m.source_id, m.id]));

  // ── years ──
  const yearRows = await fetchAll('car_year', 'odoo_id,name');
  const years = await upsert('car_years', yearRows
    .map((y) => {
      const value = parseInt(String(pick(y.name, 'en')).replace(/\D/g, ''), 10);
      return Number.isFinite(value) && value >= 1950 && value <= 2100
        ? { source_id: y.odoo_id, value }
        : null;
    })
    .filter(Boolean), 'source_id');
  console.log(`  car_years        ${years.length}`);

  // ── trims ──
  const trimRows = await fetchAll('car_trim', 'odoo_id,name,slug,code,display_name,model_id');
  const trimName = (tr) => pick(tr.name, 'en') || tr.display_name || tr.code || '';
  const trimSlugs = assignSlugs(trimRows, {
    parentOf: (tr) => tr.model_id,                          // unique(model_id, slug)
    baseOf: (tr) => tr.slug || slugify(trimName(tr)),
    idOf: (tr) => tr.odoo_id,
  });
  const trims = await upsert('car_trims', trimRows
    .map((tr) => {
      const modelId = modelBySource.get(tr.model_id);
      if (!modelId) return null;
      const en = trimName(tr);
      return {
        source_id: tr.odoo_id,
        model_id: modelId,
        slug: trimSlugs.get(tr),
        name: i18n(pick(tr.name, 'ar') || en, en),
        code: tr.code,
        active: true,
      };
    })
    .filter(Boolean), 'source_id');
  console.log(`  car_trims        ${trims.length}${trims.length < trimRows.length ? `  (${trimRows.length - trims.length} orphaned)` : ''}`);

  // ── colours ──
  const colorRows = await fetchAll('car_color', 'odoo_id,name,color_code,color_picker');
  // Same deterministic scheme as the other tables: colour names repeat across
  // brands ("White" many times over), and slug is unique.
  const colorSlugs = assignSlugs(colorRows, {
    parentOf: () => 'all',
    baseOf: (c) => slugify(pick(c.name, 'en')),
    idOf: (c) => c.odoo_id,
  });
  const colors = await upsert('car_colors', colorRows.map((c) => ({
    source_id: c.odoo_id,
    slug: colorSlugs.get(c),
    name: i18n(pick(c.name, 'ar'), pick(c.name, 'en')),
    hex: c.color_code || c.color_picker,
  })), 'source_id');
  console.log(`  car_colors       ${colors.length}`);

  // ── spec attributes ──
  // product_specification holds one row per car per attribute (8k+ rows). We
  // want the DISTINCT attributes with their icons and ordering — that is what
  // the seller form offers and the spec sheet renders.
  // attribute_value_id + display_value are here for the option-list pass
  // further down, not for the attribute definitions themselves.
  const specRows = await mainAll(
    'product_specification?select=attribute_id,api_attribute_name,api_category_name,api_unit_code,' +
      'attribute_icon_image_cdn_url,category_icon_image_cdn_url,attribute_sequence,category_sequence,' +
      'attribute_display_type,attribute_display_in_car_card,is_key,category_id,' +
      'attribute_value_id,display_value' +
      '&active=is.true&order=attribute_id.asc'
  );

  const byAttribute = new Map();
  for (const s of specRows) {
    if (s.attribute_id == null || byAttribute.has(s.attribute_id)) continue;
    byAttribute.set(s.attribute_id, s);
  }
  const specList = [...byAttribute.values()];

  const specSlugs = assignSlugs(specList, {
    parentOf: () => 'all',                                  // spec slugs are globally unique
    baseOf: (s) => slugify(pick(s.api_attribute_name, 'en')),
    idOf: (s) => s.attribute_id,
  });

  const specs = await upsert('spec_attributes', specList.map((s) => {
    const attrEn = pick(s.api_attribute_name, 'en');
    return {
      source_id: s.attribute_id,
      slug: specSlugs.get(s),
      category_name: i18n(pick(s.api_category_name, 'ar') || pick(s.api_category_name, 'en') || 'عام', pick(s.api_category_name, 'en') || 'General'),
      category_icon_url: s.category_icon_image_cdn_url,
      category_sequence: s.category_sequence ?? 0,
      attribute_name: i18n(pick(s.api_attribute_name, 'ar') || attrEn, attrEn),
      attribute_icon_url: s.attribute_icon_image_cdn_url,
      attribute_sequence: s.attribute_sequence ?? 0,
      unit_code: pick(s.api_unit_code, 'en') || null,
      display_type: s.attribute_display_type || 'text',
      show_on_card: !!s.attribute_display_in_car_card,
      is_key: !!s.is_key,
      active: true,
    };
  }), 'source_id');
  console.log(`  spec_attributes  ${specs.length}  (from ${specRows.length} spec rows)`);

  // ── spec option values ──
  // The allowed answers for select / multi / yesno attributes.
  //
  // Derived from the same spec rows, because DB1 mirrors no attribute-value
  // table and its api_value_name is null on every row. The only usable signal
  // is display_value: the rendered label, in whichever language that car's row
  // happened to be written in.
  //
  // ONE LABEL PER VALUE, never a pair. It is tempting to take the first
  // Arabic rendering and the first Latin one and call them a translation of
  // each other, and that is wrong: value 636 renders as "سيدان" on eleven cars
  // and "SUV" on eight, and values 636/696 do not exist in Odoo at all — they
  // are stale ids whose old labels linger here. Pairing by id therefore
  // produced "SUV" ⇄ "سيدان", which is not a translation, it is a lie shown to
  // a buyer. The most frequent rendering wins and the other language is left
  // empty for staff to fill on the catalog page, where missing translations
  // are already flagged.
  const CHOICE_TYPES = new Set(['select', 'radio', 'pills', 'color', 'multi', 'yesno']);
  const ARABIC = /[؀-ۿ]/;

  const valueByPair = new Map();
  for (const row of specRows) {
    if (!CHOICE_TYPES.has(row.attribute_display_type)) continue;
    if (row.attribute_value_id == null) continue;

    const key = `${row.attribute_id}:${row.attribute_value_id}`;
    const entry = valueByPair.get(key) ?? {
      attributeSourceId: row.attribute_id,
      valueSourceId: row.attribute_value_id,
      counts: new Map(),
    };

    const label = (row.display_value ?? '').trim();
    // A multi-value row renders every selected option comma-joined, which is a
    // sentence rather than one option's label.
    if (label && !label.includes(',')) {
      entry.counts.set(label, (entry.counts.get(label) ?? 0) + 1);
    }
    valueByPair.set(key, entry);
  }

  /**
   * The one closed vocabulary we CAN pair safely.
   *
   * Every yes/no attribute upstream owns the same four options, so when a
   * value renders as both "Yes" and "نعم" those really are one option in two
   * languages — unlike a body style, where the vocabulary is open and the same
   * id has genuinely drifted between meanings. Pair inside this table, nowhere
   * else.
   */
  const CANONICAL = [
    { en: 'Yes', ar: 'نعم' },
    { en: 'No', ar: 'لا' },
    { en: 'Available', ar: 'متوفر' },
    { en: 'Not Available', ar: 'غير متوفر' },
  ];
  const canonicalOf = (label) =>
    CANONICAL.find((c) => c.en.toLowerCase() === label.toLowerCase() || c.ar === label) ?? null;

  for (const entry of valueByPair.values()) {
    const labels = [...entry.counts].sort((a, b) => b[1] - a[1]).map(([label]) => label);
    entry.label = labels[0] ?? null;
    entry.lang = entry.label && ARABIC.test(entry.label) ? 'ar' : 'en';

    // Both languages, but only when every rendering agrees on one canonical
    // concept. Two renderings that map to DIFFERENT concepts (or to none) stay
    // single-language.
    const concepts = labels.map(canonicalOf);
    entry.canonical =
      concepts.length && concepts.every((c) => c && c === concepts[0]) ? concepts[0] : null;

    // Upstream disagrees with itself and we cannot reconcile it.
    entry.ambiguous = labels.length > 1 && !entry.canonical;
  }

  // spec_attributes was just upserted, so map upstream attribute ids to ours.
  const specIdBySource = new Map(specs.map((s) => [s.source_id, s.id]));

  const valueRows = [...valueByPair.values()]
    .filter((v) => v.label && specIdBySource.has(v.attributeSourceId))
    .map((v) => ({
      attribute_id: specIdBySource.get(v.attributeSourceId),
      source_id: v.valueSourceId,
      // A canonical yes/no concept gets both languages; anything else keeps
      // only the language actually observed. localized() falls back to the
      // other key, so a single-language option still renders everywhere.
      name: v.canonical
        ? { ar: v.canonical.ar, en: v.canonical.en }
        : v.lang === 'ar' ? { ar: v.label } : { en: v.label },
      sequence: 0,
      active: true,
    }));

  let specValues = [];
  try {
    specValues = await upsert('spec_attribute_values', valueRows, 'attribute_id,source_id');
    const kept = [...valueByPair.values()].filter((v) => v.label);
    const both = kept.filter((v) => v.canonical).length;
    const ambiguous = kept.filter((v) => v.ambiguous).length;
    console.log(
      `  spec_values      ${specValues.length}  (${both} bilingual, ${kept.length - both} single-language` +
      `${ambiguous ? `, ${ambiguous} need review — upstream renders them more than one way` : ''})`
    );
  } catch (err) {
    // The table arrives with schema.sql; a checkout that has not applied it
    // yet should still get a working catalog sync.
    console.log(`  spec_values      skipped — run schema.sql  (${err.message.slice(0, 80)})`);
  }

  console.log('');
})().catch((e) => {
  console.error(`\n  FAILED: ${e.message}\n`);
  process.exit(1);
});
