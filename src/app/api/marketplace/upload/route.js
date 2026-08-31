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

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml'];

/** Keeps the extension, drops everything a storage key shouldn't carry. */
function safeName(name = 'file') {
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : 'jpg';
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
  if (!ALLOWED.includes(file.type)) {
    return fail(`Unsupported type ${file.type}. Allowed: JPEG, PNG, WebP, AVIF, SVG.`, 415, 'BAD_TYPE');
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
    const storagePath = `${folder}/${stamp}-${safeName(file.name)}`;

    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await db.storage
      .from(bucket)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });

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
        mime_type: file.type,
        size_bytes: file.size,
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

    return ok({ asset });
  } catch (err) {
    return fail(err.message, 500, 'UPLOAD_ERROR');
  }
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

    // Where this object actually lives — its own bucket, or marketplace-media
    // if it was uploaded before the split. One function decides; see
    // bucketForAsset().
    await db.storage.from(bucketForAsset(asset)).remove([asset.storage_path]);
    const { error } = await db.from('media_assets').delete().eq('id', id);
    if (error) return fail(error.message, 500, 'DELETE_FAILED');

    /**
     * Anything POINTING at that file has to let go of it.
     *
     * The row and the object went; a showroom whose logo_url still named it
     * kept rendering a broken <img> — and looked fine until a browser with
     * no cached copy loaded the page, which is the worst kind of wrong: it
     * works for the person who deleted it and not for anybody else.
     *
     * Matched on the url rather than on an id, because that is what these
     * columns store. Scoped to the owning showroom so one delete can never
     * blank another storefront that happens to use the same public URL.
     *
     * NOT swept: listings.media and listing_variants.media, which hold the
     * url inside a jsonb array. Same defect, a bigger fix, and it belongs
     * with the listing editor rather than bolted on here.
     */
    if (asset.vendor_id && asset.url) {
      for (const column of ['logo_url', 'banner_url']) {
        await db
          .from('vendors')
          .update({ [column]: null })
          .eq('id', asset.vendor_id)
          .eq(column, asset.url);
      }
    }

    return ok({ deleted: id });
  } catch (err) {
    return fail(err.message, 500, 'DELETE_ERROR');
  }
}
