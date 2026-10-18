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

  /**
   * ── Four layers, and §32 added the third ──────────────────────────────
   *
   *   1. the page's own row        — Admin → Pages SEO
   *   2. the page's built-in text  — lib/sitePages.js
   *   3. the SITE's own defaults   — Admin → Settings → SEO defaults  ← new
   *   4. the site's identity       — its name, its tagline
   *
   * Three existed. The gap was the third: a site-wide title and description
   * written FOR a search result, as opposed to a company name and a line of
   * hero copy pressed into service as one.
   */
  const title =
    pick(row?.meta_title, locale) ||
    pick(page.title, locale) ||
    pick(site.seo?.title, locale) ||
    siteName;

  const description =
    pick(row?.meta_description, locale) ||
    pick(page.description, locale) ||
    pick(site.seo?.description, locale) ||
    pick(site.tagline, locale);

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
    keywords: (() => {
      const own = keywordList(row?.meta_keywords?.[locale]);
      return own.length ? own : keywordList(site.seo?.keywords?.[locale]);
    })(),
    focus: pick(row?.focus_keyword, locale),

    /**
     * The site-wide switch can only ever take indexing AWAY.
     *
     * `&&`, deliberately, not a value that replaces the page's own: staging
     * needs one lever that hides everything, and nobody ever needs a lever
     * that reveals a page an editor marked noindex. The page keeps the
     * stricter of the two answers.
     */
    index: (row ? row.seo_index !== false : page.index) && site.seo?.index !== false,
    follow: row ? row.seo_follow !== false : page.index,

    /** The follow-up questions: cached copy, preview length, image size. */
    directives: row?.robots_directives && typeof row.robots_directives === 'object' ? row.robots_directives : {},
    ogTitle,
    ogDescription,
    ogImage,
    ogType: row?.og_type || site.seo?.ogType || 'website',
    twitterCard: row?.twitter_card || site.seo?.twitterCard || 'summary_large_image',
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
    /**
     * index/follow, plus the four directives that decide what the RESULT
     * looks like once the page is listed (§32).
     *
     * Each is left out when the page says nothing about it, because "no
     * directive" and "the default value" are different instructions: emitting
     * `max-image-preview:standard` everywhere would quietly shrink the photo
     * on every car in the results, which is the opposite of what a marketplace
     * wants and is not a thing anyone asked for.
     */
    robots: (() => {
      const d = s.directives ?? {};
      const extra = {
        ...(d.archive === false ? { noarchive: true } : {}),
        ...(d.snippet === false ? { nosnippet: true } : {}),
        ...(Number.isFinite(Number(d.max_snippet)) ? { 'max-snippet': Number(d.max_snippet) } : {}),
        ...(['none', 'standard', 'large'].includes(d.max_image_preview)
          ? { 'max-image-preview': d.max_image_preview }
          : {}),
        ...(Number.isFinite(Number(d.max_video_preview)) ? { 'max-video-preview': Number(d.max_video_preview) } : {}),
      };

      return {
        index: s.index,
        follow: s.follow,
        ...extra,
        googleBot: { index: s.index, follow: s.follow, ...extra },
      };
    })(),
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
 * ── Tokens, because one row serves BOTH languages ──────────────────────────
 *
 * page_seo.structured_data is a single jsonb column, and the page it describes
 * renders at two URLs — /ar/marketplace/cars and /en/marketplace/cars. An
 * admin who pastes a graph with a real URL in it therefore publishes the
 * Arabic URL on the English page, where `url` and `@id` then disagree with the
 * canonical in the same <head>. That is not a small inaccuracy: `@id` is the
 * identity of the thing, so two pages claiming the same one is a merge
 * request, and a crawler resolves it by picking one and dropping the other.
 *
 * So a stored graph may carry placeholders, which are filled in per request —
 * the same values the <head> of that exact page is being built from, so the
 * two cannot drift:
 *
 *   {{locale}}   ar | en               {{url}}    this page, absolute
 *   {{home}}     the marketplace root   {{site}}   the site's name
 *   {{siteUrl}}  the origin             {{title}}  this page's title
 *   {{description}}  its meta description
 *   {{logo}}     the logo, absolute     {{ogImage}} the share image
 *   {{email}}    contact email          {{phone}}  contact phone
 *
 * The last four are the reason this is not just a URL fix. An Organization
 * block with the phone number typed into it goes stale the day Settings →
 * Contact changes, and nothing connects the two — whereas `{{phone}}` is read
 * from the same row the footer renders from, every time.
 *
 * A placeholder that resolves to nothing REMOVES its field rather than writing
 * an empty string: `"telephone": ""` is a claim that is wrong, where a missing
 * telephone is simply a gap. Anything that is not a placeholder is left
 * exactly as typed — an admin who wants a literal still gets one.
 */
const TOKEN = /\{\{(locale|url|home|siteUrl|site|title|description|logo|ogImage|email|phone)\}\}/g;

export function fillTokens(value, s, locale) {
  const table = {
    '{{locale}}': locale,
    '{{url}}': s.canonical || s.url,
    '{{home}}': `${SITE_URL}/${locale}/marketplace`,
    '{{siteUrl}}': SITE_URL,
    '{{site}}': s.siteName,
    '{{title}}': s.title,
    '{{description}}': s.description,
    '{{logo}}': absoluteUrl(s.site?.logoUrl) ?? '',
    '{{ogImage}}': absoluteUrl(s.ogImage) ?? '',
    '{{email}}': s.site?.contactEmail ?? '',
    '{{phone}}': s.site?.contactPhone ?? '',
  };

  const walk = (node) => {
    if (typeof node === 'string') {
      const filled = node.replace(TOKEN, (hit) => table[hit] ?? hit);
      // A field that is ONLY a placeholder, and the placeholder is empty.
      return filled === '' && node !== '' ? undefined : filled;
    }
    if (Array.isArray(node)) return node.map(walk).filter((v) => v !== undefined);
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node)
          .map(([k, v]) => [k, walk(v)])
          .filter(([, v]) => v !== undefined)
      );
    }
    return node;
  };

  return walk(value);
}

/**
 * The structured data a page carries when an admin has not written their own:
 * Organization + WebSite on the home page, a WebPage (AboutPage for About) with
 * its breadcrumb everywhere else.
 */
/** ISO weekday number → the schema.org URL a crawler expects. */
const DAY_NAMES = {
  1: 'https://schema.org/Monday',
  2: 'https://schema.org/Tuesday',
  3: 'https://schema.org/Wednesday',
  4: 'https://schema.org/Thursday',
  5: 'https://schema.org/Friday',
  6: 'https://schema.org/Saturday',
  7: 'https://schema.org/Sunday',
};

export function defaultStructuredData(s, locale) {
  const home = `${SITE_URL}/${locale}/marketplace`;
  /**
   * The business, from Admin → Settings → Business details (§32).
   *
   * Every field is omitted when it is blank rather than sent empty: a
   * `telephone: ""` is a claim that is wrong, where a missing telephone is a
   * gap. That is also why none of this is invented — a founding year or an
   * opening time that nobody typed is not a thing to guess at.
   */
  const org = s.site.org ?? {};
  const address = s.site.address ?? {};
  const locality = address[locale] || address.en || address.ar || null;

  const hours = (org.openingHours ?? [])
    .filter((h) => Array.isArray(h?.days) && h.days.length && h.opens && h.closes)
    .map((h) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: h.days.map((d) => DAY_NAMES[d]).filter(Boolean),
      opens: h.opens,
      closes: h.closes,
    }));

  const contactPoints = (org.contactPoints ?? [])
    .filter((p) => p?.type && (p.phone || p.email))
    .map((p) => ({
      '@type': 'ContactPoint',
      contactType: p.type,
      telephone: p.phone || undefined,
      email: p.email || undefined,
      availableLanguage: p.languages?.length ? p.languages : undefined,
    }));

  const socials = (s.site.socialLinks ?? [])
    .map((l) => l?.url)
    .filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u));

  const identifiers = [
    ...(org.crNumber ? [{ '@type': 'PropertyValue', name: 'CR', value: org.crNumber }] : []),
    ...(org.vatNumber ? [{ '@type': 'PropertyValue', name: 'VAT', value: org.vatNumber }] : []),
  ];

  const organization = {
    /* AutoDealer when there is a place with hours and a pin, Organization
       otherwise. The more specific type is what a map result and a knowledge
       panel key off — and claiming it without an address is markup that
       describes a business nobody can visit. */
    '@type': hours.length || org.geo || locality ? 'AutoDealer' : 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: s.siteName,
    legalName: org.legalName?.[locale] || org.legalName?.en || org.legalName?.ar || undefined,
    url: home,
    logo: absoluteUrl(s.site.logoUrl) ?? undefined,
    image: absoluteUrl(s.site.defaultOgImageUrl) ?? absoluteUrl(s.site.logoUrl) ?? undefined,
    email: s.site.contactEmail ?? undefined,
    telephone: s.site.contactPhone ?? undefined,
    foundingDate: org.foundedYear ? String(org.foundedYear) : undefined,
    priceRange: org.priceRange || undefined,
    /* The commercial registration and the VAT number, each labelled by the
       scheme it belongs to — an unlabelled number is a string nobody can
       verify. */
    identifier: identifiers.length ? identifiers : undefined,
    address: locality
      ? { '@type': 'PostalAddress', streetAddress: locality, addressCountry: 'SA' }
      : undefined,
    geo: org.geo
      ? { '@type': 'GeoCoordinates', latitude: org.geo.lat, longitude: org.geo.lng }
      : undefined,
    openingHoursSpecification: hours.length ? hours : undefined,
    contactPoint: contactPoints.length ? contactPoints : undefined,
    sameAs: socials.length ? socials : undefined,
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
