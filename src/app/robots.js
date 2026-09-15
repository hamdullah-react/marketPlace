import { SITE_URL } from '@/marketplace/lib/sitePages';

/**
 * /robots.txt — crawlers may read the public marketplace; dashboards, account
 * pages, checkout and the API are off limits. Whether each public page is
 * actually indexed is its own robots meta tag, set on Pages SEO.
 */
export default function robots() {
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
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
