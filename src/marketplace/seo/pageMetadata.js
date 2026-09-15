import 'server-only';

/**
 * Search and share metadata for the public pages, from Admin → Website content
 * → Pages SEO.
 *
 * ONE resolver feeds both generateMetadata (pageMetadata) and the JSON-LD
 * component (SeoJsonLd), so the canonical URL in the <head> and the url in the
 * structured data can never disagree.
 *
 * Every field falls back: the admin's value, then the page's built-in text in
 * sitePages.js, then the site-wide defaults from Settings.
 */

import { getPageSeo, getSiteLanguages, getSiteSettings } from '@/marketplace/db/queries/site';
import { keywordList } from '@/marketplace/lib/seo';
import { SEO_PAGE_BY_KEY, SITE_URL, pagePath } from '@/marketplace/lib/sitePages';

const pick = (value, locale) => {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  return String(value[locale] ?? '').trim();
};

/** An uploaded URL is absolute already; the built-in logo is a site path. */
export const absoluteUrl = (url) => (!url ? null : /^https?:\/\//i.test(url) ? url : `${SITE_URL}${url.startsWith('/') ? '' : '/'}${url}`);

export async function resolvePageSeo(key, locale) {
  const page = SEO_PAGE_BY_KEY[key];
  if (!page) return null;

  const [row, site, langs] = await Promise.all([getPageSeo(key), getSiteSettings(), getSiteLanguages()]);

  const siteName = pick(site.name, locale);
  const title = pick(row?.meta_title, locale) || pick(page.title, locale) || siteName;
  const description = pick(row?.meta_description, locale) || pick(page.description, locale) || pick(site.tagline, locale);
  const url = `${SITE_URL}${pagePath(page, locale)}`;

  const ogTitle = pick(row?.og_title, locale) || title;
  const ogDescription = pick(row?.og_description, locale) || description;
  const ogImage = row?.og_image_url || site.defaultOgImageUrl || null;

  return {
    page,
    site,
    langs,
    siteName,
    title,
    description,
    url,
    canonical: row?.canonical_url || url,
    keywords: keywordList(row?.meta_keywords?.[locale]),
    focus: pick(row?.focus_keyword, locale),
    index: row ? row.seo_index !== false : page.index,
    follow: row ? row.seo_follow !== false : page.index,
    ogTitle,
    ogDescription,
    ogImage,
    ogType: row?.og_type || 'website',
    twitterCard: row?.twitter_card || 'summary_large_image',
    twitterTitle: pick(row?.twitter_title, locale) || ogTitle,
    twitterDescription: pick(row?.twitter_description, locale) || ogDescription,
    twitterImage: row?.twitter_image_url || ogImage,
    structuredData: row?.structured_data ?? null,
    customised: Boolean(row),
  };
}

export async function pageMetadata(key, locale) {
  const s = await resolvePageSeo(key, locale);
  if (!s) return {};

  // Only the languages the site actually offers get an hreflang.
  const languages = Object.fromEntries(
    s.langs.enabled.map((code) => [code, `${SITE_URL}${pagePath(s.page, code)}`])
  );
  languages['x-default'] = `${SITE_URL}${pagePath(s.page, s.langs.defaultLocale)}`;

  const handle = s.site.twitterHandle ? `@${s.site.twitterHandle.replace(/^@/, '')}` : undefined;

  return {
    // The home page's title is the whole title; every other page sits inside
    // the layout's "%s | <site name>" template.
    title: s.page.key === 'home' ? { absolute: s.title } : s.title,
    description: s.description || undefined,
    keywords: s.keywords.length ? s.keywords : null,
    alternates: { canonical: s.canonical, languages },
    robots: {
      index: s.index,
      follow: s.follow,
      googleBot: { index: s.index, follow: s.follow },
    },
    openGraph: {
      title: s.ogTitle,
      description: s.ogDescription || undefined,
      url: s.canonical,
      siteName: s.siteName,
      type: s.ogType,
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
      alternateLocale: s.langs.enabled.filter((c) => c !== locale).map((c) => (c === 'ar' ? 'ar_SA' : 'en_US')),
      images: s.ogImage ? [{ url: absoluteUrl(s.ogImage), width: 1200, height: 630, alt: s.ogTitle }] : undefined,
    },
    twitter: {
      card: s.twitterCard,
      title: s.twitterTitle,
      description: s.twitterDescription || undefined,
      images: s.twitterImage ? [absoluteUrl(s.twitterImage)] : undefined,
      site: handle,
      creator: handle,
    },
  };
}

/**
 * The structured data a page carries when an admin has not written their own:
 * Organization + WebSite on the home page, a WebPage (AboutPage for About) with
 * its breadcrumb everywhere else.
 */
export function defaultStructuredData(s, locale) {
  const home = `${SITE_URL}/${locale}/marketplace`;
  const organization = {
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: s.siteName,
    url: home,
    logo: absoluteUrl(s.site.logoUrl) ?? undefined,
    email: s.site.contactEmail ?? undefined,
    telephone: s.site.contactPhone ?? undefined,
  };

  if (s.page.key === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        organization,
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: s.siteName,
          description: s.description || undefined,
          url: home,
          inLanguage: s.langs.enabled,
          publisher: { '@id': `${SITE_URL}/#organization` },
        },
      ],
    };
  }

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': s.page.key === 'about' ? 'AboutPage' : 'WebPage',
        name: s.title,
        description: s.description || undefined,
        url: s.canonical,
        inLanguage: locale,
        isPartOf: { '@type': 'WebSite', name: s.siteName, url: home },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: s.siteName, item: home },
          { '@type': 'ListItem', position: 2, name: s.title, item: s.url },
        ],
      },
    ],
  };
}
