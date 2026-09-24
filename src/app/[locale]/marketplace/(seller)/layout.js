import { setRequestLocale } from 'next-intl/server';
import { requireVendor } from '@/marketplace/auth/session';
import { getShellVendor } from './_apicalls/shellApi';
import SellerShell from './_components/SellerShell';
import TrialEndingBanner from './_components/TrialEndingBanner';

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

  /**
   * The warning, days before the wall.
   *
   * A seller whose dashboard simply stops one morning has been ambushed, and
   * the first thing they do about it is ring somebody. This is the cheapest
   * possible prevention: one line, only inside the last week, carrying the date
   * and the way to sort it out.
   *
   * In the LAYOUT rather than on each page so it follows them around the
   * dashboard — and it is the one thing a layout is genuinely right for here,
   * because it is a notice rather than a gate. The gate is requireVendor()
   * above, which re-runs on every page; this is allowed to be stale by a
   * navigation, because being a day out on a countdown costs nothing.
   */
  const ending = vendor.access.state === 'ending';

  return (
    <SellerShell locale={locale} vendorPromise={getShellVendor(locale)}>
      {ending ? (
        <TrialEndingBanner locale={locale} daysLeft={vendor.access.daysLeft} until={vendor.access.until} />
      ) : null}
      {children}
    </SellerShell>
  );
}
