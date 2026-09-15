/**
 * Publishes the "Car images" template: compresses every photo and uploads the
 * master set ONCE to the shared bucket.
 *
 * Run it after build-car-images-template.cjs, from the repo root:
 *
 *   node src/marketplace/db/publish-car-images-template.cjs
 *
 * ── Why this step exists ────────────────────────────────────────────────────
 *
 * The build downloads photos into public/catalog-templates/car-images/. That
 * folder is a STAGING area, not where the photos live:
 *
 *   · Size. The downloads average about 400 KB (Flickr originals, PNGs). Kept
 *     in public/ they would be 150–200 MB in the repo and in every deploy, and
 *     each showroom that installs would copy the same weight into storage —
 *     which on the free Supabase plan (1 GB) is a handful of showrooms.
 *
 *   · Reach. The install runs on the server, and a serverless deployment does
 *     not reliably ship public/ to server code. Files in the bucket are there
 *     from any server.
 *
 * So each photo is re-encoded here as WebP, at most 1200px wide, stepping the
 * quality down until it is under 150 KB, and uploaded to
 * marketplace-media/templates/car-images/<brand>/<category>/<hash>.webp. The
 * item in car-images.json gains `storage_path`, `url` and `bytes`, and the
 * install (src/marketplace/media/carImagesTemplate.js) copies from there into
 * each showroom's own bucket.
 *
 * Nothing is registered in media_assets: the master set belongs to no showroom
 * and appears in nobody's library. Only the per-showroom copies do.
 *
 * Safe to run again: an item that already has a storage_path is skipped, so a
 * rerun after building more brands publishes only the new photos. Set
 * CAR_IMAGES_REPUBLISH=1 to re-encode and re-upload everything.
 *
 * Options (environment):
 *   CAR_IMAGES_WIDTH=1200     longest allowed width, px
 *   CAR_IMAGES_QUALITY=70     starting WebP quality
 *   CAR_IMAGES_MAX_KB=150     step the quality down until a file fits this
 */

'use strict';

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

const ROOT = process.cwd();
const JSON_FILE = path.join(ROOT, 'src', 'marketplace', 'catalog-templates', 'car-images.json');
const ASSETS = path.join(ROOT, 'public', 'catalog-templates');
const BUCKET = 'marketplace-media';
const PREFIX = 'templates/car-images';

const WIDTH = Number(process.env.CAR_IMAGES_WIDTH) || 1200;
const QUALITY = Number(process.env.CAR_IMAGES_QUALITY) || 70;
const MAX_KB = Number(process.env.CAR_IMAGES_MAX_KB) || 150;
const MIN_QUALITY = 40;
const REPUBLISH = process.env.CAR_IMAGES_REPUBLISH === '1';
const CONCURRENCY = 4;

const log = (...args) => console.log(...args);
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

/** .env first, then .env.local over it — the same precedence Next uses. */
function loadEnv() {
  for (const name of ['.env', '.env.local']) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, name), 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

/**
 * WebP, no wider than WIDTH, under MAX_KB where the quality floor allows.
 *
 * rotate() applies the EXIF orientation before the metadata is dropped, or a
 * phone photo shot in portrait arrives on its side.
 */
async function compress(input) {
  let quality = QUALITY;
  for (;;) {
    const out = await sharp(input)
      .rotate()
      .resize({ width: WIDTH, withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toBuffer();
    if (out.length <= MAX_KB * 1024 || quality <= MIN_QUALITY) return { out, quality };
    quality -= 10;
  }
}

(async () => {
  loadEnv();
  const url = process.env.MARKETPLACE_SUPABASE_URL;
  const key = process.env.MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    log('MARKETPLACE_SUPABASE_URL and MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY are required (.env.local).');
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const template = JSON.parse(fs.readFileSync(JSON_FILE, 'utf8'));
  const items = template.items ?? [];
  const save = () => fs.writeFileSync(JSON_FILE, JSON.stringify(template, null, 2), 'utf8');

  const todo = items.filter((item) => REPUBLISH || !item.storage_path);
  log(`Publishing car images · ${todo.length} to compress and upload · ${items.length - todo.length} already published\n`);

  let before = 0;
  let after = 0;
  let published = 0;
  const missing = new Set();
  const failed = [];

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    await Promise.all(
      todo.slice(i, i + CONCURRENCY).map(async (item) => {
        const local = path.resolve(ASSETS, item.file ?? '');
        if (!local.startsWith(path.resolve(ASSETS) + path.sep) || !fs.existsSync(local)) {
          missing.add(item);
          return;
        }

        try {
          const input = fs.readFileSync(local);
          const { out } = await compress(input);

          const storagePath = `${PREFIX}/${item.brand_slug}/${item.category}/${path.parse(item.file).name}.webp`;
          const { error } = await db.storage.from(BUCKET).upload(storagePath, out, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: true,
          });
          if (error) throw new Error(error.message);

          item.storage_path = storagePath;
          item.url = db.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
          item.bytes = out.length;

          before += input.length;
          after += out.length;
          published += 1;
        } catch (err) {
          failed.push(`${item.file}: ${err.message}`);
        }
      })
    );

    // Saved as it goes, so an interrupted run keeps what it uploaded.
    save();
    process.stdout.write(`\r  ${Math.min(i + CONCURRENCY, todo.length)} / ${todo.length}`);
  }
  log('\n');

  // A photo with no local file and nothing in the bucket cannot be installed.
  // Dropped from the template so the card's count is what a showroom gets.
  if (missing.size) {
    template.items = items.filter((item) => !missing.has(item) || item.storage_path);
    save();
    log(`  ${missing.size} photos had no local file and were dropped from the template`);
  }
  for (const line of failed.slice(0, 10)) log(`  ! ${line}`);
  if (failed.length > 10) log(`  ! …and ${failed.length - 10} more`);

  const all = template.items.filter((item) => item.bytes);
  const total = all.reduce((sum, item) => sum + item.bytes, 0);
  log(
    `✓ ${published} published this run` +
      (published ? ` · ${kb(before)} → ${kb(after)} (${((1 - after / before) * 100).toFixed(0)}% smaller)` : '') +
      `\n  Template: ${all.length} photos · ${(total / 1048576).toFixed(1)} MB · average ${kb(total / Math.max(all.length, 1))}` +
      ` — that is what each showroom's install adds to storage.`
  );
  if (failed.length) {
    log('  Some uploads failed. Run this again: published photos are skipped, the rest retried.');
    process.exit(1);
  }
})();
