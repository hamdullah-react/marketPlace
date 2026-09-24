import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import {
  resolveVendor, getDashboardStats, getDashboardListings,
} from './_apicalls/dashboardApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StatCardsSkeleton, ChartSkeleton, TableSkeleton,
} from '../../_components/Skeletons';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import StatCards from '../_components/StatCards';
import ListingsChart from '../_components/ListingsChart';
import ListingsTable from '../_components/ListingsTable';
import VendorPicker from '../_components/VendorPicker';

export const metadata = {
  title: 'Seller Dashboard',
  robots: { index: false, follow: false },
};

/**
 * Dashboard body. Mirrors dashboard-01's page structure exactly:
 *
 *   <div className="flex flex-1 flex-col">        ← supplied by the shell
 *     <div className="@container/main …">          ← enables the @xl/@5xl card grid
 *       <div className="… py-4 md:py-6">
 *         <SectionCards />
 *         <div className="px-4 lg:px-6"><Chart /></div>
 *         <DataTable />
 *
 * The @container/main wrapper is load-bearing: StatCards sizes its grid with
 * @xl/main and @5xl/main container queries, so without this element the cards
 * never leave one column regardless of viewport width. It stays OUTSIDE every
 * Suspense boundary so the skeletons size themselves by the same rules.
 *
 * Three boundaries, three queries. The stat cards run a small aggregate and
 * land first; the chart and table share the hundred-row listing read and fill
 * in after. Nothing waits on anything it does not need.
 */
export default async function SellerDashboardPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        {/* ONE loading step. These sections had a boundary each and finished at
            different moments, so the page filled in piece by piece and read as
            loading more than once. One boundary swaps every skeleton for the
            finished page together. */}
        <Suspense
          fallback={
            <>
        <StatCardsSkeleton />

        <div className="px-4 lg:px-6">
          <ChartSkeleton />
        </div>

        <div className="px-4 lg:px-6">
          <ListingsTableSkeleton />
        </div>
            </>
          }
        >
        <Picker searchParams={searchParams} locale={locale} />

        <Stats searchParams={searchParams} locale={locale} t={t} />

        <div className="px-4 lg:px-6">
          <Chart searchParams={searchParams} locale={locale} />
        </div>

        <div className="px-4 lg:px-6">
          <Listings searchParams={searchParams} locale={locale} t={t} />
        </div>
        </Suspense>
      </div>
    </div>
  );
}

function ListingsTableSkeleton() {
  return (
    <Card className="raised-card border-0">
      <CardHeader>
        <Skeleton className="h-4 w-28" />
      </CardHeader>
      <CardContent className="p-0">
        <TableSkeleton rows={8} cols={5} className="rounded-none border-0 border-t" />
      </CardContent>
    </Card>
  );
}

/* ── Streaming sections ─────────────────────────────────────────────────────
   Each resolves the vendor through the memoised resolveVendor(), so the four
   boundaries below share a single vendor lookup.
   ------------------------------------------------------------------------ */

async function Picker({ searchParams, locale }) {
  const sp = await searchParams;
  const { vendors, vendor } = await resolveVendor(sp?.vendor);
  // One vendor means no choice to make — don't take up a row for it.
  if (!vendor || vendors.length < 2) return null;

  return (
    // Sits in the content flow at the same inset as everything else, rather
    // than as a full-bleed banner above the dashboard.
    <div className="px-4 lg:px-6">
      <VendorPicker vendors={vendors} current={vendor.id} locale={locale} />
    </div>
  );
}

async function Stats({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendor } = await resolveVendor(sp?.vendor);

  if (!vendor) {
    return (
      <div className="px-4 lg:px-6">
        <Card className="raised-card border-0">
          <CardHeader>
            <CardTitle>{t('لا يوجد متجر بعد', 'No store yet')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t(
              'لم يُربط متجر بهذا الحساب بعد. تواصل مع الدعم للبدء.',
              'No store is linked to this account yet. Contact support to get started.'
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // StatCards derives a couple of its footers from the listings, so it needs
  // both reads — they run together rather than one after the other.
  const [stats, listings, site] = await Promise.all([
    getDashboardStats(vendor.id),
    getDashboardListings(vendor.id, locale),
    getSiteSettings().catch(() => null),
  ]);

  return (
    <StatCards
      locale={locale}
      stats={stats}
      listings={listings}
      vendorId={vendor.id}
      currency={site?.currency}
    />
  );
}

async function Chart({ searchParams, locale }) {
  const sp = await searchParams;
  const { vendor } = await resolveVendor(sp?.vendor);
  if (!vendor) return null;

  const listings = await getDashboardListings(vendor.id, locale);
  return <ListingsChart locale={locale} listings={listings} />;
}

async function Listings({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendor } = await resolveVendor(sp?.vendor);
  if (!vendor) return null;

  const listings = await getDashboardListings(vendor.id, locale);
  return <ListingsTable locale={locale} listings={listings} title={t('الإعلانات', 'Listings')} />;
}
