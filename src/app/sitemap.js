import { sitemapEntries } from '@/marketplace/seo/sitemapData';

/**
 * /sitemap.xml
 *
 *  - the public pages an admin has set to "Show in search results" on
 *    Admin → Website content → Pages SEO, with their change frequency and
 *    priority, once per language the site offers;
 *  - every live car whose own SEO tab has not switched indexing off;
 *  - every approved showroom, every make with a live car, the help articles
 *    and every published article an admin has left indexable.
 *
 * Hidden pages are left out on purpose — a sitemap that lists a noindex page
 * is a contradiction search consoles report as an error.
 *
 * ── Why this file is four lines ─────────────────────────────────────────────
 *
 * The build moved to marketplace/seo/sitemapData.js so that the admin's
 * sitemap viewer can read the SAME thing rather than re-querying the same
 * tables and slowly drifting from it. A viewer that disagrees with the file it
 * describes is worse than no viewer: it is consulted exactly when somebody
 * already suspects the sitemap is wrong.
 *
 * `'use cache'`, cacheLife and the tags live with the build, in that file.
 */
export default async function sitemap() {
  return sitemapEntries();
}
