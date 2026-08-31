/**
 * Empty the marketplace-media bucket and the library that indexes it.
 *
 *   node src/marketplace/db/wipe-media.cjs --yes
 *
 * ── What goes ───────────────────────────────────────────────────────────────
 *
 *   every object in the bucket   brand logos, spec icons, colour swatches,
 *                                car photos, vendor logos and banners
 *   every media_assets row       the library index
 *
 * ── Both halves, or neither ─────────────────────────────────────────────────
 *
 * Deleting the files without the rows leaves a media library full of broken
 * thumbnails that a seller can still pick for a listing; deleting the rows
 * without the files leaves megabytes nobody can reach or bill for. They are one
 * operation.
 *
 * ── What this does NOT touch ────────────────────────────────────────────────
 *
 * Any column still holding a URL — car_brands.logo_url, spec_attributes'
 * icons, listings.media. Those point at files that are about to stop existing,
 * so run this alongside wipe-catalog.cjs rather than on a live catalog. It
 * reports anything left pointing at nothing so the state is never a surprise.
 *
 * Refuses to run without --yes.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

if (!process.argv.includes('--yes')) {
  console.error(
    '\nThis deletes EVERY uploaded file — logos, icons and car photos alike.\n' +
    '\n  node src/marketplace/db/wipe-media.cjs --yes\n'
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

const BUCKET = 'marketplace-media';

/**
 * Every object under a prefix, depth first.
 *
 * Supabase Storage has no recursive list: `list(prefix)` returns the immediate
 * children, and a folder is an entry with no `id`. So the walk is manual, and
 * paged — the default page size is 100, which would have quietly stopped at the
 * first hundred photos in one vendor's gallery.
 */
async function walk(prefix = '') {
  const found = [];
  let offset = 0;

  for (;;) {
    const { data, error } = await db.storage
      .from(BUCKET)
      .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });

    if (error) throw new Error(`list ${prefix || '/'} — ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A folder has no id. Anything with one is a real object.
      if (entry.id) found.push(full);
      else found.push(...(await walk(full)));
    }

    if (data.length < 100) break;
    offset += data.length;
  }

  return found;
}

(async () => {
  console.log('\n── Wiping the media bucket ───────────────────────────────\n');

  const paths = await walk();
  console.log(`  ${paths.length} objects found`);

  let deleted = 0;
  // Supabase caps a remove() call; 100 at a time keeps every request small
  // enough to succeed and to be retried on its own if it does not.
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await db.storage.from(BUCKET).remove(batch);
    if (error) {
      console.log(`  ! batch at ${i} — ${error.message}`);
      continue;
    }
    deleted += batch.length;
    process.stdout.write(`\r  ${deleted}/${paths.length} deleted`);
  }
  if (paths.length) process.stdout.write('\n');

  // ── the library ──
  const { count: rows } = await db
    .from('media_assets').select('id', { count: 'exact', head: true });
  const { error: rowError } = await db
    .from('media_assets').delete().not('id', 'is', null);
  console.log(rowError ? `  ! media_assets — ${rowError.message}` : `  ✓ media_assets ${rows ?? 0} rows deleted`);

  // ── what is now pointing at nothing ──
  const dangling = [];
  for (const [table, column] of [
    ['car_brands', 'logo_url'],
    ['car_colors', 'image_url'],
    ['spec_attributes', 'attribute_icon_url'],
    ['spec_attributes', 'category_icon_url'],
    ['vendors', 'logo_url'],
  ]) {
    const { count, error } = await db
      .from(table).select('id', { count: 'exact', head: true }).not(column, 'is', null);
    if (!error && count) dangling.push(`${table}.${column} (${count})`);
  }

  console.log('');
  if (dangling.length) {
    console.log('  ⚠ still referencing deleted files:');
    for (const d of dangling) console.log(`      ${d}`);
    console.log('    Run wipe-catalog.cjs, or re-install the templates to replace them.');
  } else {
    console.log('  · nothing left referencing a deleted file');
  }

  console.log(`\n✓ ${deleted} objects removed from ${BUCKET}\n`);
})();
