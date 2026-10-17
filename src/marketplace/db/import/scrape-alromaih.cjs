#!/usr/bin/env node
/**
 * Pulls cars off alromaihcars.com into one JSON file.
 *
 *   node src/marketplace/db/import/scrape-alromaih.cjs [count]
 *
 * Reads NOTHING from this app and writes NOTHING to any database — it only
 * fetches and saves a file. Importing that file is post-cars.cjs, deliberately
 * a second step: a scrape that writes straight into a database gives you no
 * chance to look at what it got before it is live.
 *
 * ── Why the site's own API rather than HTML ────────────────────────────────
 *
 * alromaih-web calls /api/graphql/alromaih-cars/* and that route is public and
 * returns JSON — the same data its own pages render. Parsing the rendered HTML
 * instead would mean re-deriving structure the server already hands over, and
 * breaking on the next CSS change.
 *
 * Two calls per car, because the list and the detail are different documents:
 * the listing carries ids and prices, the detail carries the SEO block, the
 * specifications with their icons, the media and the variants.
 */

const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://www.alromaihcars.com';
const OUT = path.join(__dirname, 'alromaih-cars.json');

/** Polite, and it makes a 429 or a blip survivable rather than fatal. */
const GAP_MS = 350;
const RETRIES = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'sauda-import/1.0' },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (attempt >= RETRIES) throw err;
    await sleep(GAP_MS * attempt * 4);
    return get(url, attempt + 1);
  }
}

async function main() {
  const want = Number(process.argv[2]) || 20;

  console.log(`Listing ${want} cars…`);
  const list = await get(`${BASE}/api/graphql/alromaih-cars/listing?limit=${want}`);
  const rows = list?.data ?? [];
  if (!rows.length) throw new Error('The listing endpoint returned no cars.');

  /* The colour list is fetched once rather than per car: a variant carries a
     colorId and nothing else, so without this every colour imports as an id
     nobody can read. */
  console.log('Fetching the colour catalog…');
  let colors = [];
  try {
    const c = await get(`${BASE}/api/graphql/car-colors?limit=500`);
    colors = c?.data ?? [];
  } catch (err) {
    console.warn(`  colours unavailable (${err.message}) — variants will carry ids only.`);
  }

  const cars = [];
  for (const [i, row] of rows.entries()) {
    const label = `${i + 1}/${rows.length} ${row.slug}`;
    try {
      const detail = await get(`${BASE}/api/graphql/alromaih-cars/${row.slug}`);
      const car = detail?.data;
      if (!car) throw new Error('no data in detail response');

      cars.push(car);
      console.log(
        `  ${label} — ${car.specifications?.length ?? 0} specs, ` +
        `${car.media?.length ?? 0} media, ${car.variants?.length ?? 0} variant(s)`
      );
    } catch (err) {
      // One bad car must not lose the other nineteen.
      console.warn(`  ${label} — SKIPPED (${err.message})`);
    }
    await sleep(GAP_MS);
  }

  const out = {
    source: BASE,
    scrapedAt: new Date().toISOString(),
    count: cars.length,
    colors,
    cars,
  };

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');

  const specs = cars.reduce((n, c) => n + (c.specifications?.length ?? 0), 0);
  const media = cars.reduce((n, c) => n + (c.media?.length ?? 0), 0);
  const size = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);

  console.log(`\nWrote ${OUT}`);
  console.log(`  ${cars.length} cars, ${specs} specifications, ${media} media, ${colors.length} colours — ${size} MB`);
}

main().catch((err) => {
  console.error(`\nFailed: ${err.message}`);
  process.exit(1);
});
