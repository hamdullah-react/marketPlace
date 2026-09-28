import { setRequestLocale } from 'next-intl/server';
import { requireVendor } from '@/marketplace/auth/session';
import { getShellVendor } from './_apicalls/shellApi';
import { getNotifications } from '@/marketplace/db/queries/notifications';
import SellerShell from './_components/SellerShell';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

/**
 * (seller) — vendor dashboard. Never indexed.
 *
 * The shell lives here so the sidebar renders once and survives navigation
 * between seller pages instead of remounting on every route change.
 *
 * The vendor picker is NOT here. It belongs inside the page's content flow,
 * under the header and above the cards — floating it in the layout put a
 * full-bleed banner above the dashboard's own padding, which is what made it
 * look bolted on.
 *
 * ── The gate here is the FLOW, not the security ─────────────────────────────
 *
 * requireVendor() below decides where someone who is not a seller should go:
 * to the application form, not to an empty dashboard that gives no hint what
 * is missing. That is a routing decision, and it belongs at the entrance.
 *
 * It is deliberately NOT what protects the data, because a layout cannot be:
 * partial rendering means it does not re-run on navigation between seller
 * pages. The actual protection is three-deep and independent of this file —
 * getVendorOptions() returns only showrooms the caller belongs to, every write
 * action re-derives the vendor from the session, and the RLS policies refuse
 * anything that slips past both.
 *
 * Note the vendor read is started but NOT awaited. A layout sits above
 * loading.js and above every page's Suspense boundaries, so anything it awaits
 * blocks the whole dashboard — sidebar, header and content — with nothing able
 * to cover for it. Handing the promise down lets the shell paint immediately
 * and resolve the vendor name inside its own boundary.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function SellerLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Signed out → login. Signed in without an approved showroom → the
  // application. Subscription lapsed → /marketplace/subscription. Awaited,
  // unlike the shell vendor below, because there is no point streaming a
  // dashboard to someone who is about to be sent elsewhere.
  const { vendor } = await requireVendor();

  return (
    <SellerShell
      locale={locale}
      vendorPromise={getShellVendor(locale)}
      /* NOT awaited, for the same reason as the shell vendor above: a layout
         sits over every page's boundaries, so anything it waits for holds the
         whole dashboard. The bell resolves inside its own Suspense. */
      notificationsPromise={getNotifications({ audience: 'vendor', vendorId: vendor.id }).catch(
        () => ({ items: [], unread: 0 })
      )}
      /* The verdict, computed ONCE, here. The header chip reads it and
         /seller/subscription reads it again from the same session, so the
         countdown and the page it opens cannot tell a seller two things — which
         is the rule the blocked screen was rewritten to obey. */
      access={vendor.access}
    >
      {/* ── The banners are GONE from here, on purpose ───────────────
          Two of them used to sit at the top of every page in the dashboard —
          above the listings, above the leads, above the media library — for as
          long as they applied. Two lines of amber over a screen somebody opened
          to do something else is not a warning; it is a tax on every other task,
          and it stops being read by about the second day.

          What is persistent instead is the countdown in the header, which is
          always on screen and changes colour as the date approaches. It links to
          /seller/subscription, where the full warning lives along with the
          reason, the renewal control and the bank details — so the notice is one
          press away rather than in the way. See that page and AccessCountdown.

          The blocked screen is unaffected: a showroom that is actually out is
          redirected by requireVendor() above and never reaches this layout. */}
      {children}
    </SellerShell>
  );
}
