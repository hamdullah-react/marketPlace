import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction, currentViewer } from '@/marketplace/auth/session';
import { ensureVendorBucket, bucketForAsset } from '@/marketplace/media/bucket';
import { ok, fail } from '@/app/api/marketplace/_lib/response';

/**
 * Uploads an image into the SHOWROOM'S OWN bucket and records it in
 * media_assets so it shows up in that showroom's gallery.
 *
 *   POST   /api/marketplace/upload      FormData: file, vendorId?, kind?, altAr?, altEn?
 *   DELETE /api/marketplace/upload?id=<assetId>
 *
 * ── The showroom comes from the SESSION ─────────────────────────────────────
 *
 * It used to come from the form, with a comment promising to fix that when
 * auth arrived. Auth arrived. Until this change, POST was an unauthenticated
 * write into any showroom's folder — post somebody else's vendorId and their
 * gallery gains an 8 MB file — and DELETE took an asset id and nothing else, so
 * any listing photo on the platform could be erased, object and row together,
 * by anyone who could guess a uuid.
 *
 * vendorId is still ACCEPTED in the form, because a seller who belongs to two
 * showrooms has to be able to say which. It is matched against the caller's own
 * memberships by vendorForAction() and never trusted on its own; an id that is
 * not theirs falls back to their first showroom rather than erroring, which is
 * how the rest of the seller pages treat a stale ?vendor= too.
 *
 * The storage path still encodes ownership — vendors/<id>/… — so the object
 * layout and the database agree about who owns what.
 */

// No `export const runtime` here — it is rejected under nextConfig.cacheComponents,
// and the Node runtime is the default for route handlers anyway. Buffer and the
// Supabase storage client both work without declaring it.

import sharp from 'sharp';

/** What a seller may HAND US. The browser has already shrunk a photo long
 *  before this, so anything near the ceiling is a file that skipped the
 *  uploader — a drag onto a stale tab, or a direct POST. */
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * What may be STORED, after conversion.
 *
 * The check that matters, and it is deliberately on the OUTPUT. A 5 MB camera
 * photo is an ordinary thing for a showroom to have and a terrible thing to
 * serve, and refusing it on the way in would mean no phone on the forecourt
 * can upload anything. Re-encoded to AVIF the same photo is 40-90 KB, so this
 * limit only ever catches what is still enormous once the work is done.
 */
const MAX_STORED_BYTES = 1024 * 1024;

/** Nothing wider than this is stored. A card is 320px; 2000 is already generous. */
const MAX_EDGE = 2000;

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];

/**
 * Everything raster becomes AVIF. SVG is passed through untouched.
 *
 * ── Why convert at rest, when next/image converts on the way out ────────────
 *
 * next/image already serves AVIF from a JPEG source, so this looks like work
 * the framework is doing anyway. It is not the same work:
 *
 *   · the optimiser's output is a CACHE. It expires, and every miss re-reads
 *     the 5 MB original and re-encodes it — which is most of the LCP cost this
 *     project spent a day tracing.
 *   · the storage bucket is public. A listing photo's own URL is shared, hot-
 *     linked and crawled directly, and that URL serves what is in the bucket.
 *   · a backup, an export and a seller's own download are all the stored file.
 *
 * ── SVG is not re-encoded, on purpose ───────────────────────────────────────
 *
 * It is a vector — rasterising a brand logo to AVIF throws away the one
 * property it was chosen for. SVGs are also already tiny, and the ones here
 * are marks rather than photographs.
 *
 * ── A failure here does not fail the upload ────────────────────────────────
 *
 * sharp refusing a file (a CMYK JPEG, an animation, something truncated) is a
 * reason to store the original, not to lose the seller's photo. The limit is
 * then applied to whatever we ended up with, so nothing oversized gets in
 * through the fallback.
 */
async function toFormat(bytes, mime, want = 'avif') {
  if (mime === 'image/svg+xml') {
    return { bytes, mime, width: null, height: null, converted: false };
  }

  /* The seller picked this in the upload dialog. Anything unrecognised falls
     back to AVIF rather than erroring: the field arrives from a browser like
     any other, and a bad value is not a reason to lose the photo. */
  const target = want === 'webp' ? 'webp' : 'avif';

  try {
    const pipeline = sharp(bytes, { failOn: 'none' })
      // EXIF orientation is applied and then dropped with the rest of the
      // metadata. Without this a portrait phone photo is stored sideways the
      // moment anything reads it without honouring the tag — and the metadata
      // being dropped is the point: a camera writes GPS into it, and a
      // showroom should not be publishing the coordinates of its forecourt.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .toFormat(target, target === 'avif' ? { quality: 62, effort: 4 } : { quality: 80 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return {
      bytes: data,
      mime: `image/${target}`,
      width: info.width,
      height: info.height,
      converted: true,
    };
  } catch {
    // Store what we were given. The size check below still applies to it.
    const meta = await sharp(bytes, { failOn: 'none' }).metadata().catch(() => ({}));
    return {
      bytes,
      mime,
      width: meta.width ?? null,
      height: meta.height ?? null,
      converted: false,
    };
  }
}

/** Keeps the extension, drops everything a storage key shouldn't carry. */
function safeName(name = 'file', forceExt = null) {
  const dot = name.lastIndexOf('.');
  const ext = forceExt
    ? forceExt
    : dot > -1 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
  const stem = (dot > -1 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'image';
  return `${stem}.${ext || 'jpg'}`;
}

/** {ar, en} with empties dropped; null when neither was supplied. */
function buildAlt(ar, en) {
  const out = {};
  if (typeof ar === 'string' && ar.trim()) out.ar = ar.trim();
  if (typeof en === 'string' && en.trim()) out.en = en.trim();
  return Object.keys(out).length ? out : null;
}

export async function POST(request) {
  let form;
  try {
    form = await request.formData();
  } catch {
    return fail('Expected multipart/form-data', 400, 'BAD_REQUEST');
  }

  const file = form.get('file');
  const kind = form.get('kind') || 'photo';
  const listingId = form.get('listingId') || null;
  // The shelf the seller had open when they dropped the file (schema.sql
  // §26). Optional everywhere else — only the media page sends it.
  const folderId = form.get('folderId') || null;

  // Resolved from the session, with the form's value used only to CHOOSE
  // between showrooms this person already belongs to.
  const { vendorId, error: denied } = await vendorForAction(form.get('vendorId') || null);
  if (denied === 'NOT_SIGNED_IN') return fail('Sign in first', 401, 'NOT_SIGNED_IN');
  if (denied) return fail('This account has no showroom', 403, denied);

  if (!file || typeof file === 'string') return fail('No file supplied', 400, 'NO_FILE');
  if (!vendorId) return fail('No showroom to upload to', 403, 'NO_VENDOR');
  /**
   * The browser's guess, corrected by the extension when it has none.
   *
   * `file.type` is routinely EMPTY for an SVG dragged out of a file manager,
   * and an empty string is in no allowlist — so a perfectly good logo was
   * refused with "Unsupported type ." naming nothing. The extension is only
   * consulted when the browser declined to say; it is not a security claim,
   * because sharp decides what a file really is by reading it.
   */
  const declared = String(file.type || '').toLowerCase();
  const byName = /\.svg$/i.test(file.name ?? '') ? 'image/svg+xml' : null;
  const mime = ALLOWED.includes(declared) ? declared : byName;

  if (!mime) {
    return fail(
      `Unsupported type ${file.type || 'unknown'}. Allowed: JPEG, PNG, WebP, AVIF, SVG.`,
      415,
      'BAD_TYPE'
    );
  }
  if (file.size > MAX_BYTES) {
    return fail(`File is ${(file.size / 1048576).toFixed(1)} MB; the limit is 8 MB.`, 413, 'TOO_LARGE');
  }

  try {
    const db = getMarketplaceDb();

    // The path is the ownership boundary — see 0007_media_variants.sql. The
    // random prefix stops two uploads of "IMG_1234.jpg" colliding.
    /**
     * The showroom's own bucket, created on first use.
     *
     * Registration makes it too, so this is normally a no-op served from an
     * in-process cache. It stays here for the showrooms that existed before
     * the split and for the day a bucket is removed by hand — an upload that
     * fails because storage was never provisioned is a worse answer than one
     * that provisions it.
     */
    const bucket = await ensureVendorBucket(db, vendorId);

    /**
     * A folder id from the form is checked, not trusted.
     *
     * It decides where the file lands in someone's library, and the value
     * arrives from the browser like any other field. An id belonging to
     * another showroom is dropped rather than refused: the upload itself is
     * fine and the file is better in the library with no folder than lost.
     */
    // `folder` is taken a few lines down for the storage prefix.
    let mediaFolder = null;
    let folderSlug = null;
    if (folderId) {
      const { data: owned } = await db
        .from('media_folders')
        .select('id, slug')
        .eq('id', folderId)
        .eq('vendor_id', vendorId)
        .maybeSingle();
      mediaFolder = owned?.id ?? null;
      folderSlug = owned?.slug ?? null;
    }

    // No vendors/<id>/ prefix any more: the bucket already says whose this is,
    // and repeating it in the key would be the same fact stored twice. It is
    // also what tells bucketForAsset() that an object predates the split.
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    /**
     * Where the object goes, in the showroom's own bucket.
     *
     * A listing keeps its own prefix. Otherwise the seller’s FOLDER decides,
     * so "Exteriors" in the library is Exteriors in the bucket rather than a
     * flat gallery/ heap that only the dashboard can read. Unfiled uploads
     * keep landing in gallery/, which is where every existing file already is.
     */
    const folder = listingId
      ? `listings/${listingId}`
      : folderSlug || 'gallery';
    const raw = Buffer.from(await file.arrayBuffer());

    /* Converted BEFORE the key is built: the extension has to describe what is
       actually in the object, or every later reader disagrees about its type. */
    const out = await toFormat(raw, mime, String(form.get('format') || 'avif'));

    /**
     * The limit, applied to what we are about to STORE.
     *
     * A seller who reaches this has an image that is still over a megabyte as
     * AVIF at 2000px — a huge panorama, or a screenshot of a screenshot. The
     * message says the compressed size rather than the original, because the
     * original is not the number they can do anything about.
     */
    if (out.bytes.length > MAX_STORED_BYTES) {
      return fail(
        `File size is too high: ${(out.bytes.length / 1048576).toFixed(1)} MB after compression, and the limit is 1 MB. Crop it tighter or choose a smaller size.`,
        413,
        'TOO_LARGE'
      );
    }

    const ext =
      out.mime === 'image/avif' ? 'avif'
      : out.mime === 'image/webp' ? 'webp'
      : out.mime === 'image/svg+xml' ? 'svg'
      : null;
    const storagePath = `${folder}/${stamp}-${safeName(file.name, ext)}`;

    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(storagePath, out.bytes, {
        contentType: out.mime,
        upsert: false,
        /* Content-addressed by the random stamp, so the bytes behind this key
           never change. The storage default of `no-cache` is what forced the
           image optimiser to re-fetch unchanged photos for ever. */
        cacheControl: '31536000',
      });

    if (uploadError) return fail(`Upload failed: ${uploadError.message}`, 500, 'UPLOAD_FAILED');

    const { data: pub } = db.storage.from(bucket).getPublicUrl(storagePath);
    const url = pub?.publicUrl;

    const { data: asset, error: insertError } = await db
      .from('media_assets')
      .insert({
        vendor_id: vendorId,
        kind,
        folder_id: mediaFolder,
        storage_path: storagePath,
        url,
        filename: file.name,
        /* What is in the bucket, not what was handed to us. These two were the
           uploaded file's type and size, so every AVIF in the library would
           have described itself as a 5 MB JPEG. width/height were in the
           select and never in the insert, so every row had null dimensions —
           sharp knows them, so they are filled in now. */
        mime_type: out.mime,
        size_bytes: out.bytes.length,
        width: out.width,
        height: out.height,
        // Single jsonb column, not alt_ar/alt_en — the schema moved to
        // {ar, en} objects and this insert was still writing the old pair,
        // which failed AFTER the file had already reached storage.
        alt: buildAlt(form.get('altAr'), form.get('altEn')),
      })
      // folder_id comes BACK as well: the gallery puts the new tile straight
      // into its list, and without this the file it just filed under
      // "Exteriors" would sit in "no folder" until the next reload.
      .select(
        'id, url, storage_path, filename, kind, folder_id, mime_type, size_bytes, width, height, alt, created_at'
      )
      .single();

    if (insertError) {
      // Don't leave an orphan object behind if the row fails to write.
      await db.storage.from(bucket).remove([storagePath]);
      return fail(`Saved to storage but not recorded: ${insertError.message}`, 500, 'RECORD_FAILED');
    }

    /**
     * ── Editing a photo REPLACES it ────────────────────────────────────────
     *
     * `replaces` carries the id of the picture that was edited — the one the
     * background was cleaned off, or that was re-cropped.
     *
     * Without this, editing was an upload: the library kept the original AND
     * the edited copy, so a seller who tidied up twenty photos ended with
     * forty, every car still pointing at the untouched version, and no way to
     * tell the two apart but the thumbnail.
     *
     * Order matters. The references are swapped to the new url BEFORE the old
     * row and object go, so there is no moment when a listing names a file
     * that has already been deleted. If the swap fails the original is left
     * alone — a duplicate is recoverable, a car with a dead photo is not.
     */
    const replaces = form.get('replaces');
    if (replaces && typeof replaces === 'string') {
      const { data: old } = await db
        .from('media_assets')
        .select('id, url, storage_path, vendor_id')
        .eq('id', replaces)
        .eq('vendor_id', vendorId)        // only ever your own
        .maybeSingle();

      if (old && old.url !== url) {
        await rewriteReferences(db, { vendorId, from: old.url, to: url });
        await db.storage.from(bucketForAsset(old)).remove([old.storage_path]);
        await db.from('media_assets').delete().eq('id', old.id);
      }
    }

    return ok({ asset, replaced: replaces || null });
  } catch (err) {
    return fail(err.message, 500, 'UPLOAD_ERROR');
  }
}

/**
 * Points everything that named one file at a different one — or at nothing.
 *
 * A picture's url is written into four places, and until this existed only two
 * of them were ever maintained:
 *
 *   vendors.logo_url / banner_url   a plain column, fixable with an equality
 *                                   update
 *   listings.media                  the url inside a jsonb ARRAY
 *   listing_variants.media          the same array again, per colour
 *
 * The two arrays were the gap. Deleting a picture a car was using left the url
 * in listings.media, so the listing form and the public gallery both kept
 * rendering an <img> at a file that no longer existed — and on the picker
 * modal, where the seller had just deleted it, the grid filled with broken
 * images. That is what "delete" looks like when it only half works.
 *
 * `to: null` STRIPS the reference (a delete). Any other value SWAPS it (an
 * edit), which is what keeps a cleaned-up photo attached to the car it was
 * already on instead of silently detaching it.
 *
 * Scoped to the owning showroom throughout, so one delete can never touch
 * another storefront that happens to use the same public URL.
 */
async function rewriteReferences(db, { vendorId, from, to = null }) {
  if (!vendorId || !from) return;

  for (const column of ['logo_url', 'banner_url']) {
    await db
      .from('vendors')
      .update({ [column]: to })
      .eq('id', vendorId)
      .eq(column, from);
  }

  const rewrite = async (table, rows) => {
    for (const row of rows ?? []) {
      const before = row.media ?? [];
      const after = to
        ? before.map((m) => (m?.url === from ? { ...m, url: to } : m))
        : before.filter((m) => m?.url !== from);

      if (after.length === before.length && !to) continue;

      /* A listing whose MAIN photo was the deleted one has no main photo left,
         and every card reading media[0] or `main` would show nothing. The
         first survivor is promoted. Only on a strip — a swap keeps whichever
         entry was already main. */
      if (!to && after.length && !after.some((m) => m?.main)) {
        after[0] = { ...after[0], main: true, primary: true };
      }

      await db.from(table).update({ media: after }).eq('id', row.id);
    }
  };

  /* `contains` does the finding in the database rather than pulling every
     listing across the wire to filter in JS. */
  const { data: hitListings } = await db
    .from('listings')
    .select('id, media')
    .eq('vendor_id', vendorId)
    .contains('media', [{ url: from }]);
  await rewrite('listings', hitListings);

  /* Variants carry their OWN copy of the array and have no vendor column, so
     they are reached through the showroom's listings — ALL of them, not only
     the parents that happened to match. A colour variant can be using a photo
     its parent listing is not, and scoping to the matched parents would walk
     straight past it. */
  const { data: ownListings } = await db.from('listings').select('id').eq('vendor_id', vendorId);
  const scope = (ownListings ?? []).map((l) => l.id);
  if (!scope.length) return;

  const { data: hitVariants } = await db
    .from('listing_variants')
    .select('id, media')
    .in('listing_id', scope)
    .contains('media', [{ url: from }]);
  await rewrite('listing_variants', hitVariants);
}

/** DELETE /api/marketplace/upload?id=<assetId> — removes row and object together. */
export async function DELETE(request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return fail('id is required', 400, 'NO_ID');

  // currentViewer() rather than vendorForAction(): deleting needs to know WHO
  // is asking, not which showroom they are acting as — and a staff member with
  // no showroom of their own must still be able to clear a bad upload.
  const viewer = await currentViewer();
  if (!viewer) return fail('Sign in first', 401, 'NOT_SIGNED_IN');

  try {
    const db = getMarketplaceDb();
    const { data: asset } = await db
      .from('media_assets').select('storage_path, vendor_id, url').eq('id', id).maybeSingle();

    if (!asset) return fail('Not found', 404, 'NOT_FOUND');

    /**
     * Whose file is this?
     *
     * Two refusals, reported as one 404 so this endpoint cannot be used to
     * find out which asset ids exist:
     *
     *   another showroom's upload — not theirs to delete
     *   vendor_id null            — shared template artwork, backing catalog
     *                               rows that other sellers also use. It goes
     *                               when the template is removed, and only
     *                               then; see catalog-templates.js.
     */
    const mine = asset.vendor_id && viewer.vendorIds.includes(asset.vendor_id);
    if (!mine && !viewer.isStaff) return fail('Not found', 404, 'NOT_FOUND');

    /**
     * The FILE goes first, and whether it went is CHECKED.
     *
     * Where the object lives is bucketForAsset()'s decision — its own bucket,
     * or marketplace-media if it was uploaded before the split.
     *
     * ── Why the row is kept when the file will not go ───────────────────────
     *
     * This used to be `await db.storage...remove(...)` with the result thrown
     * away, and then the row was deleted regardless. A failed removal —  wrong
     * bucket, storage down, a permission that changed — therefore produced a
     * success: the picture vanished from the library and the file stayed in
     * the bucket forever, costing storage, invisible to every screen, and
     * unreachable because the only record of its path had just been deleted.
     *
     * So a storage failure now fails the whole delete and LEAVES the row. The
     * seller sees the picture still there and can try again, which is
     * recoverable; a silent orphan is not.
     *
     * An object that is already gone is not a failure: remove() reports that
     * as an empty result with no error, and deleting a row whose file has
     * already been cleaned up is exactly what should happen.
     */
    const { error: storageError } = await db.storage
      .from(bucketForAsset(asset))
      .remove([asset.storage_path]);

    if (storageError) {
      return fail(
        `The file could not be removed from storage, so nothing was deleted: ${storageError.message}`,
        502,
        'STORAGE_DELETE_FAILED',
      );
    }

    const { error } = await db.from('media_assets').delete().eq('id', id);
    if (error) return fail(error.message, 500, 'DELETE_FAILED');

    /* Everything that named this file has to stop naming it — see
       rewriteReferences(). `to: null` strips it; the edit path passes the
       replacement url instead. */
    await rewriteReferences(db, { vendorId: asset.vendor_id, from: asset.url, to: null });

    return ok({ deleted: id });
  } catch (err) {
    return fail(err.message, 500, 'DELETE_ERROR');
  }
}
