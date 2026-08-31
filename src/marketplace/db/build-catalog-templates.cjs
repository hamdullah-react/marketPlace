/**
 * Build the catalog TEMPLATES a vendor can install from the dashboard.
 *
 *   node src/marketplace/db/build-catalog-templates.cjs
 *
 * ── Why templates ───────────────────────────────────────────────────────────
 *
 * A vendor opening an empty Catalog has to invent 26 brands, 100 colours and 41
 * specification definitions before they can list one car — and every vendor who
 * does it invents slightly different ones. "Automatic", "automatic" and
 * "أوتوماتيك" are three values that never match, cannot be filtered on, and
 * quietly make the spec sheet useless.
 *
 * So the real catalog is captured ONCE, here, into static JSON that ships with
 * the repo. A vendor installs the parts they want and skips the rest; nothing
 * is forced on anybody, and an install is reversible.
 *
 * ── Build time vs install time ──────────────────────────────────────────────
 *
 * This script does the slow half: it reads alromaihcars.com's own endpoints and
 * DOWNLOADS every logo and icon into public/catalog-templates/. The template
 * JSON stores the file PATH, not a URL.
 *
 * Installing then uploads those files into the marketplace-media bucket and
 * writes the resulting URLs onto the rows; removing the template deletes them
 * again. That is the whole point of shipping files rather than bucket URLs: a
 * template is self-contained in the repo, an install owns its own copies, and
 * an uninstall leaves nothing behind. Nothing ever hotlinks the main site's
 * CDN, and a machine with no database can still build the templates.
 *
 * ── Output ──────────────────────────────────────────────────────────────────
 *
 *   public/catalog-templates/<folder>/<hash>.<ext>  the images
 *   src/marketplace/catalog-templates/<key>.json    one per template
 *   src/marketplace/catalog-templates/index.json    the manifest the UI lists
 *
 * Re-runnable: file names are a hash of the source URL, so the same image
 * lands on the same name every time rather than piling up copies.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SOURCE = process.env.SOURCE_URL || 'http://localhost:3000';
const OUT = path.join(process.cwd(), 'src', 'marketplace', 'catalog-templates');
const EOL = String.fromCharCode(10);

// Under public/, so the files are servable during development and, more to the
// point, readable by the install action with a plain fs.readFile.
const ASSETS = path.join(process.cwd(), 'public', 'catalog-templates');

const log = (...a) => console.log(...a);
const fail = (m) => { console.error(`\n✗ ${m}`); process.exit(1); };

const MIME = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif',
};

/**
 * Arabic → Latin, letter by letter.
 *
 * Needed because a slug is built from `\w`, which is ASCII-only: an
 * Arabic-only name is stripped to NOTHING and comes out as ''. Three Isuzu
 * models on the real catalog are named only in Arabic — "ديانا", "ديماكس
 * بدون دبل" — so all three produced the same empty slug, collided on
 * car_models' `unique (brand_id, slug)`, and TWO OF THEM WERE SILENTLY LOST.
 * The template shipped 103 models and could only ever install 101.
 *
 * Rough on purpose. This is a URL key, not a transcription: it has to be
 * stable, unique within its brand, and typeable. Nobody reads it as Arabic.
 */
const AR_LATIN = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ى': 'a', 'ء': '', 'ؤ': 'w', 'ئ': 'y',
  'ب': 'b', 'ت': 't', 'ة': 'h', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ي': 'y',
};

const transliterate = (s) => String(s ?? '')
  // Harakat and tatweel carry no sound worth keeping in a key.
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  // Arabic-Indic digits are digits.
  .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
  .replace(/[\u0600-\u06FF]/g, (ch) => (ch in AR_LATIN ? AR_LATIN[ch] : ''));

const asciiSlug = (s) => String(s ?? '').toLowerCase().trim()
  .replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

/**
 * Transliteration is a FALLBACK, never the first pass — so no slug that
 * already works can change. A name with any Latin in it keeps exactly the slug
 * it has always had; only one that would otherwise be empty is transliterated.
 */
const slugify = (s) => asciiSlug(s) || asciiSlug(transliterate(s));

/** Upstream ships en_US / ar_001; our schema is {ar, en}. Translate once, here. */
const i18n = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.trim() ? { en: value.trim() } : null;
  const out = {};
  const ar = (value.ar_001 ?? value.ar ?? '').trim();
  const en = (value.en_US ?? value.en ?? '').trim();
  if (ar) out.ar = ar;
  if (en) out.en = en;
  return Object.keys(out).length ? out : null;
};

const label = (value) => i18n(value)?.en || i18n(value)?.ar || '';

/**
 * Every catalog endpoint defaults to a page, not the whole list.
 *
 * That default is what made the first build ship 24 models when the site has
 * 103, and 12 trims when it has 114 — the JSON looked complete and was
 * alphabetically truncated at "d-max". A template that silently contains a
 * quarter of the catalog is worse than no template, because nobody checks a
 * list they were told is the list.
 */
const PAGE = 1000;

async function get(pathname, { optional = false } = {}) {
  const url = pathname.includes('?')
    ? `${SOURCE}${pathname}&limit=${PAGE}`
    : `${SOURCE}${pathname}?limit=${PAGE}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    if (optional) return null;
    fail(`${pathname} - ${err.message}. Is the dev server running?`);
  }

  // `optional` is what one dead car page costs: that car, and nothing else.
  // Without it a single 404 in a list of 164 ended the whole build after
  // twenty minutes of downloads — and because fail() calls process.exit, a
  // try/catch at the call site could never have caught it either.
  if (!res.ok) {
    if (optional) return null;
    fail(`${pathname} returned ${res.status}. Is the dev server running?`);
  }

  const json = await res.json();
  return Array.isArray(json) ? json : (json.cars ?? json.data ?? json.items ?? json);
}

// ── image download ──────────────────────────────────────────────────────────

const downloaded = new Map(); // source URL → our relative path, so a shared icon lands once
let bytes = 0;
let files = 0;

/**
 * Fetch one image into public/catalog-templates/<folder>/ and return the path
 * the template stores — relative, forward slashes, no leading slash.
 *
 * Relative because the same JSON is read on Windows and deployed on Linux, and
 * because the install action resolves it under public/ rather than trusting it
 * as a location. A hash name keeps it unique, stable across re-runs, and ASCII:
 * the CDN paths here are Arabic in places, and both Supabase Storage keys and
 * URLs are happier without that.
 */
async function download(sourceUrl, folder) {
  if (!sourceUrl || typeof sourceUrl !== 'string' || !/^https?:\/\//.test(sourceUrl)) return null;
  if (downloaded.has(sourceUrl)) return downloaded.get(sourceUrl);

  let res;
  try {
    res = await fetch(sourceUrl);
  } catch {
    downloaded.set(sourceUrl, null);
    return null;
  }
  if (!res.ok) { downloaded.set(sourceUrl, null); return null; }

  const body = Buffer.from(await res.arrayBuffer());
  const ext = (sourceUrl.split('?')[0].split('.').pop() || 'png').toLowerCase();
  const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex').slice(0, 12);

  const rel = `${folder}/${hash}.${MIME[ext] ? ext : 'png'}`;
  const abs = path.join(ASSETS, rel);

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body);

  bytes += body.length;
  files += 1;

  downloaded.set(sourceUrl, rel);
  return rel;
}

// ── the templates ───────────────────────────────────────────────────────────

async function buildBrands() {
  const rows = await get('/api/graphql/car-brands');
  const items = [];
  for (const b of rows) {
    const name = i18n(b.name);
    if (!name) continue;
    items.push({
      slug: b.slug || slugify(label(b.name)),
      name,
      logo_file: await download(b.logoCdnUrl ?? b.logo_cdn_url, 'logos'),
      active: b.active !== false,
      sequence: items.length * 10,
    });
  }
  return items;
}

async function buildModels() {
  const [brands, rows] = await Promise.all([
    get('/api/graphql/car-brands'),
    get('/api/graphql/car-models'),
  ]);
  // Models reference their brand by SLUG, not by id: a template is installed
  // into a database whose uuids it cannot know, so the link has to be by a
  // value that survives the trip.
  const brandSlug = new Map(brands.map((b) => [b.id, b.slug || slugify(label(b.name))]));

  return rows
    .map((m) => {
      const name = i18n(m.name);
      const brand = brandSlug.get(m.brandId) || m.brandSlug;
      if (!name || !brand) return null;
      return { brand_slug: brand, slug: slugify(label(m.name)), name, active: m.active !== false };
    })
    .filter(Boolean);
}

async function buildTrims() {
  const [brands, models, rows] = await Promise.all([
    get('/api/graphql/car-brands'),
    get('/api/graphql/car-models'),
    get('/api/graphql/car-trims'),
  ]);

  const brandSlug = new Map(brands.map((b) => [b.id, b.slug || slugify(label(b.name))]));

  // A model slug is unique per BRAND, not globally — MG and Mazda both have a
  // "3", Ford and Chery both have a "5". Carrying only the model slug would
  // hand every one of those trims to whichever brand happened to be read
  // first, so the brand travels with it.
  const model = new Map(
    models.map((m) => [m.id, { slug: slugify(label(m.name)), brand: brandSlug.get(m.brandId) || m.brandSlug }])
  );

  return rows
    .map((tr) => {
      const name = i18n(tr.name);
      const parent = model.get(tr.modelId);
      if (!name || !parent?.slug) return null;
      return {
        brand_slug: parent.brand ?? null,
        model_slug: parent.slug,
        slug: slugify(label(tr.name)),
        name,
        active: tr.active !== false,
      };
    })
    .filter(Boolean);
}

async function buildYears() {
  const rows = await get('/api/graphql/car-years');
  return rows
    .map((y) => Number(y.value ?? label(y.name)))
    .filter((v) => Number.isInteger(v) && v >= 1950 && v <= 2100)
    .sort((a, b) => b - a)
    .map((value) => ({ value }));
}

async function buildColors() {
  const rows = await get('/api/graphql/car-colors');
  const seen = new Set();
  const items = [];

  for (const c of rows) {
    const name = i18n(c.name);
    const slug = c.slug || slugify(label(c.name));
    if (!name || !slug || seen.has(slug)) continue;
    seen.add(slug);
    items.push({
      slug,
      name,
      hex: c.colorPicker || c.color_picker || c.colorCode || null,
      image_file: await download(c.colorImageCdnUrl ?? c.color_image_cdn_url, 'colors'),
      sequence: items.length * 10,
    });
  }
  return items;
}

/**
 * Specifications that must be a DROPDOWN whatever upstream calls them.
 *
 * `seats` arrives as `numeric`, which turns a field with five real answers
 * into a free number box — one seller types 7, the next "7 seats", the third
 * "٧", and the filter that was supposed to find seven-seaters finds one of
 * them. Every distinct value the site actually uses is collected below, so it
 * becomes a list rather than an invitation.
 */
const AS_DROPDOWN = new Set(['seats']);

/**
 * Specifications the car card shows.
 *
 * Upstream already flags transmission, fuel type, body style and seats, and
 * this is here so that stays true even if a car page stops saying so — these
 * four ARE the card's spec row, and a row that silently loses a slot reads as
 * a broken card rather than a changed setting.
 */
const SHOW_ON_CARD = new Set(['transmission', 'fuel-type', 'body-style', 'seats']);

/**
 * The full option list for the four specs the card shows.
 *
 * ── Why these cannot be harvested ───────────────────────────────────────────
 *
 * Every other value list in this file is collected from the cars upstream
 * actually has, and for a single dealership that is exactly right: it cannot
 * invent an option nobody sells.
 *
 * It is wrong for a MARKETPLACE. Harvesting gave transmission three values and
 * fuel type four — because that is what ALROMAIH sells, not what a car is. The
 * next seller to open a showroom lists a dual-clutch coupe or a hydrogen SUV,
 * finds no option for it, and does the one thing this whole table exists to
 * prevent: types it in. One seller writes "DCT", the next "Dual Clutch", the
 * third "دي سي تي", and the filter that was supposed to find them finds one.
 *
 * So the card's four specs get a complete list up front. They are the four a
 * buyer filters on and the four printed on every card, which is precisely why
 * they are the four that must not depend on today's inventory.
 *
 * ── Order is meaningful ─────────────────────────────────────────────────────
 *
 * The installer writes `sequence: i * 10` from this array order, so it is the
 * order the seller's dropdown shows. Commonest first, not alphabetical — a
 * Riyadh showroom picks Automatic and Gasoline far more often than Sequential
 * and Flex-Fuel, and those two should not be scrolled past.
 *
 * Anything upstream has that is NOT named here is still appended, so a real
 * value already in use can never be dropped by this list.
 */
const BASELINE_VALUES = {
  transmission: [
    { ar: 'أوتوماتيك', en: 'Automatic' },
    { ar: 'يدوي', en: 'Manual' },
    { ar: 'CVT', en: 'CVT' },
    { ar: 'e-CVT (هجين)', en: 'e-CVT (Hybrid)' },
    { ar: 'ناقل حركة مزدوج القابض (DCT)', en: 'Dual-Clutch (DCT)' },
    { ar: 'ناقل حركة يدوي مؤتمت (AMT)', en: 'Automated Manual (AMT)' },
    { ar: 'نصف أوتوماتيك', en: 'Semi-Automatic' },
    { ar: 'تيبترونيك', en: 'Tiptronic' },
    { ar: 'ناقل حركة متسلسل', en: 'Sequential' },
    { ar: 'سرعة واحدة (كهربائي)', en: 'Single-Speed (Electric)' },
  ],
  'fuel-type': [
    { ar: 'البنزين', en: 'Gasoline' },
    { ar: 'الديزل', en: 'Diesel' },
    { ar: 'هجين (بنزين + كهربائي)', en: 'Hybrid (Petrol + Electric)' },
    { ar: 'هايبرد قابل للشحن (PHEV)', en: 'Plug-in Hybrid (PHEV)' },
    { ar: 'هجين خفيف (MHEV)', en: 'Mild Hybrid (MHEV)' },
    { ar: 'كهربائي (EV)', en: 'Electric (EV)' },
    { ar: 'هيدروجين (FCEV)', en: 'Hydrogen (FCEV)' },
    { ar: 'الغاز الطبيعي المضغوط (CNG)', en: 'Compressed Natural Gas (CNG)' },
    { ar: 'غاز البترول المسال (LPG)', en: 'Liquefied Petroleum Gas (LPG)' },
    { ar: 'وقود مرن (E85)', en: 'Flex-Fuel (E85)' },
  ],
  'body-style': [
    { ar: 'سيدان', en: 'Sedan' },
    { ar: 'سيارة رياضية متعددة الاستخدامات', en: 'SUV' },
    { ar: 'كروس أوفر', en: 'Crossover' },
    { ar: 'هاتشباك', en: 'Hatchback' },
    { ar: 'بيك أب', en: 'Pickup Truck' },
    { ar: 'كوبيه', en: 'Coupe' },
    { ar: 'مكشوفة', en: 'Convertible' },
    { ar: 'ستيشن واجن', en: 'Station Wagon' },
    { ar: 'فان', en: 'Van' },
    { ar: 'ميني فان', en: 'Minivan' },
    { ar: 'باص', en: 'Bus' },
  ],
  // Plain integers, and that matters: upstream ships these as floats, so the
  // harvested list read "5.0" and a card printed "5.0 seats".
  seats: [2, 3, 4, 5, 6, 7, 8, 9, 13, 15, 18, 26, 28].map((n) => ({
    ar: String(n),
    en: String(n),
  })),
};

/**
 * Seat counts arrive as "5.0". Trailing ".0" is not a seat.
 *
 * Applied to the harvested value as well as the baseline, so an upstream count
 * the baseline does not list — a 32-seater — still lands as "32" rather than
 * reappearing as "32.0" beside the clean ones.
 */
function tidyValue(slug, value) {
  if (slug !== 'seats' || !value) return value;
  const out = {};
  for (const [lang, text] of Object.entries(value)) {
    out[lang] = String(text).trim().replace(/\.0+$/, '');
  }
  return out;
}

/**
 * Specifications filed under a heading that hides them.
 *
 * Upstream puts the SEAT COUNT under "Structure and dimensions", and has a
 * separate "Seats" category holding seat FEATURES — upholstery, electric
 * adjustment, multi-way driver seat. So a seller opens the category called
 * Seats to say how many seats the car has, does not find it, and reasonably
 * concludes the option list was never installed. A category named Seats that
 * does not contain Seats is a trap, not a taxonomy.
 *
 * Written as "adopt the category of ANOTHER spec" rather than as a literal
 * category name, because the heading and its icon are upstream's to change:
 * naming a donor keeps this correct if "Seats" is renamed or re-iconed, where
 * a hardcoded label would silently create a second category with a stale name.
 */
const RECATEGORISE = { seats: 'seat-upholstery' };

/**
 * Moves each spec into its donor's category and puts it FIRST there — the
 * seat count is the thing a seller came to that heading to fill in, so it
 * should not sit under six adjustment toggles.
 */
function recategorise(list) {
  const bySlug = new Map(list.map((s) => [s.slug, s]));

  for (const [slug, donorSlug] of Object.entries(RECATEGORISE)) {
    const row = bySlug.get(slug);
    const donor = bySlug.get(donorSlug);
    // Either side may be absent on a partial catalog. Leaving the spec where
    // upstream put it is worse than this move, and better than a crash.
    if (!row || !donor || row === donor) continue;

    row.category_name = donor.category_name;
    row.category_icon_file = donor.category_icon_file;
    row.category_sequence = donor.category_sequence;

    const siblings = list.filter(
      (s) => s !== row && s.category_sequence === donor.category_sequence
    );
    const first = Math.min(...siblings.map((s) => s.attribute_sequence ?? 0));
    row.attribute_sequence = Number.isFinite(first) ? first - 10 : 0;
  }

  return list;
}

/**
 * Specification definitions, unioned across every car on the site.
 *
 * One car carries 41 specs; the site as a whole carries more, and which ones
 * depends on the body type. Reading every car and merging by attribute name is
 * the only way to get a definition list that covers a saloon and a pickup
 * alike — and it is also where the OPTION VALUES come from, since a `select`
 * attribute is only ever seen through the cars that answer it.
 */
async function buildSpecs() {
  const cars = await get('/api/graphql/alromaih-cars');
  const bySlug = new Map();
  let read = 0;
  let skipped = 0;
  log(`    reading ${cars.length} cars…`);

  for (const car of cars) {
    if (!car?.slug) continue;
    const detail = await get(`/api/graphql/alromaih-cars/${car.slug}`, { optional: true });
    if (!detail) { skipped += 1; continue; }

    const specs = (detail.car ?? detail)?.specifications ?? [];
    read += 1;

    for (const s of specs) {
      const attribute = i18n(s.attributeName);
      if (!attribute) continue;

      const slug = slugify(label(s.attributeName));
      if (!slug) continue;

      if (!bySlug.has(slug)) {
        // The attribute's own type wins over the row's — the row describes one
        // car's answer, the attribute describes what any answer may be.
        let displayType = s.attributeDisplayType || s.displayType || 'text';
        if (AS_DROPDOWN.has(slug)) displayType = 'select';

        bySlug.set(slug, {
          slug,
          attribute_name: attribute,
          attribute_icon_file: await download(s.iconUrl, 'spec-icons'),
          attribute_sequence: s.attributeSequence ?? 0,
          category_name: i18n(s.categoryName),
          category_icon_file: await download(s.categoryIconUrl, 'category-icons'),
          category_sequence: s.categorySequence ?? 0,
          unit_code: i18n(s.unitCode),
          display_type: displayType,
          is_key: !!s.isKey,
          show_on_card: !!s.displayInCarCard || SHOW_ON_CARD.has(slug),
          // Seeded, not empty, for the card's four — see BASELINE_VALUES. The
          // harvest below then appends anything upstream has that the baseline
          // does not name.
          values: (BASELINE_VALUES[slug] ?? []).map((v) => ({ ...v })),
        });
      }

      // Only a choice type has a value LIST. Free text and measurements do
      // not, and inventing options for them is what turned every field in the
      // seller form into a dropdown the last time this was guessed at.
      const entry = bySlug.get(slug);
      const CHOICE = ['select', 'multi', 'yesno'];
      if (CHOICE.includes(entry.display_type)) {
        const value = tidyValue(slug, i18n(s.valueName));
        const key = label(value);
        // Compared case-insensitively: upstream spells the same answer
        // "Automatic" on one car and "automatic" on the next, and a
        // case-sensitive test files both — which is the duplicate dropdown
        // entry this whole table exists to prevent.
        const fold = (v) => String(label(v) ?? '').trim().toLowerCase();
        if (value && key && !entry.values.some((v) => fold(v) === fold(value))) {
          entry.values.push(value);
        }
      }
    }
  }

  log(`    ${read} read${skipped ? `, ${skipped} unavailable` : ''}`);

  // Recategorised BEFORE the sort, so a moved spec lands in its new group in
  // the right place rather than keeping its old neighbours' order.
  return recategorise([...bySlug.values()]).sort(
    (a, b) => a.category_sequence - b.category_sequence || a.attribute_sequence - b.attribute_sequence
  );
}

/**
 * A template that is authored by hand rather than harvested.
 *
 * Read back from the file it already lives in, so a rebuild preserves it
 * instead of writing an empty list over it.
 */
function readStatic(key) {
  const file = path.join(OUT, `${key}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).items ?? [];
  } catch (err) {
    log(`    ${key}: could not be read (${err.message}) — shipping empty.`);
    return [];
  }
}

// ── main ────────────────────────────────────────────────────────────────────

(async () => {
  log('\n── Building catalog templates ────────────────────────────────\n');

  fs.mkdirSync(ASSETS, { recursive: true });

  fs.mkdirSync(OUT, { recursive: true });

  const TEMPLATES = [
    { key: 'brands', table: 'car_brands', ar: 'الماركات', en: 'Brands',
      descAr: 'كل ماركات السيارات مع شعاراتها.', descEn: 'Every car brand, with its logo.',
      build: buildBrands },
    { key: 'models', table: 'car_models', ar: 'الموديلات', en: 'Models',
      descAr: 'موديلات السيارات مرتبطة بماركاتها.', descEn: 'Car models, linked to their brands.',
      needs: ['brands'], build: buildModels },
    { key: 'trims', table: 'car_trims', ar: 'الفئات', en: 'Trims',
      descAr: 'فئات كل موديل.', descEn: 'The trim levels of each model.',
      needs: ['models'], build: buildTrims },
    { key: 'years', table: 'car_years', ar: 'السنوات', en: 'Years',
      descAr: 'سنوات الصنع.', descEn: 'Model years.',
      build: buildYears },
    { key: 'colors', table: 'car_colors', ar: 'الألوان', en: 'Colours',
      descAr: 'ألوان السيارات مع أكوادها.', descEn: 'Car colours, with their hex codes.',
      build: buildColors },
    /**
     * Offer names are NOT harvested — they are ours.
     *
     * Every other template is a photograph of upstream's catalog. This one is
     * a list of Saudi occasions that no ERP has an opinion about: National
     * Day, Founding Day, Ramadan, White Friday. It is authored in
     * offer-names.json and passed through untouched, so a rebuild that cannot
     * reach upstream still ships it intact.
     */
    { key: 'offer-names', table: 'offer_names', ar: 'أسماء العروض', en: 'Offer names',
      descAr: 'أسماء جاهزة للعروض حسب المناسبات السعودية.',
      descEn: 'Ready-made offer names for the Saudi occasions.',
      build: async () => readStatic('offer-names') },
    { key: 'specifications', table: 'spec_attributes', ar: 'المواصفات', en: 'Specifications',
      descAr: 'تعريفات المواصفات مع مجموعاتها وأيقوناتها وقيمها.',
      descEn: 'Specification definitions with their categories, icons and allowed values.',
      build: buildSpecs },
  ];

  /**
   * Build everything FIRST, write at the end.
   *
   * Writing each template as it finished meant a build that died on the fifth
   * left four new files, no manifest, and a Templates tab reading "No
   * templates yet" — the previous, working set having already been replaced.
   * A half-written catalog is worse than a stale one.
   *
   * So nothing touches src/marketplace/catalog-templates until every template
   * has been built. If any one of them fails, the existing files are left
   * exactly as they were and the run says so.
   *
   * The IMAGES under public/ are written as they download, which is fine and
   * deliberate: they are named by content hash, so a partial download set is a
   * subset of the right files rather than a wrong one, and the next run reuses
   * what is already there instead of fetching it twice.
   */
  const manifest = [];
  const built = [];
  const failed = [];

  for (const tpl of TEMPLATES) {
    log(`  ${tpl.en}`);
    let items;
    try {
      items = await tpl.build();
    } catch (err) {
      log(`    ! ${err.message}\n`);
      failed.push(tpl.key);
      continue;
    }

    built.push([`${tpl.key}.json`, { key: tpl.key, table: tpl.table, items }]);

    manifest.push({
      key: tpl.key,
      table: tpl.table,
      name: { ar: tpl.ar, en: tpl.en },
      description: { ar: tpl.descAr, en: tpl.descEn },
      needs: tpl.needs ?? [],
      count: items.length,
    });

    log(`    ${items.length} rows\n`);
  }

  if (failed.length) {
    fail(
      `${failed.join(', ')} failed to build. Nothing was written — the templates ` +
      `already on disk are untouched.`
    );
  }

  for (const [name, payload] of built) {
    fs.writeFileSync(path.join(OUT, name), JSON.stringify(payload, null, 2), 'utf8');
  }
  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(manifest, null, 2), 'utf8');

  /**
   * A module that IMPORTS the templates, rather than reading them off disk.
   *
   * The app used to fs.readFile these JSON files at request time. That works on
   * a dev machine and stops working the moment the app is deployed: src/ is
   * compiled away, so the read fails, so getTemplates() returns [], so the
   * Templates tab says "no templates yet" to a vendor who has no way to build
   * them. Importing them makes the bundler carry them into the build.
   *
   * Generated from the manifest rather than written by hand, so a template can
   * never be built into the folder and left out of the loader.
   */
  const lines = [
    '/**',
    ' * GENERATED by src/marketplace/db/build-catalog-templates.cjs — do not edit.',
    ' *',
    ' * Static imports on purpose: this is what puts the templates inside the',
    ' * deployed bundle, so a vendor never has to build anything to install one.',
    ' */',
    '',
    "import manifest from './index.json';",
    ...manifest.map((t) => `import ${t.key} from './${t.key}.json';`),
    '',
    'export const MANIFEST = manifest;',
    '',
    'export const TEMPLATES = {',
    ...manifest.map((t) => `  ${t.key},`),
    '};',
    '',
  ];

  fs.writeFileSync(path.join(OUT, 'templates.js'), lines.join(EOL), 'utf8');

  log(`  written to ${path.relative(process.cwd(), OUT)}\n`);

  log(
    `✓ ${manifest.length} templates · ${manifest.reduce((n, t) => n + t.count, 0)} rows · ` +
    `${files} images (${(bytes / 1048576).toFixed(1)} MB) in public/catalog-templates
`
  );
})();
