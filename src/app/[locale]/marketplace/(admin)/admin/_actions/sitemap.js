'use server';

import { updateTag } from 'next/cache';
import { currentViewer } from '@/marketplace/auth/session';
import { SITE_TAGS } from '@/marketplace/lib/sitePages';

/**
 * Rebuild /sitemap.xml now, rather than when its cache happens to lapse.
 *
 * ── What "generate" means here ──────────────────────────────────────────────
 *
 * The sitemap has always been generated — it is built from the database on
 * request, and nobody has ever assembled one by hand. What did not exist was a
 * way to say "do it NOW": the build is wrapped in `'use cache'` with
 * cacheLife('hours'), so an admin who switched a page to noindex could watch
 * the viewer and the file disagree with their own setting for the rest of the
 * hour, with nothing on the screen to explain why.
 *
 * ── updateTag, not revalidateTag ────────────────────────────────────────────
 *
 * Both expire the tag. They differ in what the NEXT request gets, and the docs
 * are explicit that a Server Action wants the first:
 *
 *   updateTag      the next request waits for fresh data. Read-your-own-writes
 *                  — which is the whole point of a button somebody just
 *                  pressed and is now watching.
 *   revalidateTag  the next request is served STALE while a rebuild runs
 *                  behind it. Right for a webhook, wrong here: the admin would
 *                  press Regenerate and be shown the old sitemap.
 *
 * It is also the reason this is an action and not a route handler — updateTag
 * only works inside a Server Action.
 *
 * ── The tags are the ones the build declares ────────────────────────────────
 *
 * sitemapData.js tags its cache with SITE_TAGS.seo and SITE_TAGS.languages, so
 * those are what is expired. Naming a tag the build does not use would succeed
 * silently and change nothing, which is the failure this whole codebase keeps
 * running into with cache invalidation that nobody verified.
 */
export async function regenerateSitemap() {
  /* Admins only. The action is an HTTP endpoint like any other — anything that
     can reach the dashboard can post to it — and a cache stampede is a cheap
     thing to hand a stranger. */
  const viewer = await currentViewer();
  if (!viewer) return { ok: false, error: 'NOT_SIGNED_IN' };
  if (!viewer.isStaff) return { ok: false, error: 'NOT_ALLOWED' };

  updateTag(SITE_TAGS.seo);
  updateTag(SITE_TAGS.languages);

  return { ok: true, at: new Date().toISOString() };
}
