import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorOffers, getOfferableListings } from '@/marketplace/db/queries/seller';
import { listEntity } from '@/marketplace/db/queries/catalog-admin';
import { getVendorSettings } from '@/marketplace/db/queries/settings';
import { Skeleton } from '@/components/ui/skeleton';
import OffersManager from '../../_components/OffersManager';

export const metadata = {
  title: 'Offers',
  robots: { index: false, follow: false },
};

/**
 * The showroom's offers.
 *
 * Same shell as every other seller page — @container/main, the title block in
 * the page and the data behind a Suspense boundary — so the heading paints in
 * the first chunk and only the list waits on the database.
 */
export default async function SellerOffersPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('العروض', 'Offers')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'خصم لفترة محددة على سيارة من معرضك. يبدأ وينتهي وحده — لا تحتاج لإعادة السعر يدوياً.',
              'A timed discount on one of your cars. It starts and ends by itself — you never have to put the price back.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<OffersSkeleton />}>
            <Manager searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ── The list and its form ───────────────────────────────────────────────── */

async function Manager({ searchParams, locale }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  /**
   * Four reads, together.
   *
   * The pickers have to be populated before the form paints — fetching the
   * cars or the names from the browser would show a dropdown that is empty for
   * its first moment, which reads as "there are none".
   *
   * `settings` is only here for the authoring language: the same
   * default_locale the catalog editor and the listing form use, so a seller
   * who set their store to English is not shown Arabic fields on this one page.
   */
  const [offers, listings, offerNames, settings] = await Promise.all([
    getVendorOffers(vendorId),
    getOfferableListings(vendorId),
    listEntity('offerNames', { vendorId, pageSize: 200 })
      .then((r) => r?.items ?? [])
      // The table arrives with schema.sql §25.1. Until it is run, the picker
      // shows its "install the template" hint rather than the page failing.
      .catch(() => []),
    getVendorSettings(vendorId).catch(() => null),
  ]);

  return (
    <OffersManager
      locale={locale}
      offers={offers}
      listings={listings}
      offerNames={offerNames}
      fieldMode={settings?.settings?.default_locale ?? 'ar'}
    />
  );
}

function OffersSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-10 w-36 rounded-xl" />
      {[0, 1, 2].map((n) => (
        <Skeleton key={n} className="h-24 w-full rounded-xl" />
      ))}
    </div>
  );
}
