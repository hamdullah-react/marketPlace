import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { PUBLIC_STATES } from '@/marketplace/lib/listing';
import { getAllPageSeo, getSiteLanguages, getSiteSettings } from '@/marketplace/db/queries/site';
import { listBlogSlugs } from '@/marketplace/db/queries/blog';
import { SEO_PAGES, SITE_TAGS, SITE_URL, pagePath } from '@/marketplace/lib/sitePages';
import { getBrandsIndex } from '@/marketplace/db/queries/cars';
import { HELP_ARTICLES } from '@/marketplace/lib/help-articles';

/**
 * EVERYTHING that goes into /sitemap.xml, grouped, plus what was left out.
 *
 * ── Why this is not inside app/sitemap.js any more ──────────────────────────
 *
 * The admin needs to SEE the sitemap, and the obvious way to build that screen
 * is to query the same tables again and lay the results out. That is the one
 * implementation guaranteed to go wrong: the moment a rule changes in one file
 * and not the other, the viewer starts describing a sitemap that is not the
 * one being served — and it is a screen somebody looks at precisely when they
 * suspect the sitemap is wrong, so it would mislead at exactly the wrong time.
 *
 * So the build lives here, once. app/sitemap.js flattens this into the array
 * Next wants; the admin page reads the groups. Neither knows a rule the other
 * does not.
 *
 * ── The entries keep Next's exact shape ─────────────────────────────────────
 *
 * Group labels and exclusion reasons are kept BESIDE the entries rather than
 * on them, because the entries are handed to Next verbatim and a stray
 * property in a MetadataRoute.Sitemap item is not something to find out about
 * from a malformed XML file in production.
 *
 * ── Exclusions are collected, not silently dropped ──────────────────────────
 *
 * Every `if (!index) return []` in the old code threw away the one fact an
 * admin asks for most: not "what is in the sitemap" but "why is MY page not in
 * it". Each filter now records what it removed and on whose instruction, so
 * the screen can answer that without anybody reading SQL.
 */

/** A page in this list is in the sitemap once per enabled language. */
export const SITEMAP_GROUPS = [
  { key: 'pages', ar: 'الصفحات', en: 'Pages' },
  { key: 'cars', ar: 'السيارات', en: 'Cars' },
  { key: 'showrooms', ar: 'المعارض', en: 'Showrooms' },
  { key: 'brands', ar: 'الماركات', en: 'Brands' },
  { key: 'help', ar: 'المساعدة', en: 'Help' },
  { key: 'blog', ar: 'المقالات', en: 'Articles' },
];

export async function buildSitemap() {
  'use cache';
  cacheLife('hours');
  cacheTag(SITE_TAGS.seo);
  cacheTag(SITE_TAGS.languages);

  const [rows, langs, site] = await Promise.all([
    getAllPageSeo(),
    getSiteLanguages(),
    getSiteSettings().catch(() => null),
  ]);

  const excluded = [];
  const groups = Object.fromEntries(SITEMAP_GROUPS.map((g) => [g.key, []]));

  /**
   * Every fixed page and whether it is currently in the sitemap.
   *
   * Built here rather than on the admin screen so the switch an admin flips is
   * reading the SAME rule that decides the file's contents — a page_seo row's
   * seo_index when there is a row, and the page's own built-in default when
   * there is not.
   *
   * Computed BEFORE the site-wide kill switch returns, because an admin whose
   * whole site is hidden still has to be able to see and set these; the screen
   * explains that nothing is published while the switch is off.
   */
  const byKeyAll = new Map(rows.map((r) => [r.page_key, r]));
  const pageControls = SEO_PAGES.map((page) => {
    const row = byKeyAll.get(page.key);
    return {
      key: page.key,
      path: pagePath(page, langs.enabled[0] ?? 'ar'),
      index: row ? row.seo_index !== false : page.index,
      customised: Boolean(row),
      changefreq: row?.seo_changefreq ?? page.changefreq,
      priority: Number(row?.seo_priority ?? page.priority),
    };
  });

  /* The site-wide switch. robots.txt already serves a flat refusal when
     Settings → SEO defaults turns visibility off (§32); a sitemap listing every
     URL beside it would be the two files contradicting each other, and the
     sitemap is the half a search console reads as a SUBMISSION. */
  if (site?.seo?.index === false) {
    return {
      disabled: true,
      languages: langs.enabled,
      groups,
      excluded: [],
      pageControls,
      generatedAt: new Date().toISOString(),
    };
  }

  const byKey = new Map(rows.map((r) => [r.page_key, r]));
  const alternatesFor = (build) => ({
    languages: Object.fromEntries(langs.enabled.map((code) => [code, `${SITE_URL}${build(code)}`])),
  });

  // ── pages ──────────────────────────────────────────────────────────────
  for (const page of SEO_PAGES) {
    const row = byKey.get(page.key);
    const index = row ? row.seo_index !== false : page.index;

    if (!index) {
      excluded.push({
        group: 'pages',
        label: page.key,
        path: pagePath(page, langs.enabled[0] ?? 'ar'),
        reason: row ? 'seo_index_off' : 'default_hidden',
      });
      continue;
    }

    for (const code of langs.enabled) {
      groups.pages.push({
        url: `${SITE_URL}${pagePath(page, code)}`,
        lastModified: row?.updated_at ? new Date(row.updated_at) : undefined,
        changeFrequency: row?.seo_changefreq ?? page.changefreq,
        priority: Number(row?.seo_priority ?? page.priority),
        alternates: alternatesFor((c) => pagePath(page, c)),
      });
    }
  }

  // ── cars ───────────────────────────────────────────────────────────────
  /**
   * Paged, not `.limit(5000)`: PostgREST caps a response at PGRST_DB_MAX_ROWS
   * — 1000 here — and returns exactly that many with a 200 and no warning. A
   * marketplace with 1,400 cars would publish 1,000 of them and look healthy.
   */
  const listings = [];
  const PAGE = 1000;
  const MAX = 50_000;

  for (let from = 0; from < MAX; from += PAGE) {
    const { data, error } = await getMarketplaceDb()
      .from('listings')
      .select('slug, updated_at, seo_index, seo_changefreq, seo_priority, media, state')
      /* Sold cars included, and that is the point of keeping their page: the
         URL holds its inbound links and its ranking. */
      .in('state', PUBLIC_STATES)
      .order('updated_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) break;
    listings.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) break;
  }

  /* Five photos per car. Past that the returns fall away sharply and the file
     grows by a line per photo per language; the order is the listing's own, so
     the primary photo leads. */
  const photosOf = (l) =>
    (Array.isArray(l.media) ? l.media : [])
      .map((m) => m?.url)
      .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
      .slice(0, 5);

  for (const l of listings) {
    if (!l.slug) continue;
    if (l.seo_index === false) {
      excluded.push({
        group: 'cars',
        label: l.slug,
        path: `/marketplace/listing/${l.slug}`,
        reason: 'seo_index_off',
      });
      continue;
    }

    const images = photosOf(l);
    for (const code of langs.enabled) {
      groups.cars.push({
        url: `${SITE_URL}/${code}/marketplace/listing/${l.slug}`,
        lastModified: l.updated_at ? new Date(l.updated_at) : undefined,
        changeFrequency: l.seo_changefreq ?? 'weekly',
        priority: Number(l.seo_priority ?? 0.5),
        alternates: alternatesFor((c) => `/${c}/marketplace/listing/${l.slug}`),
        ...(images.length ? { images } : {}),
      });
    }
  }

  // ── showrooms ──────────────────────────────────────────────────────────
  /* Read here rather than through getApprovedVendors: that query serves the
     showroom GRID, whose SELECT carries no SEO columns, and a sitemap that
     cannot see seo_index would publish a storefront that asked not to be. */
  const { data: vendorRows } = await getMarketplaceDb()
    .from('vendors')
    .select('slug, updated_at, seo_index, seo_changefreq, seo_priority')
    .eq('state', 'approved')
    .limit(1000);

  for (const v of vendorRows ?? []) {
    if (!v.slug) continue;
    if (v.seo_index === false) {
      excluded.push({
        group: 'showrooms',
        label: v.slug,
        path: `/marketplace/vendors/${v.slug}`,
        reason: 'seo_index_off',
      });
      continue;
    }
    for (const code of langs.enabled) {
      groups.showrooms.push({
        url: `${SITE_URL}/${code}/marketplace/vendors/${v.slug}`,
        lastModified: v.updated_at ? new Date(v.updated_at) : undefined,
        changeFrequency: v.seo_changefreq ?? 'weekly',
        priority: Number(v.seo_priority ?? 0.7),
        alternates: alternatesFor((c) => `/${c}/marketplace/vendors/${v.slug}`),
      });
    }
  }

  // ── brands ─────────────────────────────────────────────────────────────
  /* getBrandsIndex only returns makes that HAVE a live car, the same rule the
     page enforces by 404ing — so this cannot list a brand page that 404s. No
     lastModified: a make has no date of its own, and inventing one from "now"
     tells a crawler to come back for a change that did not happen. */
  const brandRows = await getBrandsIndex().catch(() => []);
  for (const b of brandRows) {
    if (!b.slug) continue;
    for (const code of langs.enabled) {
      groups.brands.push({
        url: `${SITE_URL}/${code}/marketplace/brands/${b.slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
        alternates: alternatesFor((c) => `/${c}/marketplace/brands/${b.slug}`),
      });
    }
  }

  // ── help ───────────────────────────────────────────────────────────────
  for (const a of HELP_ARTICLES) {
    for (const code of langs.enabled) {
      groups.help.push({
        url: `${SITE_URL}/${code}/marketplace/help/${a.slug}`,
        changeFrequency: 'monthly',
        priority: 0.4,
        alternates: alternatesFor((c) => `/${c}/marketplace/help/${a.slug}`),
      });
    }
  }

  // ── blog ───────────────────────────────────────────────────────────────
  /* listBlogSlugs already filters to published AND indexable, and never throws:
     a database without the BLOG section returns nothing. */
  for (const post of await listBlogSlugs()) {
    for (const code of langs.enabled) {
      groups.blog.push({
        url: `${SITE_URL}/${code}/marketplace/blog/${post.slug}`,
        lastModified: post.updated_at ? new Date(post.updated_at) : undefined,
        changeFrequency: post.seo_changefreq ?? 'monthly',
        priority: Number(post.seo_priority ?? 0.6),
        alternates: alternatesFor((c) => `/${c}/marketplace/blog/${post.slug}`),
      });
    }
  }

  return {
    disabled: false,
    languages: langs.enabled,
    groups,
    excluded,
    pageControls,
    generatedAt: new Date().toISOString(),
  };
}

/** The flat array /sitemap.xml is built from. Order is the file's order. */
export async function sitemapEntries() {
  const report = await buildSitemap();
  return SITEMAP_GROUPS.flatMap((g) => report.groups[g.key] ?? []);
}

/**
 * The numbers the viewer leads with.
 *
 * Counted from the SAME report rather than queried, so a total can never
 * disagree with the rows printed under it.
 */
export function summarise(report) {
  const groups = SITEMAP_GROUPS.map((g) => {
    const entries = report.groups[g.key] ?? [];
    const images = entries.reduce((n, e) => n + (e.images?.length ?? 0), 0);
    return {
      ...g,
      count: entries.length,
      images,
      /* Per-language, because every URL appears once per enabled language and
         "98 URLs" on a bilingual site is really 49 pages twice. */
      unique: report.languages.length ? Math.round(entries.length / report.languages.length) : entries.length,
    };
  });

  const urls = groups.reduce((n, g) => n + g.count, 0);
  const images = groups.reduce((n, g) => n + g.images, 0);
  const lastModified = SITEMAP_GROUPS
    .flatMap((g) => report.groups[g.key] ?? [])
    .map((e) => e.lastModified)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;

  return { groups, urls, images, excluded: report.excluded.length, lastModified };
}
