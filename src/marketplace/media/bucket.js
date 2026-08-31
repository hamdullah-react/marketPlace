import 'server-only';

/**
 * One storage bucket per showroom.
 *
 * ── The naming rule ─────────────────────────────────────────────────────────
 *
 * `vendor-<uuid>`, derived from the vendor id and never stored. A derived name
 * cannot drift out of step with the row it belongs to, needs no column and no
 * migration, and survives a showroom being renamed — which a slug would not,
 * since renaming would orphan every object under the old name.
 *
 * ── Which bucket an existing file lives in ──────────────────────────────────
 *
 * Three cases, and bucketForAsset() below is the ONLY place that decides:
 *
 *   vendor_id null          shared template artwork. It backs catalog rows that
 *                           several showrooms use, so it cannot live inside any
 *                           one of their buckets.
 *   path starts vendors/    uploaded before the split, when everything shared
 *                           marketplace-media under a per-vendor prefix. Those
 *                           objects are left exactly where they are; moving
 *                           them would rewrite every URL already published in a
 *                           listing, an email and a search index.
 *   anything else           the showroom's own bucket.
 *
 * New uploads carry no `vendors/<id>/` prefix, because the bucket already says
 * whose they are — which is what makes the third case unambiguous.
 */

const SHARED = 'marketplace-media';

/** Uploads the platform accepts. Enforced by the bucket, not only by our route. */
const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/svg+xml',
];

const MAX_BYTES = 8 * 1024 * 1024;

export const SHARED_BUCKET = SHARED;

/** The bucket a showroom's own uploads go to. Pure — no I/O, no lookup. */
export function vendorBucket(vendorId) {
  return `vendor-${vendorId}`;
}

/**
 * Where one media_assets row's object actually lives.
 *
 * Takes the row rather than an id because the answer depends on when it was
 * written, and the row is the only thing that knows.
 */
export function bucketForAsset(asset) {
  if (!asset?.vendor_id) return SHARED;
  if (typeof asset.storage_path === 'string' && asset.storage_path.startsWith('vendors/')) {
    return SHARED;
  }
  return vendorBucket(asset.vendor_id);
}

/**
 * Remembers which buckets this process has already confirmed.
 *
 * Creating a bucket that exists is a cheap 409, but it is still a round trip on
 * every single upload. The cache is per-process and only ever holds "this
 * exists", so a cold start or a second instance costs one extra call and
 * nothing is ever wrong — the failure mode of a stale entry would be claiming a
 * bucket exists after someone deleted it by hand, and the upload that follows
 * reports that plainly.
 */
const known = new Set();

/**
 * Makes sure a showroom's bucket exists, and returns its name.
 *
 * Idempotent, because it is called on every upload as well as at registration.
 * "Already exists" is the expected answer, not an error.
 *
 * Public, like the shared bucket: listing photos are shown to anyone browsing
 * the marketplace, and signing every image URL would mean a listing page that
 * cannot be cached and thumbnails that expire mid-scroll. Privacy comes from
 * the database — media_assets.vendor_id scopes every list — not from the
 * readability of a URL nobody can guess.
 */
export async function ensureVendorBucket(db, vendorId) {
  if (!vendorId) return null;

  const name = vendorBucket(vendorId);
  if (known.has(name)) return name;

  const { error } = await db.storage.createBucket(name, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ALLOWED_MIME,
  });

  // Supabase reports an existing bucket as 409 / BucketAlreadyExists. Anything
  // else is a real failure and the caller has to know: an upload that silently
  // fell back to the shared bucket would put one showroom's photos in a place
  // the delete path will not look.
  if (error && !/already exists|duplicate/i.test(`${error.message} ${error.name ?? ''}`)) {
    throw new Error(`Could not create storage for this showroom: ${error.message}`);
  }

  known.add(name);
  return name;
}

/**
 * Removes a showroom's bucket and everything in it.
 *
 * Two steps because Supabase refuses to delete a bucket with objects in it —
 * which is a good refusal, and the reason this is a named function rather than
 * an inline call somebody copies wrongly.
 *
 * Returns true only if the bucket is actually gone. Callers use that to decide
 * whether to report a partial wipe rather than claiming a clean one.
 */
export async function dropVendorBucket(db, vendorId) {
  if (!vendorId) return false;
  const name = vendorBucket(vendorId);

  const { error: emptyError } = await db.storage.emptyBucket(name);
  // A bucket that was never created is already as empty as it will ever be.
  if (emptyError && !/not found|does not exist/i.test(emptyError.message)) return false;

  const { error } = await db.storage.deleteBucket(name);
  known.delete(name);

  return !error || /not found|does not exist/i.test(error.message);
}
