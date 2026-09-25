import { getMarketplaceDb } from '@/marketplace/db/client';
import { likePattern } from '@/marketplace/lib/search';

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
/**
 * ── `q` is filtered in the DATABASE, unlike the admin's lists ───────────────
 *
 * This one pages — twenty-four showrooms at a time out of however many the
 * marketplace ends up with — so the term has to be applied where all the rows
 * are. A JS filter over the current page would search the page and answer "no
 * showrooms" for one sitting on page two, and the count under the grid would be
 * the count of the unfiltered set.
 *
 * The cost of doing it here is that Postgres compares the raw strings, so the
 * Arabic folding in lib/search.js does not apply and "الاحمدي" will not find
 * "الأحمدي". Accepted for now: the alternative is a maintained search column and
 * a trigram index (what §21.5 did for leads), which is worth doing when the
 * showroom list is long enough for anybody to notice.
 *
 * likePattern() strips the characters that are PostgREST's own filter grammar —
 * without it a comma in the term does not fail to match, it rewrites the filter.
 */
export async function getApprovedVendors({
  city,
  q,
  limit = 24,
  offset = 0,
}: { city?: string | null; q?: string | null; limit?: number; offset?: number } = {}) {
  let query = getMarketplaceDb()
    .from('vendors')
    .select(SELECT, { count: 'exact' })
    .eq('state', 'approved')
    /* Rating first, then how many people said it.
       Until the REVIEWS section of schema.sql was run, rating_avg was 0 for
       every showroom and this ORDER BY sorted nothing — the grid came back in
       whatever order the database felt like. It sorts for real now, which makes
       the tie-break matter: without rating_count behind it, one 5-star review
       outranks fifty at 4.8. This is the cheap version of that fix, and it is
       as far as PostgREST goes — a proper confidence-weighted score is an
       expression, so it needs a view or a generated column, and that is a
       ranking-policy decision rather than a query tweak. */
    .order('rating_avg', { ascending: false })
    .order('rating_count', { ascending: false })
    .range(offset, offset + limit - 1);

  if (city) query = query.eq('city', city);

  const pattern = likePattern(q);
  if (pattern) {
    // Both languages of the name, the slug and the city: a visitor types the
    // showroom's name in whichever language they think in, and often types a
    // city into the same box because it is the only box on the page.
    query = query.or(
      [
        `name->>ar.ilike.${pattern}`,
        `name->>en.ilike.${pattern}`,
        `slug.ilike.${pattern}`,
        `city.ilike.${pattern}`,
      ].join(',')
    );
  }

  const { data, error, count } = await query;
  if (error) throw new Error(`getApprovedVendors: ${error.message}`);
  return { items: data ?? [], total: count ?? 0 };
}

export async function getVendorBySlug(slug: string) {
  const read = (select: string) =>
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
export async function getVendorStats(vendorId: string) {
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
