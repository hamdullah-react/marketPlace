import 'server-only';

/**
 * The "Car images" catalog template: exterior photos in different colours and
 * interior photos, per brand. Downloaded by src/marketplace/db/build-car-images-template.cjs,
 * then compressed and uploaded ONCE to the shared bucket by
 * publish-car-images-template.cjs — templates/car-images/… in marketplace-media.
 * That master set is what an install copies from; nothing is read from public/.
 *
 * ── Every showroom gets its OWN copies ──────────────────────────────────────
 *
 * The other templates share their artwork, because it backs catalog rows that
 * several showrooms point at (see catalog-templates.js). These photos back
 * nothing shared. They are raw material for a seller's own listings, so an
 * install copies every file into THAT showroom's bucket (vendor-<id>) and files
 * it under their own "Exterior" and "Interior" folders. Two showrooms that both
 * install it hold two separate sets: deleting, moving or renaming a photo in one
 * library never touches the other.
 *
 * Receipts use the same catalog_template_installs table as every template, with
 * table_name 'media_assets' and the asset's id as row_id.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { ensureVendorBucket, bucketForAsset, SHARED_BUCKET } from '@/marketplace/media/bucket';
import carImages from '@/marketplace/catalog-templates/car-images.json';

export const CAR_IMAGES_KEY = 'car-images';

const ASSETS = path.join(process.cwd(), 'public', 'catalog-templates');

const FOLDERS = {
  exterior: { name: 'Exterior', slug: 'exterior' },
  interior: { name: 'Interior', slug: 'interior' },
};

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

/** Copies at once. Each photo is ~100 KB after publishing; an install is a few hundred. */
const CONCURRENCY = 6;

const ITEMS = Array.isArray(carImages?.items) ? carImages.items : [];

/**
 * The card on the Templates tab, or null until the template has been built —
 * a card that installs nothing would be a button that lies.
 */
export function carImagesManifest() {
  if (!ITEMS.length) return null;
  const brands = new Set(ITEMS.map((i) => i.brand_slug)).size;

  return {
    key: CAR_IMAGES_KEY,
    table: 'media_assets',
    name: { ar: 'صور السيارات', en: 'Car images' },
    description: {
      ar: `صور خارجية بألوان مختلفة وصور داخلية لـ ${brands} ماركة، تُنسخ إلى مكتبة الوسائط الخاصة بك في مجلدي «Exterior» و«Interior».`,
      en: `Exterior photos in different colours and interior photos for ${brands} brands, copied into your own media library in Exterior and Interior folders.`,
    },
    note: {
      ar: 'صور بتراخيص تسمح بالاستخدام التجاري (ويكيميديا وفليكر). مصدر كل صورة وصاحبها محفوظان مع القالب.',
      en: 'Photos under licences that allow commercial use (Wikimedia, Flickr). Each photo’s author and source are kept with the template.',
    },
    needs: [],
    count: ITEMS.length,
    unit: 'images',
  };
}

/** Finds or makes one of the two folders. Null when folders are not set up (§26). */
async function ensureFolder(db, vendorId, { name, slug }) {
  const find = () =>
    db.from('media_folders').select('id, slug').eq('vendor_id', vendorId).eq('name', name).maybeSingle();

  const { data: found, error } = await find();
  if (error) return null;
  if (found) return found;

  // The slug is the bucket prefix, and it is unique per showroom.
  const { data: taken } = await db
    .from('media_folders')
    .select('slug')
    .eq('vendor_id', vendorId)
    .not('slug', 'is', null);
  const used = new Set((taken ?? []).map((r) => r.slug));
  let free = slug;
  for (let n = 2; used.has(free); n += 1) free = `${slug}-${n}`;

  const { data, error: insertError } = await db
    .from('media_folders')
    .insert({ vendor_id: vendorId, name, slug: free })
    .select('id, slug')
    .single();

  if (insertError) {
    // 23505: made a moment ago by a second install racing this one.
    if (insertError.code === '23505') return (await find()).data ?? null;
    return null;
  }
  return data;
}

/** Reads one template file, refusing any path that escapes the assets folder. */
async function readAsset(rel) {
  const abs = path.resolve(ASSETS, rel ?? '');
  if (!abs.startsWith(path.resolve(ASSETS) + path.sep)) return null;
  try {
    return await fs.readFile(abs);
  } catch {
    return null;
  }
}

/**
 * The master copy of one photo.
 *
 * From the shared bucket once the template is published — the normal case, and
 * the only one that works on a deployed server. The local staging file is a
 * fallback for a development machine that has built but not yet published.
 *
 * Storage cannot copy between buckets, so the master is downloaded and the
 * showroom's copy uploaded; at ~100 KB a photo that is the cheap part.
 */
async function readMaster(db, item) {
  if (item.storage_path) {
    const { data, error } = await db.storage.from(SHARED_BUCKET).download(item.storage_path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }
  return readAsset(item.file);
}

async function insertAssets(db, rows) {
  const select = 'id, storage_path';
  const { data, error } = await db.from('media_assets').insert(rows).select(select);
  if (!error) return data ?? [];

  // 42703: folder_id does not exist on this database yet (§26). The photos are
  // still worth having without their folder.
  if (error.code === '42703') {
    const bare = rows.map(({ folder_id: _unused, ...rest }) => rest);
    const retry = await db.from('media_assets').insert(bare).select(select);
    if (!retry.error) return retry.data ?? [];
  }
  console.error('[car-images] insert:', error.message);
  return [];
}

/**
 * Copies every photo into this showroom's own bucket and library.
 *
 * Safe to run again: a photo already in THIS showroom's library is skipped, so
 * "Install missing" after a template rebuild adds only the new ones.
 */
export async function installCarImages(db, vendorId) {
  if (!ITEMS.length) return { ok: false, error: 'NOTHING_TO_INSTALL' };

  const bucket = await ensureVendorBucket(db, vendorId);
  const [exterior, interior] = await Promise.all([
    ensureFolder(db, vendorId, FOLDERS.exterior),
    ensureFolder(db, vendorId, FOLDERS.interior),
  ]);
  const folders = { exterior, interior };

  /*
   * media_assets.storage_path is unique across ALL showrooms, while the object
   * key only has to be unique inside one bucket. The showroom's id in the file
   * name keeps the first true when a second showroom installs the same photo.
   */
  const owner = String(vendorId).replace(/-/g, '').slice(0, 12);

  const { data: mine, error: readError } = await db
    .from('media_assets')
    .select('id, storage_path')
    .eq('vendor_id', vendorId)
    .contains('tags', [CAR_IMAGES_KEY]);
  if (readError) return { ok: false, error: readError.message };

  const have = new Map((mine ?? []).map((r) => [r.storage_path, r.id]));

  const plan = ITEMS.map((item) => {
    const folder = folders[item.category] ?? null;
    const prefix = folder?.slug ?? FOLDERS[item.category]?.slug ?? CAR_IMAGES_KEY;
    // The published master is .webp; the staging file keeps its download type.
    const { name, ext } = path.parse(item.storage_path ?? item.file ?? '');
    const extension = ext.replace('.', '').toLowerCase();
    return {
      item,
      folder,
      extension,
      storagePath: `${prefix}/${item.brand_slug}/${name}-${owner}.${extension}`,
    };
  });

  const todo = plan.filter((p) => !have.has(p.storagePath));
  const skipped = plan.length - todo.length;
  const counts = { exterior: 0, interior: 0 };
  let failed = 0;
  const assetIds = [...have.values()];

  for (let i = 0; i < todo.length; i += CONCURRENCY) {
    const batch = todo.slice(i, i + CONCURRENCY);

    const rows = (
      await Promise.all(
        batch.map(async ({ item, folder, extension, storagePath }) => {
          const body = await readMaster(db, item);
          if (!body || !MIME[extension]) return null;

          const { error } = await db.storage.from(bucket).upload(storagePath, body, {
            contentType: MIME[extension],
            upsert: true,
          });
          if (error) return null;

          const { data: pub } = db.storage.from(bucket).getPublicUrl(storagePath);
          return {
            vendor_id: vendorId,
            kind: 'photo',
            storage_path: storagePath,
            url: pub?.publicUrl ?? '',
            filename: path.basename(storagePath),
            mime_type: MIME[extension],
            size_bytes: body.length,
            alt: item.alt ?? null,
            tags: [
              CAR_IMAGES_KEY,
              item.category,
              item.brand_slug,
              ...(item.model_slug ? [item.model_slug] : []),
              ...(item.color ? [item.color] : []),
            ],
            folder_id: folder?.id ?? null,
          };
        })
      )
    ).filter(Boolean);

    const inserted = rows.length ? await insertAssets(db, rows) : [];
    failed += batch.length - inserted.length;

    const category = new Map(batch.map((p) => [p.storagePath, p.item.category]));
    for (const row of inserted) {
      assetIds.push(row.id);
      const c = category.get(row.storage_path);
      if (c in counts) counts[c] += 1;
    }
  }

  // Receipts for every photo in this library, new or already there.
  for (let i = 0; i < assetIds.length; i += 500) {
    const receipts = assetIds.slice(i, i + 500).map((row_id) => ({
      template: CAR_IMAGES_KEY,
      table_name: 'media_assets',
      row_id,
      vendor_id: vendorId,
    }));
    const { error } = await db
      .from('catalog_template_installs')
      .upsert(receipts, { onConflict: 'vendor_id, table_name, row_id' });
    if (error) return { ok: false, error: `copied, but not recorded: ${error.message}` };
  }

  return {
    ok: true,
    photos: { ...counts, skipped, failed },
    folders: Object.values(folders).filter(Boolean).length,
  };
}

/**
 * Every photo URL this showroom's listings use, or null if that cannot be read.
 * Null stops the removal: better to delete nothing than a live car's photos.
 */
async function urlsInUse(db, vendorId) {
  const used = new Set();
  const collect = (media) => {
    for (const m of Array.isArray(media) ? media : []) if (m?.url) used.add(m.url);
  };

  const { data: listings, error } = await db.from('listings').select('id, media').eq('vendor_id', vendorId);
  if (error) return null;
  (listings ?? []).forEach((l) => collect(l.media));

  const ids = (listings ?? []).map((l) => l.id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: variantError } = await db
      .from('listing_variants')
      .select('media')
      .in('listing_id', ids.slice(i, i + 200));
    if (variantError) return null;
    (data ?? []).forEach((v) => collect(v.media));
  }
  return used;
}

/**
 * Deletes this showroom's copies — files and library rows — except any photo a
 * listing or colour variant is using. Other showrooms' copies are untouched:
 * every read here is scoped to this vendor.
 */
export async function removeCarImages(db, vendorId) {
  const { data: receipts, error } = await db
    .from('catalog_template_installs')
    .select('id, row_id')
    .eq('template', CAR_IMAGES_KEY)
    .eq('vendor_id', vendorId);
  if (error) return { ok: false, error: error.message };
  if (!receipts?.length) return { ok: false, error: 'NOT_INSTALLED' };

  const assets = [];
  const ids = receipts.map((r) => r.row_id);
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error: readError } = await db
      .from('media_assets')
      .select('id, vendor_id, storage_path, url, folder_id')
      .eq('vendor_id', vendorId)
      .in('id', ids.slice(i, i + 200));
    if (readError) return { ok: false, error: readError.message };
    assets.push(...(data ?? []));
  }

  const used = await urlsInUse(db, vendorId);
  if (!used) return { ok: false, error: 'Could not check which photos your listings use. Nothing was removed.' };

  const free = assets.filter((a) => !used.has(a.url));
  const kept = assets.filter((a) => used.has(a.url));

  // Bucket first, then the library rows — the same order as template artwork.
  let removed = 0;
  for (let i = 0; i < free.length; i += 100) {
    const batch = free.slice(i, i + 100);
    const { error: storageError } = await db.storage
      .from(bucketForAsset(batch[0]))
      .remove(batch.map((a) => a.storage_path));
    if (storageError) continue;

    const { error: deleteError } = await db
      .from('media_assets')
      .delete()
      .eq('vendor_id', vendorId)
      .in('id', batch.map((a) => a.id));
    if (!deleteError) removed += batch.length;
  }

  // A kept photo keeps its receipt, so the card still says what is left.
  const keptIds = new Set(kept.map((a) => a.id));
  const stale = receipts.filter((r) => !keptIds.has(r.row_id)).map((r) => r.id);
  for (let i = 0; i < stale.length; i += 200) {
    await db.from('catalog_template_installs').delete().in('id', stale.slice(i, i + 200));
  }

  // The two folders go only if nothing is left in them.
  for (const { name } of Object.values(FOLDERS)) {
    const { data: folder } = await db
      .from('media_folders')
      .select('id')
      .eq('vendor_id', vendorId)
      .eq('name', name)
      .maybeSingle();
    if (!folder) continue;

    const { count } = await db
      .from('media_assets')
      .select('id', { count: 'exact', head: true })
      .eq('folder_id', folder.id);
    if (count === 0) await db.from('media_folders').delete().eq('id', folder.id).eq('vendor_id', vendorId);
  }

  return { ok: true, removed, inUse: kept.length, files: removed };
}
