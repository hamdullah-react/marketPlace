/**
 * Builds the "Car images" catalog template.
 *
 * For every brand in brands.json: up to 10 EXTERIOR photos, in as many
 * different colours as can be found, and up to 10 INTERIOR photos. Downloaded
 * once, here, into public/catalog-templates/car-images/<brand>/<category>/, and
 * listed in src/marketplace/catalog-templates/car-images.json. Installing the
 * template copies them into the installing showroom's OWN bucket and library —
 * see src/marketplace/media/carImagesTemplate.js.
 *
 * ── Where the photos come from ──────────────────────────────────────────────
 *
 * Openverse (api.openverse.org), filtered to licences that allow COMMERCIAL
 * use. It indexes Wikimedia Commons and Flickr. Not the dealership's own
 * photography, on purpose, and not "anything on the web": a photo copied from a
 * manufacturer or a news site is not ours to put in a marketplace.
 *
 * Most results are CC BY or CC BY-SA, which require credit. Every item keeps its
 * creator, licence and source page in the JSON, so a credits page can be built
 * from it.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────
 *
 * Read from the photo's TITLE and tags ("… NX4 Green Black Gray"). There is no
 * image analysis here, so a photo whose title names no colour counts as
 * "unknown": the picker takes one photo per named colour first, then fills.
 *
 * ── Quota ───────────────────────────────────────────────────────────────────
 *
 * Anonymous Openverse is 20 searches a minute and 200 a day. Searches are
 * spaced to stay under the first and CACHED on disk, so when the daily quota
 * runs out the script writes what it has and a rerun tomorrow carries on
 * without repeating a single search.
 *
 * Run from the repo root:
 *
 *   node src/marketplace/db/build-car-images-template.cjs
 *
 * Options (environment):
 *   CAR_IMAGES_PER_BRAND=10        photos per category, per brand
 *   CAR_IMAGES_BRANDS=toyota,kia   only these brands; the others stay as they are
 *   CAR_IMAGES_MAX_SEARCHES=180    stop searching after this many (this run)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const TEMPLATES = path.join(ROOT, 'src', 'marketplace', 'catalog-templates');
const ASSETS = path.join(ROOT, 'public', 'catalog-templates');
const OUT_JSON = path.join(TEMPLATES, 'car-images.json');
const CACHE_FILE = path.join(ROOT, 'src', 'marketplace', 'db', '.car-images-search-cache.json');

const API = 'https://api.openverse.org/v1/images/';
// Wikimedia asks for a descriptive User-Agent with a way to reach the operator.
const UA = 'AlromaihMarketplaceTemplateBuilder/1.0 (+https://alromaihcars.com)';

const PER_BRAND = Number(process.env.CAR_IMAGES_PER_BRAND) || 10;
const MAX_SEARCHES = Number(process.env.CAR_IMAGES_MAX_SEARCHES) || 180;
const ONLY = (process.env.CAR_IMAGES_BRANDS || '').split(',').map((s) => s.trim()).filter(Boolean);

const SEARCH_GAP_MS = 3300; // 20 a minute, with room to spare
const MIN_WIDTH = 800;
const MIN_YEAR = 2012; // a 1994 Camry is not what a showroom is selling
const MIN_BYTES = 20 * 1024; // smaller is a "photo unavailable" placeholder
const MAX_BYTES = 7 * 1024 * 1024; // the vendor bucket refuses 8 MB and up
const BACKUPS = 6; // extra candidates per category, for downloads that fail

const log = (...args) => console.log(...args);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* ── Colours, in the order a showroom lists them ─────────────────────────── */

const COLOURS = [
  { slug: 'white', en: 'White', ar: 'أبيض', re: /\b(white|pearl|ivory)\b/i },
  { slug: 'black', en: 'Black', ar: 'أسود', re: /\b(black|onyx|ebony)\b/i },
  { slug: 'silver', en: 'Silver', ar: 'فضي', re: /\b(silver)\b/i },
  { slug: 'grey', en: 'Grey', ar: 'رمادي', re: /\b(gr[ae]y|graphite|gunmetal|titanium)\b/i },
  { slug: 'red', en: 'Red', ar: 'أحمر', re: /\b(red|crimson|maroon|burgundy|scarlet)\b/i },
  { slug: 'blue', en: 'Blue', ar: 'أزرق', re: /\b(blue|navy|azure|teal)\b/i },
  { slug: 'green', en: 'Green', ar: 'أخضر', re: /\b(green|olive|khaki)\b/i },
  { slug: 'brown', en: 'Brown', ar: 'بني', re: /\b(brown|bronze|copper|beige|tan|champagne)\b/i },
  { slug: 'yellow', en: 'Yellow', ar: 'أصفر', re: /\b(yellow|gold|golden)\b/i },
  { slug: 'orange', en: 'Orange', ar: 'برتقالي', re: /\b(orange)\b/i },
];

/** The colour named EARLIEST in the text — "Green Black Gray" is green. */
function detectColour(text) {
  let best = null;
  let at = Infinity;
  for (const colour of COLOURS) {
    const match = colour.re.exec(text);
    if (match && match.index < at) {
      best = colour;
      at = match.index;
    }
  }
  return best;
}

/* ── What a usable photo is ─────────────────────────────────────────────── */

// Motorsport, taxis, wrecks, toys, parts and drawings: all real "Toyota Camry"
// results, none of them a car a buyer is shopping for.
const REJECT = new RegExp(
  '\\b(' +
    [
      'nascar', 'race', 'racing', 'racer', 'rally', 'motorsport', 'championship', 'grand prix',
      'drift', 'taxi', 'police', 'polizei', 'ambulance', 'crash', 'accident', 'wreck', 'wrecked',
      'damaged', 'burnt', 'junk', 'scrap', 'toy', 'lego', 'diecast', 'die-cast', 'scale model',
      'miniature', 'hot wheels', 'matchbox', 'model kit', 'poster', 'brochure', 'logo', 'emblem',
      'badge', 'wheel', 'wheels', 'rim', 'rims', 'tyre', 'tire', 'engine', 'drawing', 'sketch',
      'render', 'rendering', 'concept', 'prototype', 'parade', 'protest', 'funeral', 'limousine',
      // Same brand, not a car: BYD, Foton and Isuzu build buses and trains too,
      // and "BYD" alone finds a São Paulo metro train and Warsaw city buses.
      'bus', 'buses', 'coach', 'minibus', 'train', 'trem', 'metro', 'monorail', 'tram', 'skyrail',
      'forklift', 'battery', 'factory', 'plant', 'headquarters',
      // Trucks, classics and museum pieces: titles only. "Isuzu" finds Elf and
      // Giga trucks and a 1960s Bellett shot at the Isuzu Plaza museum, none of
      // them carrying a year for MIN_YEAR to catch. Not checked against tags,
      // where an ordinary D-Max pickup is often tagged "truck".
      'truck', 'trucks', 'lorry', 'tractor', 'tipper', 'dump', 'elf', 'giga', 'forward',
      'classic', 'vintage', 'antique', 'oldtimer', 'retro', 'museum', 'isuzu plaza', 'heritage',
      'bellett', '117 coupe', 'gemini', 'piazza', 'florian',
    ].map(escape).join('|') +
  ')\\b',
  'i'
);

/*
 * Not a car, checked in the TAGS and the UPLOADER as well as the title.
 *
 * Titles miss these: "BYD K9B, #936, MZA Warszawa" is a city bus and never says
 * so, and "BYD Interior (25426914433)" was uploaded by "Singapore Buses". Only
 * vehicle words here — the full REJECT list would throw out ordinary car photos
 * whose tags happen to include "wheel" or "engine".
 */
const NOT_A_CAR = /\b(bus|buses|busse|autobus|coach|coaches|minibus|trolleybus|train|trains|trem|metro|subway|monorail|tram|tramway|transit|public transport|railway|forklift)\b/i;

const INTERIOR =/\b(interior|interieur|innenraum|intérieur|cabin|cockpit|dashboard|instrument panel|steering wheel|rear seats?|front seats?|infotainment)\b/i;

/** How a brand is written in a photo title. Most are just their name. */
const BRAND_ALIASES = {
  mercedes: /\bmercedes\b/i,
  'rolls-royce': /\brolls[\s-]?royce\b/i,
  gwm: /\b(gwm|great wall)\b/i,
  faw: /\b(faw|bestune)\b/i,
  gac: /\b(gac|trumpchi)\b/i,
  mg: /\bMG\b/, // case-sensitive, or every "img" matches
};

const brandRe = (brand) =>
  BRAND_ALIASES[brand.slug] ?? new RegExp(`\\b${escape(brand.en).replace(/[\s-]+/g, '[\\s-]?')}\\b`, 'i');

const modelRe = (model) =>
  new RegExp(`\\b${escape(model.en).replace(/[\s-]+/g, '[\\s-]?')}\\b`, 'i');

// A model worth searching by name: ASCII, and not a body style ("Bus").
const searchable = (model) =>
  /^[\x20-\x7E]+$/.test(model.en) && !/^(bus|mini bus|truck|van|pickup)$/i.test(model.en);

/* ── Openverse, cached and throttled ────────────────────────────────────── */

let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
} catch {
  cache = {};
}
const saveCache = () => fs.writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf8');

let searches = 0;
let lastSearch = 0;
let quotaLeft = null;
let quotaHit = false;

const pick = (r) => ({
  id: r.id,
  title: String(r.title ?? ''),
  url: r.url,
  creator: r.creator ?? null,
  creator_url: r.creator_url ?? null,
  license: r.license ?? null,
  license_version: r.license_version ?? null,
  license_url: r.license_url ?? null,
  source: r.source ?? r.provider ?? null,
  landing_url: r.foreign_landing_url ?? null,
  width: r.width ?? null,
  height: r.height ?? null,
  tags: (r.tags ?? []).map((t) => t?.name).filter(Boolean).slice(0, 30),
});

async function search(q) {
  if (cache[q]) return cache[q];
  if (quotaHit || searches >= MAX_SEARCHES) return null;

  const wait = SEARCH_GAP_MS - (Date.now() - lastSearch);
  if (wait > 0) await sleep(wait);
  lastSearch = Date.now();
  searches += 1;

  const url = `${API}?${new URLSearchParams({ q, license_type: 'commercial', page_size: '20' })}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(45000) });
  } catch (err) {
    log(`      ! search failed "${q}": ${err.cause?.code || err.message}`);
    return null;
  }

  const left = res.headers.get('x-ratelimit-available-anon_sustained');
  if (left !== null) quotaLeft = Number(left);
  if (res.status === 429 || quotaLeft === 0) quotaHit = true;
  if (!res.ok) {
    log(`      ! search ${res.status} "${q}"`);
    return null;
  }

  // The body is read AFTER the headers arrive, and the timeout still applies to
  // it. Outside the try, a slow body threw past everything and ended the whole
  // run at the fifteenth brand.
  let json;
  try {
    json = await res.json();
  } catch (err) {
    log(`      ! search failed "${q}": ${err.cause?.code || err.message}`);
    return null;
  }
  cache[q] = (json.results ?? []).map(pick);
  saveCache();
  return cache[q];
}

/* ── Choosing ───────────────────────────────────────────────────────────── */

function classify(row, brand, models) {
  const title = row.title;
  if (!row.url || !brand.re.test(title)) return null; // the brand must be IN the title
  if (REJECT.test(title)) return null;
  if (NOT_A_CAR.test(`${title} ${row.tags.join(' ')} ${row.creator ?? ''}`)) return null;
  if (row.width && row.width < MIN_WIDTH) return null;
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(row.url) && !/flickr|staticflickr/.test(row.url)) return null;

  const year = title.match(/\b(19[5-9]\d|20[0-3]\d)\b/);
  if (year && Number(year[1]) < MIN_YEAR) return null;

  const tags = row.tags.join(' ');
  const interior = INTERIOR.test(title) || /\b(car interior|interior|dashboard|cockpit)\b/i.test(tags);
  const model = models.find((m) => m.re.test(title)) ?? null;
  const colour = interior ? null : detectColour(title) ?? detectColour(tags);

  const score =
    (model ? 3 : 0) +
    (year && Number(year[1]) >= 2018 ? 2 : 0) +
    ((row.width ?? 0) >= 1200 ? 1 : 0) +
    (row.source === 'wikimedia' ? 1 : 0);

  return { ...row, category: interior ? 'interior' : 'exterior', model, colour, score };
}

// "Hyundai Tucson NX4 (2)" and "(4)" are the same car from another angle.
const sameCar = (title) =>
  title.toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/[\s_-]+\d+$/, '').trim();

function chooseExterior(candidates, n) {
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const chosen = [];
  const cars = new Set();
  const colours = new Set();
  const modelUses = new Map();

  const take = (c) => {
    chosen.push(c);
    cars.add(sameCar(c.title));
    if (c.colour) colours.add(c.colour.slug);
    const key = c.model?.slug ?? '';
    modelUses.set(key, (modelUses.get(key) ?? 0) + 1);
  };

  // One photo per named colour first — that is the "different colours" ask.
  for (const c of pool) {
    if (chosen.length >= n) break;
    if (!c.colour || colours.has(c.colour.slug) || cars.has(sameCar(c.title))) continue;
    take(c);
  }

  // Then fill, spreading across models rather than ten photos of one.
  while (chosen.length < n) {
    const rest = pool.filter((c) => !chosen.includes(c) && !cars.has(sameCar(c.title)));
    if (!rest.length) break;
    rest.sort(
      (a, b) =>
        b.score - 2 * (modelUses.get(b.model?.slug ?? '') ?? 0) -
        (a.score - 2 * (modelUses.get(a.model?.slug ?? '') ?? 0))
    );
    take(rest[0]);
  }
  return chosen;
}

function chooseInterior(candidates, n) {
  const pool = [...candidates].sort((a, b) => b.score - a.score);
  const chosen = [];
  const perCar = new Map();
  for (const c of pool) {
    if (chosen.length >= n) break;
    // Different angles of one cabin are useful, but not ten of them.
    const key = sameCar(c.title);
    if ((perCar.get(key) ?? 0) >= 3) continue;
    perCar.set(key, (perCar.get(key) ?? 0) + 1);
    chosen.push(c);
  }
  return chosen;
}

/* ── Downloading ────────────────────────────────────────────────────────── */

let downloaded = 0;
let bytes = 0;

/** Wikimedia originals run to several MB; its 1280px rendition is ~200 KB. */
function sourceUrl(row) {
  const m = row.url.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)$/
  );
  if (m && (row.width ?? 0) > 1280) {
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/1280px-${m[3]}`;
  }
  return row.url;
}

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

async function download(row, brandSlug, category) {
  const url = sourceUrl(row);
  const hash = crypto.createHash('sha1').update(row.url).digest('hex').slice(0, 16);

  // Already on disk from an earlier run, under any extension.
  const dir = path.join(ASSETS, 'car-images', brandSlug, category);
  for (const ext of Object.values(EXT)) {
    const existing = path.join(dir, `${hash}.${ext}`);
    if (fs.existsSync(existing)) return path.relative(ASSETS, existing).split(path.sep).join('/');
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim();
      const ext = EXT[type];
      if (!ext) throw new Error(`not a photo (${type || 'no type'})`);

      const body = Buffer.from(await res.arrayBuffer());
      if (body.length < MIN_BYTES) throw new Error('placeholder image');
      if (body.length > MAX_BYTES) throw new Error('too large');

      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${hash}.${ext}`);
      fs.writeFileSync(file, body);
      downloaded += 1;
      bytes += body.length;
      return path.relative(ASSETS, file).split(path.sep).join('/');
    } catch (err) {
      if (attempt === 2) {
        log(`      ! skipped "${row.title.slice(0, 60)}": ${err.message}`);
        return null;
      }
      await sleep(1500);
    }
  }
  return null;
}

async function collect(chosen, brand, category, n) {
  const items = [];
  for (const row of chosen) {
    if (items.length >= n) break;
    const file = await download(row, brand.slug, category);
    if (!file) continue;

    const model = row.model;
    const colour = row.colour;
    items.push({
      brand_slug: brand.slug,
      model_slug: model?.slug ?? null,
      category,
      color: colour?.slug ?? null,
      file,
      title: row.title,
      alt: {
        en: `${brand.en}${model ? ` ${model.en}` : ''} — ${
          category === 'interior' ? 'interior' : colour ? `${colour.en} exterior` : 'exterior'
        }`,
        ar: `${brand.ar}${model ? ` ${model.ar}` : ''} — ${
          category === 'interior' ? 'المقصورة الداخلية' : colour ? `خارجي ${colour.ar}` : 'صورة خارجية'
        }`,
      },
      credit: {
        creator: row.creator,
        creator_url: row.creator_url,
        license: row.license,
        license_version: row.license_version,
        license_url: row.license_url,
        source: row.source,
        landing_url: row.landing_url,
      },
    });
  }
  return items;
}

/* ── The run ────────────────────────────────────────────────────────────── */

(async () => {
  const text = (v) => (v && typeof v === 'object' ? v : { en: String(v ?? ''), ar: String(v ?? '') });

  const brands = require(path.join(TEMPLATES, 'brands.json')).items
    .map((b) => ({ slug: b.slug, en: text(b.name).en || b.slug, ar: text(b.name).ar || text(b.name).en }))
    .filter((b) => !ONLY.length || ONLY.includes(b.slug));
  const models = require(path.join(TEMPLATES, 'models.json')).items;

  if (!brands.length) {
    log('No brands matched CAR_IMAGES_BRANDS.');
    process.exit(1);
  }

  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).items ?? [];
  } catch {
    previous = [];
  }

  log(`Car images · ${brands.length} brands · ${PER_BRAND} exterior + ${PER_BRAND} interior each\n`);

  const plan = brands.map((b) => {
    const own = models
      .filter((m) => m.brand_slug === b.slug)
      .map((m) => ({ slug: m.slug, en: text(m.name).en, ar: text(m.name).ar || text(m.name).en }))
      .filter((m) => m.en);
    return { brand: { ...b, re: brandRe(b) }, models: own.map((m) => ({ ...m, re: modelRe(m) })) };
  });

  /*
   * One brand at a time: search, choose, download, WRITE — then the next.
   *
   * The first version ran every search before downloading anything, so
   * car-images.json stayed empty, and the Templates card hidden, for the whole
   * half hour the searches take. Now the card appears after the first brand
   * and grows as the run goes.
   */
  const built = [];
  const summary = [];
  const processed = new Set();

  for (const p of plan) {
    const rows = [];
    const runQueries = async (queries) => {
      for (const q of queries) {
        const found = await search(q);
        if (found) rows.push(...found);
      }
    };

    // One search per model, and one for the brand's interiors.
    const queries = p.models.filter(searchable).slice(0, 10).map((m) => `${p.brand.en} ${m.en}`);
    if (!queries.length) queries.push(`${p.brand.en} car`);
    queries.push(`${p.brand.en} interior`);
    log(`  ${p.brand.en}: ${queries.length} searches`);
    await runQueries(queries);

    const candidatesOf = () => {
      const seen = new Set();
      return rows
        .filter((r) => (seen.has(r.url) ? false : (seen.add(r.url), true)))
        .map((r) => classify(r, p.brand, p.models))
        .filter(Boolean);
    };

    // Still short of interiors: a few model-specific interior searches.
    if (candidatesOf().filter((c) => c.category === 'interior').length < PER_BRAND) {
      await runQueries(
        p.models.filter(searchable).slice(0, 3).map((m) => `${p.brand.en} ${m.en} interior`)
      );
    }

    const candidates = candidatesOf();

    const exterior = await collect(
      chooseExterior(candidates.filter((c) => c.category === 'exterior'), PER_BRAND + BACKUPS),
      p.brand, 'exterior', PER_BRAND
    );
    const interior = await collect(
      chooseInterior(candidates.filter((c) => c.category === 'interior'), PER_BRAND + BACKUPS),
      p.brand, 'interior', PER_BRAND
    );

    built.push(...exterior, ...interior);
    summary.push({
      brand: p.brand.en,
      exterior: exterior.length,
      colours: new Set(exterior.map((i) => i.color).filter(Boolean)).size,
      interior: interior.length,
    });

    processed.add(p.brand.slug);
    log(`    → ${exterior.length} exterior, ${interior.length} interior`);

    // Written after every brand, so a run that dies keeps what it finished.
    const items = [...previous.filter((i) => !processed.has(i.brand_slug)), ...built];
    fs.writeFileSync(
      OUT_JSON,
      JSON.stringify(
        {
          key: 'car-images',
          table: 'media_assets',
          source: 'Openverse (commercial-use licences: Wikimedia Commons, Flickr)',
          built_at: new Date().toISOString(),
          items,
        },
        null,
        2
      ),
      'utf8'
    );
  }

  console.table(summary);

  /*
   * Files on disk that the template no longer lists — photos downloaded by an
   * earlier run and rejected by this one. Only inside the brands this run
   * rebuilt, so a CAR_IMAGES_BRANDS run never touches the others.
   */
  const listed = new Set(
    JSON.parse(fs.readFileSync(OUT_JSON, 'utf8')).items.map((i) => path.join(ASSETS, ...i.file.split('/')))
  );
  let pruned = 0;
  for (const slug of processed) {
    for (const category of ['exterior', 'interior']) {
      const dir = path.join(ASSETS, 'car-images', slug, category);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        if (!listed.has(file)) {
          fs.unlinkSync(file);
          pruned += 1;
        }
      }
    }
  }
  if (pruned) log(`  removed ${pruned} downloaded photos that are no longer in the template`);

  const short = summary.filter((s) => s.exterior < PER_BRAND || s.interior < PER_BRAND);
  log(
    `\n✓ ${built.length} photos for ${summary.length} brands · ${downloaded} downloaded this run ` +
      `(${(bytes / 1048576).toFixed(1)} MB) · ${searches} searches used` +
      (quotaLeft !== null ? ` · ${quotaLeft} left today` : '')
  );
  if (short.length) {
    log(`  ${short.length} brands have fewer than ${PER_BRAND} in a category — free-licence photos of them are scarce.`);
  }
  if (quotaHit || searches >= MAX_SEARCHES) {
    log('  The search quota ran out before every search ran. Run this again tomorrow: finished searches are cached.');
  }
})();
