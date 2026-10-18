import { cacheLife, cacheTag } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { PUBLIC_STATES } from '@/marketplace/lib/listing';
import { getAllPageSeo, getSiteLanguages, getSiteSettings } from '@/marketplace/db/queries/site';
import { listBlogSlugs } from '@/marketplace/db/queries/blog';
import { SEO_PAGES, SITE_TAGS, SITE_URL, pagePath } from '@/marketplace/lib/sitePages';
import { getBrandsIndex } from '@/marketplace/db/queries/cars';
import { HELP_ARTICLES } from '@/marketplace/lib/help-articles';

/**
 * /sitemap.xml
 *
 *  - the public pages an admin has set to "Show in search results" on
 *    Admin → Website content → Pages SEO, with their change frequency and
 *    priority, once per language the site offers;
 *  - every live car whose own SEO tab has not switched indexing off;
 *  - every published article an admin has left indexable.
 *
 * Hidden pages are left out on purpose — a sitemap that lists a noindex page
 * is a contradiction search consoles report as an error.
 */
export default async function sitemap() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.seo);
  cacheTag(SITE_TAGS.languages);

  const [rows, langs, site] = await Promise.all([
    getAllPageSeo(),
    getSiteLanguages(),
    getSiteSettings().catch(() => null),
  ]);

  /* ── The site-wide switch, honoured here too ──────────────────────────────
     robots.txt already serves a flat refusal when Settings → SEO defaults
     turns visibility off (§32). A sitemap that went on listing every URL
     beside it would be the two files contradicting each other — and the
     sitemap is the one a search console reads as a SUBMISSION, so it is the
     half that gets reported as an error rather than quietly obeyed. */
  if (site?.seo?.index === false) return [];
  const byKey = new Map(rows.map((r) => [r.page_key, r]));
  const alternatesFor = (build) => ({
    languages: Object.fromEntries(langs.enabled.map((code) => [code, `${SITE_URL}${build(code)}`])),
  });

  const pages = SEO_PAGES.flatMap((page) => {
    const row = byKey.get(page.key);
    const index = row ? row.seo_index !== false : page.index;
    if (!index) return [];

    return langs.enabled.map((code) => ({
      url: `${SITE_URL}${pagePath(page, code)}`,
      lastModified: row?.updated_at ? new Date(row.updated_at) : undefined,
      changeFrequency: row?.seo_changefreq ?? page.changefreq,
      priority: Number(row?.seo_priority ?? page.priority),
      alternates: alternatesFor((c) => pagePath(page, c)),
    }));
  });

  /**
   * ── Every car, not the first thousand ──────────────────────────────────
   *
   * `.limit(5000)` was a request, not a guarantee: PostgREST caps a response at
   * PGRST_DB_MAX_ROWS — 1000 on this deployment — and returns exactly that many
   * with a 200 and no warning. A marketplace with 1,400 cars would have
   * published a sitemap listing 1,000 of them and looked completely healthy,
   * with the missing 400 indistinguishable from cars that were never listed.
   *
   * So it pages until a short page comes back. Capped at 50,000 URLs, which is
   * the protocol's own limit for a single sitemap file — past that the answer
   * is a sitemap index, not a longer file.
   */
  const listings = [];
  const PAGE = 1000;
  const MAX = 50_000;

  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await getMarketplaceDb()
      .from('listings')
      .select('slug, updated_at, seo_index, seo_changefreq, seo_priority, media')
      /* Sold cars included, and that is the point of keeping their page: the URL
         holds its inbound links and its ranking, so dropping it from the sitemap
         the day it sells throws away the thing the page was kept for. */
      .in('state', PUBLIC_STATES)
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) break;
    listings.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }

  /**
   * The photos go in as well — the one asset a CAR marketplace has that a
   * text site does not.
   *
   * A sitemap image entry gets a picture indexed that a crawl of the page
   * might not reach, and image search is a real doorway to a listing: people
   * look for what a car looks like in a colour long before they search its
   * price. Next emits these as the sitemap-image extension.
   *
   * Five per car. Past that the returns fall away sharply and the file grows
   * by a line per photo per language, and the order is the listing's own, so
   * the primary photo leads.
   */
  const photosOf = (l) =>
    (Array.isArray(l.media) ? l.media : [])
      .map((m) => m?.url)
      .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, 5);

  const cars = listings
    .filter((l) => l.slug && l.seo_index !== false)
    .flatMap((l) => {
      const images = photosOf(l);

      return langs.enabled.map((code) => ({
        url: `${SITE_URL}/${code}/marketplace/listing/${l.slug}`,
        lastModified: l.updated_at ? new Date(l.updated_at) : undefined,
        changeFrequency: l.seo_changefreq ?? 'weekly',
        priority: Number(l.seo_priority ?? 0.5),
        alternates: alternatesFor((c) => `/${c}/marketplace/listing/${l.slug}`),
        ...(images.length ? { images } : {}),
      }));
    });

  /* ── The showrooms ───────────────────────────────────────────────────────
     A storefront is a landing page in its own right — "معارض سيارات في جدة"
     lands here rather than on a car — and it was in no sitemap at all. Its own
     seo_index switch (§27) decides, exactly as a car's does. */
  /* Read here rather than through getApprovedVendors: that query serves the
     showroom GRID, whose SELECT deliberately carries no SEO columns, and a
     sitemap that cannot see seo_index would quietly publish a storefront that
     asked not to be listed. */
  const { data: vendorRows } = await getMarketplaceDb()
    .from('vendors')
    .select('slug, updated_at, seo_index, seo_changefreq, seo_priority')
    .eq('state', 'approved')
    .limit(1000);

  const showrooms = (vendorRows ?? [])
    .filter((v) => v.slug && v.seo_index !== false)
    .flatMap((v) =>
      langs.enabled.map((code) => ({
        url: `${SITE_URL}/${code}/marketplace/vendors/${v.slug}`,
        lastModified: v.updated_at ? new Date(v.updated_at) : undefined,
        changeFrequency: v.seo_changefreq ?? 'weekly',
        priority: Number(v.seo_priority ?? 0.7),
        alternates: alternatesFor((c) => `/${c}/marketplace/vendors/${v.slug}`),
      }))
    );

  /* ── One page per make ───────────────────────────────────────────────────
     getBrandsIndex only returns makes that HAVE a live car, which is the same
     rule the page itself enforces by 404ing — so this cannot list a brand page
     that renders as a 404. No lastModified: a make has no date of its own, and
     inventing one from "now" tells a crawler to come back for a change that
     did not happen. */
  const brandRows = await getBrandsIndex().catch(() => []);

  const brands = brandRows
    .filter((b) => b.slug)
    .flatMap((b) =>
      langs.enabled.map((code) => ({
        url: `${SITE_URL}/${code}/marketplace/brands/${b.slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: alternatesFor((c) => `/${c}/marketplace/brands/${b.slug}`),
      }))
    );

  /* ── The help articles ───────────────────────────────────────────────────
     Static text in the source, so there is no database read and no failure
     mode — and they are the pages that can earn a search before the visitor
     has heard of this marketplace. */
  const help = HELP_ARTICLES.flatMap((a) =>
    langs.enabled.map((code) => ({
      url: `${SITE_URL}/${code}/marketplace/help/${a.slug}`,
      changeFrequency: 'monthly',
      priority: 0.4,
      alternates: alternatesFor((c) => `/${c}/marketplace/help/${a.slug}`),
    }))
  );

  /* ── The articles ────────────────────────────────────────────────────────
     listBlogSlugs already filters to published AND indexable, and never throws:
     a database without the BLOG section returns nothing and the sitemap is the
     pages and the cars, exactly as it was before.

     lastModified is updated_at rather than published_at — a corrected article
     is worth re-crawling, and the trigger no longer lets a page VIEW touch that
     column (see schema.sql, THE BLOG). */
  const posts = (await listBlogSlugs()).flatMap((post) =>
    langs.enabled.map((code) => ({
      url: `${SITE_URL}/${code}/marketplace/blog/${post.slug}`,
      lastModified: post.updated_at ? new Date(post.updated_at) : undefined,
      changeFrequency: post.seo_changefreq ?? 'monthly',
      priority: Number(post.seo_priority ?? 0.6),
      alternates: alternatesFor((c) => `/${c}/marketplace/blog/${post.slug}`),
    }))
  );

  return [...pages, ...cars, ...showrooms, ...brands, ...help, ...posts];
}
