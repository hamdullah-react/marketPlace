import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import HeaderSlot from '../_components/HeaderSlot';
import { HeaderSkeleton } from '../_components/Skeletons';
import MarketplaceFooter from '../_components/MarketplaceFooter';
import CompareBar from '../_components/CompareBar';

/**
 * Public chrome for (browse).
 *
 * dir and the page background are set here rather than on the marketplace
 * segment layout — the dashboard groups need a different shell, and a shared
 * wrapper div there breaks shadcn's sidebar flex chain.
 */
export default async function GroupLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="marketplace-root flex min-h-screen flex-col bg-white text-neutral-900 dark:bg-[#0f0f0f] dark:text-neutral-100"
    >
      {/* The session read lives behind a boundary so the page around it can
          still be prerendered — see HeaderSkeleton. */}
      <Suspense fallback={<HeaderSkeleton />}>
        <HeaderSlot locale={locale} />
      </Suspense>
      {/* Offsets the fixed 80px header. */}
      <div className="flex-1 pt-20">{children}</div>
      <MarketplaceFooter locale={locale} />
      {/* Renders nothing until a car is ticked, and nothing on the compare
          page itself — see CompareBar. Mounted here rather than per page so
          a shortlist survives moving between the grid, a car and a
          showroom. */}
      <CompareBar locale={locale} />
    </div>
  );
}
