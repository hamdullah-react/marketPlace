import { getSiteSettings } from '@/marketplace/db/queries/site';
import { SITE_URL } from '@/marketplace/lib/sitePages';

/**
 * /robots.txt — crawlers may read the public marketplace; dashboards, account
 * pages, checkout and the API are off limits. Whether each public page is
 * actually indexed is its own robots meta tag, set on Pages SEO.
 *
 * ── Two halves, and only one of them is editable ───────────────────────────
 *
 * The list below is in code and stays there. A robots.txt that can be emptied
 * from a form is one bad afternoon away from an indexed admin panel, and none
 * of these is a matter of opinion. Admin → Settings → SEO defaults adds LINES
 * to it; it cannot take any away.
 *
 * ── The kill switch ────────────────────────────────────────────────────────
 *
 * With site-wide visibility turned off, this serves a flat refusal instead:
 * every crawler, every path. That is the correct robots.txt for a staging copy
 * and for the week before launch, and it belongs here as well as in the meta
 * tags — a crawler reads this file FIRST, so it is the only one of the two
 * that prevents the fetch rather than regretting it afterwards.
 */
export default async function robots() {
  const site = await getSiteSettings().catch(() => null);

  if (site?.seo?.index === false) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      host: SITE_URL,
    };
  }

  /* One path per line in the box, already stripped of any "Disallow:" prefix
     by the action that saved it. */
  const extra = (site?.seo?.robotsExtra ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/marketplace/admin',
          '/*/marketplace/seller',
          '/*/marketplace/account',
          '/*/marketplace/cart',
          '/*/marketplace/checkout',
          '/*/marketplace/orders',

          /* The rest of the pages that carry a hardcoded noindex, listed here
             too. A robots meta tag is only read AFTER the page is fetched, so
             it spends crawl budget to say "do not keep this"; a Disallow line
             stops the fetch. Both together is the belt-and-braces pair every
             one of these wants — none of them is a page a search result should
             ever land on, and none has anything to rank for. */
          '/*/marketplace/track-order',
          '/*/marketplace/order-confirmation',
          '/*/marketplace/subscription',
          '/*/marketplace/complete-profile',
          '/*/marketplace/sell/apply/status',
          '/*/marketplace/theme-lab',

          ...extra,
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
