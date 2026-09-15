import { cacheLife, cacheTag } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getAllPageSeo, getSiteLanguages } from '@/marketplace/db/queries/site';
import { SEO_PAGES, SITE_TAGS, SITE_URL, pagePath } from '@/marketplace/lib/sitePages';

/**
 * /sitemap.xml
 *
 *  - the public pages an admin has set to "Show in search results" on
 *    Admin → Website content → Pages SEO, with their change frequency and
 *    priority, once per language the site offers;
 *  - every live car whose own SEO tab has not switched indexing off.
 *
 * Hidden pages are left out on purpose — a sitemap that lists a noindex page
 * is a contradiction search consoles report as an error.
 */
export default async function sitemap() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.seo);
  cacheTag(SITE_TAGS.languages);

  const [rows, langs] = await Promise.all([getAllPageSeo(), getSiteLanguages()]);
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

  const { data: listings, error } = await getMarketplaceDb()
    .from('listings')
    .select('slug, updated_at, seo_index, seo_changefreq, seo_priority')
    .eq('state', 'live')
    .limit(5000);

  const cars = error
    ? []
    : (listings ?? [])
        .filter((l) => l.slug && l.seo_index !== false)
        .flatMap((l) =>
          langs.enabled.map((code) => ({
            url: `${SITE_URL}/${code}/marketplace/listing/${l.slug}`,
            lastModified: l.updated_at ? new Date(l.updated_at) : undefined,
            changeFrequency: l.seo_changefreq ?? 'weekly',
            priority: Number(l.seo_priority ?? 0.5),
            alternates: alternatesFor((c) => `/${c}/marketplace/listing/${l.slug}`),
          }))
        );

  return [...pages, ...cars];
}
