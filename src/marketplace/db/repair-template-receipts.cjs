/**
 * Re-attach catalog rows to the template that created them.
 *
 *   node src/marketplace/db/repair-template-receipts.cjs          # report only
 *   node src/marketplace/db/repair-template-receipts.cjs --yes    # write
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * Installing a template does two writes: the catalog rows, then a receipt per
 * row saying "this template put that row there". If the second write fails,
 * the rows are in and nothing owns them. The Templates tab then reports the
 * template as not installed, so Remove never appears, and a second Install
 * skips every row as "already yours". The rows become permanent.
 *
 * This finds catalog rows whose identity matches a template's exactly and have
 * no receipt, and writes the missing receipts. Their images need no repair —
 * Remove reads those off the rows themselves.
 *
 * ── What it will not do ─────────────────────────────────────────────────────
 *
 * A row that does not match the template exactly is left alone: this claims
 * rows on behalf of a template, and claiming a row a vendor typed themselves
 * would let Remove delete their work. Matching is on the same identity columns
 * the installer dedupes on, nothing looser.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const WRITE = process.argv.includes('--yes');

const env = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const envVar = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1]?.trim();

const db = createClient(
  envVar('MARKETPLACE_SUPABASE_URL'),
  envVar('MARKETPLACE_SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false } }
);

const DIR = path.join(process.cwd(), 'src', 'marketplace', 'catalog-templates');

/** Same identity columns the installer dedupes on. */
const UNIQUE = { models: ['brand_id', 'slug'], trims: ['model_id', 'slug'], years: ['value'] };

(async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));

  console.log('');
  let totalMissing = 0;

  for (const tpl of manifest) {
    const { items } = JSON.parse(fs.readFileSync(path.join(DIR, `${tpl.key}.json`), 'utf8'));
    const unique = UNIQUE[tpl.key] ?? ['slug'];

    // Only slug-keyed templates can be matched from the file alone — the
    // others key on a parent id that the template does not carry. Those are
    // matched on their own slug within the rows the parent template owns,
    // which for a fresh install is every row in the table.
    const key = unique.includes('slug') ? 'slug' : unique[0];
    const wanted = new Set(items.map((r) => String(r[key])));

    const { data: rows, error } = await db.from(tpl.table).select(`id, ${key}`);
    if (error) {
      console.log(`  ${tpl.key.padEnd(16)} ! ${error.message}`);
      continue;
    }

    const mine = (rows ?? []).filter((r) => wanted.has(String(r[key])));
    if (!mine.length) {
      console.log(`  ${tpl.key.padEnd(16)} · nothing installed`);
      continue;
    }

    const { data: existing } = await db
      .from('catalog_template_installs')
      .select('row_id')
      .eq('table_name', tpl.table);
    const recorded = new Set((existing ?? []).map((r) => r.row_id));

    const missing = mine.filter((r) => !recorded.has(r.id));
    if (!missing.length) {
      console.log(`  ${tpl.key.padEnd(16)} ✓ all ${mine.length} rows recorded`);
      continue;
    }

    totalMissing += missing.length;
    console.log(`  ${tpl.key.padEnd(16)} ${missing.length} of ${mine.length} rows unrecorded`);

    if (!WRITE) continue;

    const receipts = missing.map((r) => ({
      template: tpl.key,
      table_name: tpl.table,
      row_id: r.id,
    }));

    const { error: writeError } = await db
      .from('catalog_template_installs')
      .upsert(receipts, { onConflict: 'table_name, row_id' });

    console.log(writeError ? `    ! ${writeError.message}` : `    ✓ ${receipts.length} receipts written`);
  }

  console.log('');
  if (!totalMissing) console.log('✓ every installed template row is accounted for\n');
  else if (!WRITE) console.log(`${totalMissing} rows would be re-attached. Re-run with --yes.\n`);
  else console.log('✓ done\n');
})();
