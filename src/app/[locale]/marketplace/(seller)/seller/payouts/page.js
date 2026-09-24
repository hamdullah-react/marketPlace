import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';

export const instant = false;

export const metadata = {
  title: 'Billing',
  robots: { index: false, follow: false },
};

/**
 * Payouts became Billing, and this keeps the old address working.
 *
 * ── Why the page it held is gone ────────────────────────────────────────────
 *
 * It showed what the PLATFORM owed this SHOWROOM — a statement of account built
 * on `payouts`, which is fed by orders the platform collected on their behalf.
 * There are no orders: a buyer sends a request, the showroom rings them, and the
 * car is paid for at the showroom. So the page was correct, complete, and able
 * to show nothing, for ever.
 *
 * What a seller actually needs is the other direction — what they owe for a
 * promotion they were granted — and that is /seller/billing.
 *
 * ── A redirect rather than a deletion ───────────────────────────────────────
 *
 * This URL is in the sidebar's history, in browser bookmarks and in whatever
 * emails have linked it. A 404 would tell a seller their money screen had
 * disappeared, which is the worst possible reading of a change that gave them a
 * better one. `redirect()` is permanent enough for a sidebar link and costs one
 * hop; the replacement is a route away.
 */
export default async function SellerPayoutsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  redirect(`/${locale}/marketplace/seller/billing`);
}
