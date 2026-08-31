import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getViewer } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import ApplyForm from '../_components/ApplyForm';

export const metadata = {
  title: 'Vendor Application',
  robots: { index: false, follow: false },
};

/**
 * The application form — and the router for everyone who should not see it.
 *
 * Three ways in, three destinations:
 *
 *   not signed in     → login, and come straight back here afterwards
 *   already applied   → the status page, whatever the outcome was
 *   already approved  → the dashboard
 *
 * Sending an approved seller to a blank application is how someone ends up with
 * two showrooms, so the check is here rather than left to the action.
 */
export default async function SellApplyPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const viewer = await getViewer();

  if (!viewer) {
    redirect(
      `/${locale}/marketplace/login?next=${encodeURIComponent(`/${locale}/marketplace/sell/apply`)}`
    );
  }

  if (viewer.vendors.length) redirect(`/${locale}/marketplace/seller`);

  // getViewer() only reports APPROVED showrooms, so a pending application is
  // invisible to it by design. This is the one place that needs to see one.
  const { data: pending } = await getMarketplaceDb()
    .from('vendor_members')
    .select('vendor_id')
    .eq('user_id', viewer.userId)
    .limit(1)
    .maybeSingle();

  if (pending) redirect(`/${locale}/marketplace/sell/apply/status`);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      {/* Phone and city come from the profile they had to complete before
          getting here, so a showroom application opens half-filled instead of
          asking a third time for a number we already hold. Both stay editable:
          a showroom's public number is often not the owner's mobile. */}
      <ApplyForm
        locale={locale}
        email={viewer.email ?? ''}
        phone={viewer.phone ?? ''}
        city={viewer.city ?? ''}
      />
    </div>
  );
}
