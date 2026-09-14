import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getListingFormData } from '../../../_apicalls/formData';
import ListingForm from '../../../_components/ListingForm';
import SetupNotice from '../../../_components/SetupNotice';
import EmptyCatalogNotice from '../../../_components/EmptyCatalogNotice';

/**
 * searchParams is read at the top of this component, so the shell cannot be
 * prerendered without blocking. route-segment-config/instant.md, "Disabling
 * instant". (login/page.js takes the other route — a Suspense boundary.)
 */
export const instant = false;

export const metadata = {
  title: 'New Listing',
  robots: { index: false, follow: false },
};

export default async function NewListingPage({ params, searchParams }) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const data = await getListingFormData({ vendorId: sp?.vendor, locale });

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-20 xl:px-28">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Link href={`/${locale}/marketplace/seller`} className="hover:text-brand-primary">
          {t('لوحة البائع', 'Seller')}
        </Link>
        <span>›</span>
        <Link href={`/${locale}/marketplace/seller/listings`} className="hover:text-brand-primary">
          {t('الإعلانات', 'Listings')}
        </Link>
        <span>›</span>
        <span className="text-gray-700 dark:text-gray-300">{t('إعلان جديد', 'New')}</span>
      </nav>

      <h1 className="text-2xl font-bold text-brand-primary">{t('إضافة سيارة', 'Add a car')}</h1>
      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
        {t(
          'اختر السيارة من الكتالوج، أضف الصور والسعر، وانشرها.',
          'Pick the car from the catalog, add photos and a price, then publish.'
        )}
      </p>

      {/* Nothing here is ever withheld. A load failure or an empty catalog is
          reported ABOVE the form, not instead of it — a seller who opens "Add a
          car" and is handed a notice has no idea what to do, and the pickers
          can each create their entry inline anyway, so the form is exactly
          where an empty catalog gets fixed. */}
      {data.error ? (
        <div className="mt-6">
          <SetupNotice locale={locale} error={data.error} />
        </div>
      ) : null}

      {/* Not an error — a step this seller has not taken yet. Only when the
          catalog is genuinely empty, so it disappears the moment they install
          anything rather than nagging forever. */}
      {!data.error && !data.brands.length ? (
        <div className="mt-6">
          <EmptyCatalogNotice locale={locale} />
        </div>
      ) : null}

      <div className="mt-6">
        <ListingForm
          locale={locale}
          vendors={data.vendors}
          brands={data.brands}
          years={data.years}
          colors={data.colors}
          assets={data.assets}
          attributeGroups={data.attributeGroups}
          optionKinds={data.optionKinds}
          specGroups={data.specGroups}
          fieldMode={data.fieldMode}
          defaultVendorId={data.activeVendorId}
        />
      </div>
    </main>
  );
}
