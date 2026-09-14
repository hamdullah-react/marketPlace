import { getMarketplaceDb } from '@/marketplace/db/client';
import type { LooseRow } from '@/marketplace/lib/row';

/**
 * Store settings, backups, and account deletion.
 *
 * Every text a buyer can see is stored as {ar, en} rather than a single string,
 * and `settings.default_locale` records which one the seller authored first.
 * That matters for fallback: showing an empty Arabic name because the seller
 * only wrote English is worse than showing the English.
 */

const SELECT = `
  id, slug, name, bio, state, verified, cr_number, vat_number,
  contact_email, contact_phone, city, logo_url, banner_url,
  address, working_hours, social, policies, settings,
  commission_rate, rating_avg, rating_count, deleted_at, created_at, updated_at
`;

/**
 * The showroom's link list (§29), asked for separately.
 *
 * On a database where §29 has not been run this select fails with 42703, and
 * the Settings page going blank over one column would be the wrong trade — so
 * the read falls back and the editor simply starts from the legacy `social`
 * object. Retried every call, never latched off after the first miss: a flag
 * that outlives the failure is how a fixed database goes on behaving as though
 * it were still broken.
 */
const SELECT_LINKS = `${SELECT}, social_links`;

let warnedAboutLinks = false;

export const DEFAULT_SETTINGS = {
  // 'ar' | 'en' | 'both' — which language the seller writes in, and therefore
  // how the forms render.
  default_locale: 'ar',
  // When a field is missing in the viewer's language: fall back to the other
  // one, or show nothing. Falling back is the sane default — an empty product
  // name helps nobody.
  locale_fallback: true,
  currency: 'SAR',
  timezone: 'Asia/Riyadh',
  notify: { leads: true, orders: true, reviews: true, payouts: true },
  auto_expire_days: 90,
  show_phone: true,
  show_whatsapp: true,
};

export async function getVendorSettings(vendorId: string) {
  if (!vendorId) return null;

  const read = (columns: string) =>
    getMarketplaceDb().from('vendors').select(columns).eq('id', vendorId).maybeSingle();

  let { data, error } = await read(SELECT_LINKS);

  if (error?.code === '42703') {
    if (!warnedAboutLinks) {
      warnedAboutLinks = true;
      console.warn(
        '[settings] vendors.social_links is missing. The links editor falls back to the old eight. ' +
          'Run src/marketplace/db/schema.sql §29 on this database.'
      );
    }
    ({ data, error } = await read(SELECT));
  }

  if (error) throw new Error(`getVendorSettings: ${error.message}`);
  if (!data) return null;

  // The select is a template literal, so postgrest-js cannot parse it into a
  // row type — it falls back to its error shape. The columns are real; only
  // the static parse is missing.
  const row = data as unknown as LooseRow;

  // Merge so a newly added preference has a value without a migration.
  return {
    ...row,
    settings: { ...DEFAULT_SETTINGS, ...(row.settings ?? {}) },
    address: row.address ?? {},
    working_hours: row.working_hours ?? {},
    social: row.social ?? {},
    social_links: Array.isArray(row.social_links) ? row.social_links : [],
    policies: row.policies ?? {},
  };
}

export async function updateVendor(vendorId: string, patch: LooseRow) {
  if (!vendorId) throw new Error('updateVendor: vendorId is required');

  const { data, error } = await getMarketplaceDb()
    .from('vendors')
      .update(patch as never)
      .eq('id', vendorId)
      .select(SELECT)
      .single();

  if (error) throw new Error(`updateVendor: ${error.message}`);
  return data;
}

// ── backups ───────────────────────────────────────────────────────────────────

export async function getBackups(vendorId: string, { limit = 20 } = {}) {
  if (!vendorId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('vendor_backups')
    .select('id, storage_path, url, size_bytes, contents, note, created_at')
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getBackups: ${error.message}`);
  return data ?? [];
}

/**
 * Everything belonging to one vendor, as a plain object ready to serialise.
 *
 * Reads are sequential-by-table rather than a single join so the export mirrors
 * the schema — a restore can walk it table by table, and a missing table (an
 * older database) degrades to an empty array instead of failing the whole
 * export.
 */
export async function collectVendorData(vendorId: string) {
  const db = getMarketplaceDb();
  // PromiseLike, not Promise: every caller hands this a PostgrestFilterBuilder,
  // which is awaitable but has no .catch/.finally.
  const safe = async (
    label: string,
    run: () => PromiseLike<{ data?: unknown; error?: unknown }>,
  ) => {
    try {
      const { data } = await run();
      return data ?? [];
    } catch {
      return [];
    }
  };

  const [vendor, listings, variants, specs, media, leads, formFields, formTabs, orders, reviews] = await Promise.all([
    safe('vendor', () => db.from('vendors').select('*').eq('id', vendorId)),
    safe('listings', () => db.from('listings').select('*').eq('vendor_id', vendorId)),
    safe('listing_variants', () =>
      db.from('listing_variants').select('*, listings!inner(vendor_id)').eq('listings.vendor_id', vendorId)),
    safe('listing_specs', () =>
      db.from('listing_specs').select('*, listings!inner(vendor_id)').eq('listings.vendor_id', vendorId)),
    safe('media_assets', () => db.from('media_assets').select('*').eq('vendor_id', vendorId)),
    safe('leads', () => db.from('leads').select('*').eq('vendor_id', vendorId)),
    // The form that produced them. Without it a restored backup has the answers
    // and no idea what the questions were.
    safe('vendor_form_fields', () => db.from('vendor_form_fields').select('*').eq('vendor_id', vendorId)),
    safe('vendor_form_tabs', () => db.from('vendor_form_tabs').select('*').eq('vendor_id', vendorId)),
    safe('orders', () => db.from('orders').select('*').eq('vendor_id', vendorId)),
    safe('reviews', () => db.from('reviews').select('*').eq('vendor_id', vendorId)),
  ]);

  return {
    exported_at: new Date().toISOString(),
    format_version: 1,
    vendor_id: vendorId,
    tables: {
      vendors: vendor,
      listings,
      listing_variants: variants,
      listing_specs: specs,
      media_assets: media,
      leads,
      vendor_form_fields: formFields,
      vendor_form_tabs: formTabs,
      orders,
      reviews,
    },
  };
}

/** Row counts, for the confirmation dialog and the backup index. */
export async function getVendorDataCounts(vendorId: string) {
  const db = getMarketplaceDb();
  const count = async (table: string, column = 'vendor_id') => {
    try {
      const { count: n } = await db
        .from(table).select('id', { count: 'exact', head: true }).eq(column, vendorId);
      return n ?? 0;
    } catch {
      return 0;
    }
  };

  const [listings, media, leads, orders, reviews, backups] = await Promise.all([
    count('listings'), count('media_assets'), count('leads'),
    count('orders'), count('reviews'), count('vendor_backups'),
  ]);

  return { listings, media, leads, orders, reviews, backups };
}
