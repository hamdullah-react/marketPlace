import { resolvePageSeo, defaultStructuredData } from '@/marketplace/seo/pageMetadata';

/**
 * The page's JSON-LD. The admin's own structured data when they wrote some on
 * Pages SEO, otherwise a sensible default (see defaultStructuredData).
 *
 * `<` is escaped so a value can never close the script tag — the same guard the
 * listing page uses.
 */
export default async function SeoJsonLd({ pageKey, locale = 'ar' }) {
  const s = await resolvePageSeo(pageKey, locale);
  if (!s) return null;

  const data = s.structuredData ?? defaultStructuredData(s, locale);
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
