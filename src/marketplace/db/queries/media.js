import { getMarketplaceDb } from '@/marketplace/db/client';
import { localized } from '@/marketplace/lib/listing';

/**
 * The vendor media library.
 *
 * Uploads land here once and get reused across listings and variants — a
 * seller photographs a car once, then picks those photos wherever they're
 * needed instead of re-uploading.
 */

/**
 * `width` and `height` are here for the preview panel, which states the
 * dimensions of the file being looked at. They are null on anything uploaded
 * before the columns were filled in, and the panel simply omits the line.
 */
const BASE_SELECT =
  'id, kind, url, storage_path, filename, mime_type, size_bytes, width, height, alt, created_at';

/**
 * folder_id is asked for, and dropped from the list if the database has not
 * got it yet.
 *
 * The column arrives with schema.sql §26, and code always ships before the
 * SQL is run — that is the order in this repo, deliberately. A select naming
 * a column the database does not have fails the WHOLE query, so asking for
 * folder_id unconditionally would take down the media library, every image
 * picker and the listing form on any database still waiting for §26: an
 * organiser breaking the thing it organises.
 *
 * ── Retried every time, NOT latched off ─────────────────────────────────
 *
 * The first version of this set a module flag on the first 42703 and never
 * cleared it. Running the SQL then fixed nothing until the server was
 * restarted, and the symptom was much worse than "no folders": every read
 * came back without folder_id, the gallery merges the server copy over its
 * own, and a picture the seller had just filed jumped back out of the folder
 * a second later. A cache of "this failed once" that outlives the failure is
 * how a fixed database goes on behaving like a broken one.
 *
 * So the full list is attempted on every call. The cost of being wrong is one
 * extra round trip, and only on a database that has not run §26 — which is a
 * temporary state by definition. `warned` only stops the log repeating.
 */
let warnedAboutFolders = false;
const FOLDER_SELECT = `${BASE_SELECT}, folder_id`;

/**
 * Which template images this seller is entitled to see.
 *
 * Template artwork — brand logos, spec icons, category icons — belongs to the
 * catalog ROWS, and those rows are shared between every seller who installed
 * the same template. So the files are stored once, owned by nobody
 * (vendor_id null) and tagged with the template they came from.
 *
 * That leaves the question of who may see them, and the answer is the same one
 * the catalog gives: whoever installed the template. A seller who has installed
 * nothing sees nothing, which is the empty dashboard working as intended; a
 * seller who installed Brands can pick the Toyota logo, because their catalog
 * already contains the row that uses it.
 */
async function installedTemplates(db, vendorId) {
  const { data } = await db
    .from('catalog_template_installs')
    .select('template')
    .eq('vendor_id', vendorId);

  return [...new Set((data ?? []).map((r) => r.template))];
}

/**
 * The media a seller can pick from: their own uploads, plus the template
 * artwork their installed catalog uses.
 *
 * Two queries rather than one clever OR. The alternative is a PostgREST
 * or(...) with a nested and() and an array-overlap inside it, which is hard to
 * read, harder to change, and saves one round trip on a list capped at a couple
 * of hundred rows.
 *
 * This used to be a single `.eq('vendor_id', vendorId)`, which is why template
 * icons never appeared: installing a template that another seller had already
 * installed creates no new rows, so nothing was ever filed under the second
 * seller. The artwork existed, was referenced by their catalog, and could not
 * be chosen for anything else.
 */
export async function getVendorMedia(vendorId, opts = {}) {
  if (!vendorId) return { items: [], total: 0 };

  try {
    return await readMedia(vendorId, opts, FOLDER_SELECT);
  } catch (err) {
    // 42703 is "column does not exist" — §26 has not been run here.
    if (String(err.message).includes('42703')) {
      if (!warnedAboutFolders) {
        warnedAboutFolders = true;
        console.warn(
          '[media] folder_id is missing. Run src/marketplace/db/schema.sql §26 to enable media folders.'
        );
      }
      return readMedia(vendorId, opts, BASE_SELECT);
    }
    throw err;
  }
}

async function readMedia(vendorId, { kind, limit = 100, offset = 0 } = {}, select) {
  const db = getMarketplaceDb();

  const own = db
    .from('media_assets')
    .select(select, { count: 'exact' })
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const templates = await installedTemplates(db, vendorId);

  const shared = templates.length
    ? db
        .from('media_assets')
        .select(select, { count: 'exact' })
        .is('vendor_id', null)
        .overlaps('tags', templates)
        .order('created_at', { ascending: false })
        .limit(limit)
    : null;

  const [mine, theirs] = await Promise.all([
    kind ? own.eq('kind', kind) : own,
    shared ? (kind ? shared.eq('kind', kind) : shared) : Promise.resolve({ data: [], count: 0 }),
  ]);

  // The code travels in the message so the caller above can tell a missing
  // column from a real failure without a second error type.
  if (mine.error) throw new Error(`getVendorMedia: ${mine.error.code} ${mine.error.message}`);
  if (theirs.error) {
    throw new Error(`getVendorMedia templates: ${theirs.error.code} ${theirs.error.message}`);
  }

  // A seller's own upload wins over template artwork with the same id — they
  // cannot collide today, and de-duplicating is cheaper than finding out the
  // day they can.
  const seen = new Set();
  const items = [...(mine.data ?? []), ...(theirs.data ?? [])].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });

  return { items, total: (mine.count ?? 0) + (theirs.count ?? 0) };
}

/**
 * A showroom's own shelves, in the order the tabs are drawn.
 *
 * Tolerant of a database that has not run schema.sql §26: the library is the
 * point of the page and folders are an organiser on top of it, so a missing
 * table means no folder tabs rather than no media page.
 */
export async function getMediaFolders(vendorId) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('media_folders')
    // slug is the bucket prefix the folder's uploads land under (§26.1).
    .select('id, name, slug, sort_order')
    .eq('vendor_id', vendorId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.warn(
      `[media] getMediaFolders: ${error.message}. Run src/marketplace/db/schema.sql §26 on this database.`
    );
    return [];
  }
  return data ?? [];
}

export async function getMediaByIds(ids = []) {
  if (!ids.length) return [];
  const { data, error } = await getMarketplaceDb()
    .from('media_assets').select(SELECT).in('id', ids);

  if (error) throw new Error(`getMediaByIds: ${error.message}`);
  return data ?? [];
}

/** Storage totals for the gallery header. */
export async function getMediaStats(vendorId) {
  if (!vendorId) return { count: 0, bytes: 0 };
  const { data, error } = await getMarketplaceDb()
    .from('media_assets').select('size_bytes').eq('vendor_id', vendorId);

  if (error) throw new Error(`getMediaStats: ${error.message}`);
  return {
    count: data?.length ?? 0,
    bytes: (data ?? []).reduce((sum, r) => sum + (r.size_bytes ?? 0), 0),
  };
}

// ── variants ──────────────────────────────────────────────────────────────────

const VARIANT_COLS = 'id, color_id, name, is_primary, media, sequence, car_colors ( name, hex )';

export async function getListingVariants(listingId) {
  if (!listingId) return [];

  const read = (cols) =>
    getMarketplaceDb()
      .from('listing_variants')
      .select(cols)
      .eq('listing_id', listingId)
      .order('sequence', { ascending: true });

  const { data, error } = await read(`${VARIANT_COLS}, price, compare_at`);
  if (!error) return data ?? [];

  /**
   * schema.sql §31 has not been run on this database yet.
   *
   * The caller catches and falls back to an empty array, which for THIS query
   * is the worst possible failure: no rows means no colour swatches at all, on
   * every car, silently — a page that looks deliberately photo-less rather than
   * one missing an optional column.
   *
   * So the price columns are dropped and the read is repeated. Colours come
   * back working, each simply priced at the car's price, which is exactly what
   * they were before §31 existed.
   */
  if (/price|compare_at|column/i.test(error.message)) {
    const retry = await read(VARIANT_COLS);
    if (!retry.error) return retry.data ?? [];
  }

  throw new Error(`getListingVariants: ${error.message}`);
}

/**
 * Normalizes a variant for the UI.
 *
 * hasOwnMedia is the important flag: a colour with no photos of its own must
 * not render a swatch, because clicking it would show a different colour's car.
 * The main site learned this the hard way — see CarVariant.hasOwnMedia.
 */
export function normalizeVariant(row, locale = 'ar') {
  if (!row) return null;
  const media = Array.isArray(row.media) ? row.media : [];
  const colour = row.car_colors;

  return {
    id: row.id,
    colorId: row.color_id,
    name:
      localized(row.name, locale) ||
      (colour ? localized(colour.name, locale) : '') ||
      '',
    hex: colour?.hex ?? null,
    isPrimary: !!row.is_primary,
    media,
    hasOwnMedia: media.length > 0,
    image: media[0]?.url ?? null,

    /**
     * The colour's OWN price, or null to follow the car's (schema.sql §31).
     *
     * Null and 0 are different answers and Number() maps both to 0, so the
     * check is explicit: a variant that was never given a price must fall
     * through to the listing, not claim to be free.
     */
    price: row.price == null ? null : Number(row.price),
    compareAt: row.compare_at == null ? null : Number(row.compare_at),
  };
}
