import { getViewer } from '@/marketplace/auth/session';
import { getNavData } from '@/marketplace/db/queries/cars';
import { getSavedCount } from '@/marketplace/db/queries/account';
import { getSiteLanguages, getSiteSettings } from '@/marketplace/db/queries/site';
import MarketplaceHeader from './MarketplaceHeader';

/**
 * Reads who is signed in, then renders the header.
 *
 * A thin server component in front of a client one, because the header needs
 * the viewer and cannot fetch it: it is "use client" for the dropdown and the
 * mobile drawer. The four group layouts render THIS instead of the header
 * directly, so the lookup is written once rather than copied into each of them.
 *
 * Reading the user in a layout is fine and is what Next's auth guide suggests;
 * what must NOT live in a layout is the CHECK, because partial rendering means
 * layouts do not re-run on navigation. Nothing here decides anything — it
 * decides what to draw. Every real decision is a guard in
 * src/marketplace/auth/session.js or a policy in Postgres.
 *
 * The staleness that implies is handled by the auth actions, which call
 * revalidatePath(..., 'layout') so the header is rebuilt the moment someone
 * signs in or out.
 */
export default async function HeaderSlot({ locale = 'ar' }) {
  /**
   * Both at once. The brand menu does not depend on who is looking and the
   * viewer does not depend on the catalog, so awaiting them in turn would make
   * the header cost the sum of two round trips to render the same markup. The
   * menu read is cached (see getNavData), so in the steady state this is one
   * request's latency, not two.
   *
   * A menu read that fails is a header with one fewer row in the Cars menu,
   * never a header that fails — getNavData already swallows its own errors,
   * and .catch here covers the rest.
   */
  // The brand and languages come from Admin → Settings; both reads are cached.
  const [viewer, nav, site, langs] = await Promise.all([
    getViewer(),
    getNavData().catch(() => ({ brands: [], offerCount: 0 })),
    getSiteSettings(),
    getSiteLanguages(),
  ]);

  /**
   * The saved-cars badge, and the only thing here that depends on the viewer —
   * so it cannot join the Promise.all above and has to follow it.
   *
   * Serial, and cheap enough to be: `head: true` on a two-column index, sent
   * only for someone who is signed in. A signed-out visitor's hearts live in
   * localStorage (see ListingCard) and are not counted here — the badge links
   * to /account/saved, so a number that survives a sign-in it was never
   * migrated through would be pointing at a page that says nothing is saved.
   *
   * This number is a STARTING POINT, not the live one. The header is rendered
   * by a layout and layouts do not re-run on navigation, so the moment a heart
   * is tapped it is savedStore.js that keeps the badge honest.
   */
  const savedCount = viewer ? await getSavedCount(viewer.userId) : 0;

  return (
    <MarketplaceHeader
      locale={locale}
      offerCount={nav.offerCount}
      savedCount={savedCount}
      brand={{
        name: locale === 'en' ? site.name.en : site.name.ar,
        logoUrl: site.logoUrl,
        logoDarkUrl: site.logoDarkUrl,
      }}
      languages={langs.enabled}
      viewer={
        viewer
          ? {
              // Only what the menu draws. The full viewer carries ids and role
              // internals that have no business being serialised into the page
              // for every visitor to read.
              name: viewer.fullName || viewer.email,
              email: viewer.email,
              avatarUrl: viewer.avatarUrl,
              isStaff: viewer.isStaff,
              isAdmin: viewer.isAdmin,
              isVendor: viewer.vendors.length > 0,
            }
          : null
      }
    />
  );
}
