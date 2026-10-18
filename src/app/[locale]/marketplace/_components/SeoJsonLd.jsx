import { resolvePageSeo, defaultStructuredData, fillTokens } from '@/marketplace/seo/pageMetadata';

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

  /* The admin's graph with its placeholders resolved for THIS language — see
     fillTokens — or the generated one when they have not written any. */
  const data = s.structuredData ? fillTokens(s.structuredData, s, locale) : defaultStructuredData(s, locale);
  const json = JSON.stringify(data).replace(/</g, '\\u003c');

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
