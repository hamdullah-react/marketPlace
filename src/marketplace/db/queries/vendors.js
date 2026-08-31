import { getMarketplaceDb } from '@/marketplace/db/client';

const SELECT = `
  id, slug, name, verified, city, logo_url, banner_url,
  bio, policies, rating_avg, rating_count, approved_at
`;

/**
 * The storefront page needs everything above PLUS how to reach them.
 *
 * Kept separate from SELECT rather than added to it: the grid renders
 * twenty-four showrooms and has nowhere to put a phone number, and a contact
 * email is personal data that should travel only to the page that displays it.
 *
 * `settings` rides along for two toggles rather than for its own sake —
 * show_phone and show_whatsapp. They are the seller’s answer to "may buyers
 * see this", and a page that prints the number regardless makes that switch
 * a lie. The rest — address, hours, social, CR and VAT — is what the seller
 * filled in on Settings and expects their own storefront to show.
 */
const SELECT_DETAIL = `${SELECT},
  contact_email, contact_phone, cr_number, vat_number,
  address, working_hours, social, settings
`;

/**
 * The SEO columns (schema.sql §27), asked for separately.
 *
 * A storefront must not go dark because a migration has not been run. On a
 * database still without §27 this select fails with 42703 — undefined column —
 * and that would take the whole page with it, so the read falls back to the
 * columns that have always existed and the page generates its metadata the way
 * it did before, which is a working page missing an editor panel.
 *
 * Same shape as getVendorMedia's folder fallback, and the same rule that one
 * learned the hard way: the retry is attempted EVERY call, never latched off
 * after the first miss. A module-level "this failed once" flag outlives the
 * failure, so the database gets fixed and the process goes on behaving as
 * though it had not been.
 */
const SELECT_SEO = `${SELECT_DETAIL},
  meta_title, meta_description, meta_keywords, focus_keyword,
  og_title, og_description, og_image_url, og_type,
  twitter_card, twitter_title, twitter_description, twitter_image_url,
  seo_index, seo_follow, seo_priority, seo_changefreq,
  canonical_url, structured_data,
  about, social_links
`;

let warnedAboutSeo = false;

/** Only approved vendors are ever visible on the storefront. */
export async function getApprovedVendors({ city, limit = 24, offset = 0 } = {}) {
  let query = getMarketplaceDb()
    .from('vendors')
    .select(SELECT, { count: 'exact' })
    .eq('state', 'approved')
    .order('rating_avg', { ascending: false })
    .range(offset, offset + limit - 1);

  if (city) query = query.eq('city', city);

  const { data, error, count } = await query;
  if (error) throw new Error(`getApprovedVendors: ${error.message}`);
  return { items: data ?? [], total: count ?? 0 };
}

export async function getVendorBySlug(slug) {
  const read = (select) =>
    getMarketplaceDb()
      .from('vendors')
      .select(select)
      .eq('slug', slug)
      .eq('state', 'approved')
      .maybeSingle();

  let { data, error } = await read(SELECT_SEO);

  if (error?.code === '42703') {
    if (!warnedAboutSeo) {
      warnedAboutSeo = true;
      console.warn(
        '[vendors] the SEO and About columns are missing. The storefront falls back to generated ' +
          'metadata and the plain bio. Run src/marketplace/db/schema.sql (§27, §28) on this database.'
      );
    }
    ({ data, error } = await read(SELECT_DETAIL));
  }

  if (error) throw new Error(`getVendorBySlug: ${error.message}`);
  return data;
}

/**
 * Counts for the storefront header. Counts only, no rows fetched — `head: true`
 * makes PostgREST return the count in a header and skip the body.
 */
export async function getVendorStats(vendorId) {
  const db = getMarketplaceDb();

  const [live, sold] = await Promise.all([
    db.from('listings').select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId).eq('state', 'live'),
    db.from('orders').select('id', { count: 'exact', head: true })
      .eq('vendor_id', vendorId).in('state', ['delivered', 'completed']),
  ]);

  return {
    liveListings: live.count ?? 0,
    completedOrders: sold.count ?? 0,
  };
}

/** Top vendors for the marketplace home rail. */
export async function getTopVendors(limit = 6) {
  const { data, error } = await getMarketplaceDb()
    .from('vendors')
    .select(SELECT)
    .eq('state', 'approved')
    .order('rating_count', { ascending: false })
    .order('rating_avg', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`getTopVendors: ${error.message}`);
  return data ?? [];
}
