/**
 * Empty the catalog and every listing that hangs off it.
 *
 *   node src/marketplace/db/wipe-catalog.cjs --yes
 *
 * ── What goes ───────────────────────────────────────────────────────────────
 *
 *   listings and everything under them  — variants, specs
 *   the catalog                         — brands, models, trims, years,
 *                                         colours, option kinds and options,
 *                                         spec definitions and their values
 *   the template install receipts       — nothing is installed any more
 *
 * ── What stays ──────────────────────────────────────────────────────────────
 *
 *   vendors      a listing needs one (vendor_id is `on delete restrict`)
 *   categories   same (category_id is NOT NULL)
 *   media_assets the uploaded files and their library rows. Deleting the rows
 *                would orphan megabytes in the bucket, and the brand logos are
 *                referenced by the catalog TEMPLATES — wiping them would mean
 *                re-running the scraper before anything could be installed.
 *
 * ── Order matters ───────────────────────────────────────────────────────────
 *
 * Children before parents, all the way down. The foreign keys are mostly
 * `on delete restrict`, which is the point: it stops a stray delete cascading
 * a car's brand out from under it. Here that means the order below is not a
 * style choice — get it wrong and the delete simply fails.
 *
 * Refuses to run without --yes.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

if (!process.argv.includes('--yes')) {
  console.error(
    '\nThis deletes every listing and the whole catalog.\n' +
    '\n  node src/marketplace/db/wipe-catalog.cjs --yes\n'
  );
  process.exit(1);
}

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const envVar = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const db = createClient(
  envVar('MARKETPLACE_SUPABASE_URL'),
  envVar('MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

// Children first. Each entry is [table, id column] — Postgres has no
// "delete everything" without a where clause through PostgREST, so each delete
// is filtered on `id is not null`, which every row satisfies.
const ORDER = [
  ['listing_specs', 'id'],
  ['listing_variants', 'id'],
  ['listings', 'id'],

  ['trim_specs', 'id'],
  ['spec_attribute_values', 'id'],
  ['spec_attributes', 'id'],

  ['car_attributes', 'id'],
  ['car_attribute_kinds', 'slug'],

  ['car_trims', 'id'],
  ['car_models', 'id'],
  ['car_brands', 'id'],
  ['car_years', 'id'],
  ['car_colors', 'id'],

  ['catalog_template_installs', 'id'],
];

(async () => {
  console.log('\n── Wiping catalog + listings ─────────────────────────────\n');

  for (const [table, idColumn] of ORDER) {
    const { count: before } = await db
      .from(table).select(idColumn, { count: 'exact', head: true });

    const { error } = await db.from(table).delete().not(idColumn, 'is', null);

    if (error) {
      // A table that does not exist yet is not a failure — schema.sql may not
      // have been re-run for the newest one.
      const missing = /does not exist|schema cache/i.test(error.message);
      console.log(`  ${missing ? '·' : '!'} ${table.padEnd(28)} ${missing ? 'not present' : error.message}`);
      continue;
    }

    console.log(`  ✓ ${table.padEnd(28)} ${before ?? 0} deleted`);
  }

  // What survived, so the report is what IS rather than what was asked for.
  console.log('');
  for (const table of ['vendors', 'categories', 'media_assets']) {
    const { count } = await db.from(table).select('id', { count: 'exact', head: true });
    console.log(`  · ${table.padEnd(28)} ${count ?? 0} kept`);
  }

  console.log('\n✓ Empty. Install what you need from Catalog → Templates.\n');
})();
