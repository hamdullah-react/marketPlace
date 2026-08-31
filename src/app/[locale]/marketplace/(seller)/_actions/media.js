'use server';

import { revalidatePath } from 'next/cache';
import { vendorForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getMediaFolders } from '@/marketplace/db/queries/media';
import { ensureVendorBucket, vendorBucket, bucketForAsset } from '@/marketplace/media/bucket';

/**
 * "The library changed" — nothing more.
 *
 * ── Why this exists at all ──────────────────────────────────────────────────
 *
 * Uploading and deleting go through /api/marketplace/upload, a ROUTE HANDLER
 * called with fetch(). That is the right shape for a file transfer — a server
 * action would have to buffer the whole thing through a React payload — but it
 * has one consequence nobody notices until they hit it: a route handler cannot
 * touch the client router cache. So a photo added on one page was still
 * missing from the picker on another until the seller pressed reload, and a
 * cleared logo went on showing itself in Settings.
 *
 * revalidatePath called from a SERVER ACTION is the mechanism that fixes it:
 * per next/dist/docs/.../revalidatePath.md it updates the page you are on and
 * makes every previously visited page re-render when you navigate back to it.
 * That is exactly the complaint — the OTHER tab of the dashboard is stale.
 *
 * So the upload keeps its route handler and calls this afterwards. It moves no
 * data and returns nothing; it exists to say when.
 *
 * ── Members only ────────────────────────────────────────────────────────────
 *
 * It changes nothing, so the worst a stranger could do is make some pages
 * re-render. Still guarded: an unauthenticated endpoint whose whole job is to
 * discard caches is a free way to make the site do work.
 */
export async function mediaChanged() {
  const { vendorId, error } = await vendorForAction();
  if (error || !vendorId) return { ok: false };

  /**
   * Every page that renders the library or something chosen out of it.
   *
   * The storefront is in the list because its logo and cover are library URLs
   * (see (browse)/vendors/[slug]/_actions/photos.js) and a deleted asset now
   * clears them — so the page it disappears from has to be told as well.
   */
  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  revalidatePath('/[locale]/marketplace/seller/settings', 'page');
  revalidatePath('/[locale]/marketplace/seller/catalog', 'page');
  revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');

  return { ok: true };
}

/* ── Folders ──────────────────────────────────────────────────────────────────
   The seller's own shelves in the library (schema.sql §26). Make one, rename
   it, delete it, and put a file on one — by moving it or by copying it.

   Plain arguments rather than (prevState, formData): none of these is a form —
   they are a tab, a rename box and a menu on a thumbnail — and threading a
   FormData through an icon button is ceremony around two strings.

   Every one re-derives the showroom from the SESSION and refuses an id that is
   not the caller's. `vendorForAction` falls back to the caller's first showroom
   when the requested one is not theirs, which is a kindness on a dashboard and
   a defect here: it would file another showroom's photo into this one's folder.
   -------------------------------------------------------------------------- */

const MAX_NAME = 40;

/** The showroom this call may act for, or null. */
async function scope(wanted) {
  const { vendorId, error } = await vendorForAction(wanted || null);
  if (error || !vendorId) return null;
  if (wanted && vendorId !== wanted) return null;
  return vendorId;
}

const clean = (name) => String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/**
 * A storage-safe path segment for the folder.
 *
 * A storage key is a URL path, so it has to be ASCII — and a showroom naming
 * its shelves "صور خارجية" and "صور داخلية" would otherwise get two folders
 * that both reduce to nothing. When the name leaves nothing behind, the segment
 * falls back to a numbered one; either way the DATABASE holds the real name and
 * this is only where the files sit.
 */
async function folderSlug(db, vendorId, name) {
  const base =
    clean(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'folder';

  const { data: taken } = await db
    .from('media_folders')
    .select('slug')
    .eq('vendor_id', vendorId)
    .not('slug', 'is', null);

  const used = new Set((taken ?? []).map((r) => r.slug));
  if (!used.has(base)) return base;

  for (let n = 2; n < 100; n += 1) {
    if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * The one-pixel PNG that makes an empty folder VISIBLE in the bucket.
 *
 * Storage has no folders — a "folder" is a shared key prefix, so an empty one
 * does not exist and a seller who opens their bucket after making "Exteriors"
 * finds nothing there. The Supabase dashboard solves this with a placeholder
 * object and so does this.
 *
 * A PNG rather than an empty file because the bucket's allowed_mime_types is
 * images only (§24) — that restriction is what stops the public bucket becoming
 * someone's file host, so the placeholder works within it rather than around it.
 *
 * NOT named `.emptyFolderPlaceholder`, which is what the Supabase dashboard
 * uses. A key beginning with a dot is refused by this storage API, and the
 * refusal is reported as "The object exceeded the maximum allowed size" — for
 * a 70-byte file, in a bucket whose limit is 8 MB. Measured rather than
 * guessed: the identical upload under a plain name succeeds.
 */
const PLACEHOLDER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);
const PLACEHOLDER_KEY = 'keep.png';

/**
 * The showroom's shelves, for a gallery that was not handed them.
 *
 * The library PAGE reads its folders on the server and passes them down. Every
 * OTHER place the gallery opens — the settings logo, a catalog icon, a listing's
 * photos — is a dialog mounted deep inside a client tree with no folder list
 * anywhere near it. Threading one through six components so that a seller can
 * find their own photos is six places to forget it, so the gallery asks for its
 * own when it opens without any.
 *
 * Read-only and members-only. It returns an empty list rather than an error: a
 * picker with no folders is the plain three tabs, which is a working picker.
 */
export async function listMediaFolders(vendorId) {
  const vendor = await scope(vendorId);
  if (!vendor) return { ok: false, folders: [] };

  return { ok: true, folders: await getMediaFolders(vendor) };
}

export async function createMediaFolder(vendorId, name) {
  const vendor = await scope(vendorId);
  if (!vendor) return { ok: false, error: 'NOT_YOUR_STORE' };

  const label = clean(name);
  if (!label) return { ok: false, error: 'NAME_REQUIRED' };

  const db = getMarketplaceDb();
  const slug = await folderSlug(db, vendor, label);

  const { data, error } = await db
    .from('media_folders')
    .insert({ vendor_id: vendor, name: label, slug })
    .select('id, name, slug, sort_order')
    .single();

  if (error) {
    // 23505 is the one-name-per-showroom rule. A seller who types a name they
    // already have meant the folder they already have.
    if (error.code === '23505') return { ok: false, error: 'NAME_TAKEN' };
    console.error('[media-folders] create:', error.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }

  /**
   * Mirror it into the showroom's own bucket.
   *
   * Best effort, deliberately: the folder exists in the database either way,
   * and a storage hiccup must not leave the seller looking at an error for a
   * shelf that was in fact created. The prefix also appears on its own the
   * moment a file is uploaded into it.
   */
  try {
    const bucket = await ensureVendorBucket(db, vendor);
    await db.storage
      .from(bucket)
      .upload(`${slug}/${PLACEHOLDER_KEY}`, PLACEHOLDER, {
        contentType: 'image/png',
        upsert: true,
      });
  } catch (err) {
    console.warn('[media-folders] bucket folder not created:', err.message);
  }

  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  return { ok: true, error: null, folder: data };
}

/**
 * Renaming changes the NAME, never the slug.
 *
 * The slug is where the files already are. Rewriting it would mean moving every
 * object in the folder, and moving an object changes its public URL — which is
 * stored in listings, in colour variants and in the storefront's logo. A rename
 * is a label change; it must not be able to break a car's photos.
 */
export async function renameMediaFolder(vendorId, folderId, name) {
  const vendor = await scope(vendorId);
  if (!vendor) return { ok: false, error: 'NOT_YOUR_STORE' };

  const label = clean(name);
  if (!label) return { ok: false, error: 'NAME_REQUIRED' };

  const { data, error } = await getMarketplaceDb()
    .from('media_folders')
    .update({ name: label })
    .eq('id', folderId)
    .eq('vendor_id', vendor)
    .select('id, name, slug, sort_order');

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'NAME_TAKEN' };
    console.error('[media-folders] rename:', error.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }
  if (!data?.length) return { ok: false, error: 'NOT_FOUND' };

  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  return { ok: true, error: null, folder: data[0] };
}

/**
 * The folder goes; the pictures stay.
 *
 * media_assets.folder_id is ON DELETE SET NULL, so the files fall back to "no
 * folder" and are still in the library. Deleting a shelf must never mean
 * deleting what was on it — the seller is tidying, not throwing away.
 *
 * The objects stay where they are in the bucket for the same reason a rename
 * does not move them: their URLs are published. Only the placeholder is swept
 * up, and only because nothing points at it.
 */
export async function deleteMediaFolder(vendorId, folderId) {
  const vendor = await scope(vendorId);
  if (!vendor) return { ok: false, error: 'NOT_YOUR_STORE' };

  const db = getMarketplaceDb();

  const { data, error } = await db
    .from('media_folders')
    .delete()
    .eq('id', folderId)
    .eq('vendor_id', vendor)
    .select('id, slug');

  if (error) {
    console.error('[media-folders] delete:', error.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }
  if (!data?.length) return { ok: false, error: 'NOT_FOUND' };

  if (data[0].slug) {
    try {
      await db.storage.from(vendorBucket(vendor)).remove([`${data[0].slug}/${PLACEHOLDER_KEY}`]);
    } catch {
      // Nothing references it; a leftover placeholder is not worth a message.
    }
  }

  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  return { ok: true, error: null, id: folderId };
}

/**
 * CUT — the file leaves one shelf and arrives on another.
 *
 * BOTH ends are checked against the caller's showroom: the asset must be
 * theirs, and so must the folder. Shared template artwork (vendor_id null) is
 * refused rather than silently ignored — it belongs to every showroom that
 * installed the template, so one seller filing it under "Ramadan" would move it
 * for all of them.
 *
 * The stored OBJECT does not move. Its URL is what a listing, a colour variant
 * and the storefront logo all point at, and re-pathing it would 404 every one
 * of them; the folder is the database's filing, not the file's address.
 */
/**
 * The three built-in tabs are destinations too.
 *
 * Photos, Icons and Logos are the asset KIND, and until now the only way to
 * change one was to delete the file and upload it again into the right tab —
 * for a picture that is already in the bucket and possibly already used on a
 * car. A tab is a place a seller puts something, so it can be moved to like
 * any other place: a null kind leaves it alone, a value re-files it.
 *
 * Validated against the list the UI offers rather than trusted. media_kind
 * also has 'document', which nothing here creates, and an unchecked string
 * would be a 22P02 from Postgres reported to the seller as "that did not
 * work".
 */
const KINDS = ['photo', 'icon', 'logo'];

export async function moveMediaToFolder(vendorId, assetId, folderId, kind = null) {
  const vendor = await scope(vendorId);
  if (!vendor) return { ok: false, error: 'NOT_YOUR_STORE' };

  const db = getMarketplaceDb();

  if (folderId) {
    const { data: folder } = await db
      .from('media_folders')
      .select('id')
      .eq('id', folderId)
      .eq('vendor_id', vendor)
      .maybeSingle();

    if (!folder) return { ok: false, error: 'NOT_FOUND' };
  }

  if (kind && !KINDS.includes(kind)) return { ok: false, error: 'BAD_KIND' };

  const { data, error } = await db
    .from('media_assets')
    .update({ folder_id: folderId || null, ...(kind ? { kind } : {}) })
    .eq('id', assetId)
    .eq('vendor_id', vendor)
    .select('id, folder_id, kind');

  if (error) {
    console.error('[media-folders] move:', error.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }
  // Either the file is not theirs, or it is shared artwork nobody may file.
  if (!data?.length) return { ok: false, error: 'NOT_YOURS' };

  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  return {
    ok: true,
    error: null,
    id: assetId,
    folderId: data[0].folder_id,
    kind: data[0].kind,
  };
}

/**
 * COPY — the same picture on two shelves.
 *
 * A real copy: the object is duplicated in storage and a second media_assets
 * row is written. It is NOT two rows sharing one file, because deleting either
 * one removes the object and the survivor becomes a broken image — the failure
 * that has already been fixed once for storefront photos.
 *
 * Same bucket only, which is why shared template artwork is refused: it lives
 * in marketplace-media and the storage API's copy() cannot cross buckets. A
 * seller who wants a brand logo of their own can upload one.
 */
export async function copyMediaToFolder(vendorId, assetId, folderId, kind = null) {
  const vendor = await scope(vendorId);
  if (!vendor) return { ok: false, error: 'NOT_YOUR_STORE' };

  const db = getMarketplaceDb();

  const { data: asset } = await db
    .from('media_assets')
    .select('id, vendor_id, kind, storage_path, filename, mime_type, size_bytes, width, height, alt')
    .eq('id', assetId)
    .eq('vendor_id', vendor)
    .maybeSingle();

  if (!asset) return { ok: false, error: 'NOT_YOURS' };
  if (kind && !KINDS.includes(kind)) return { ok: false, error: 'BAD_KIND' };

  let prefix = 'gallery';
  if (folderId) {
    const { data: folder } = await db
      .from('media_folders')
      .select('id, slug')
      .eq('id', folderId)
      .eq('vendor_id', vendor)
      .maybeSingle();

    if (!folder) return { ok: false, error: 'NOT_FOUND' };
    if (folder.slug) prefix = folder.slug;
  }

  const bucket = bucketForAsset(asset);
  const tail = asset.storage_path.split('/').pop();
  const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const target = `${prefix}/${stamp}-${tail}`;

  const { error: copyError } = await db.storage.from(bucket).copy(asset.storage_path, target);
  if (copyError) {
    console.error('[media-folders] copy object:', copyError.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }

  const { data: pub } = db.storage.from(bucket).getPublicUrl(target);

  const { data: row, error: insertError } = await db
    .from('media_assets')
    .insert({
      vendor_id: vendor,
      // The copy lands where it was SENT, which is not always where the
      // original lives — copying a photo into Logos is a real thing to want.
      kind: kind || asset.kind,
      folder_id: folderId || null,
      storage_path: target,
      url: pub?.publicUrl,
      filename: asset.filename,
      mime_type: asset.mime_type,
      size_bytes: asset.size_bytes,
      width: asset.width,
      height: asset.height,
      alt: asset.alt,
    })
    .select(
      'id, url, storage_path, filename, kind, folder_id, mime_type, size_bytes, width, height, alt, created_at'
    )
    .single();

  if (insertError) {
    // Don't leave an orphan object behind if the row fails to write — the same
    // rule the upload route follows.
    await db.storage.from(bucket).remove([target]);
    console.error('[media-folders] copy row:', insertError.message);
    return { ok: false, error: 'SAVE_FAILED' };
  }

  revalidatePath('/[locale]/marketplace/seller/media', 'page');
  return { ok: true, error: null, asset: row };
}
