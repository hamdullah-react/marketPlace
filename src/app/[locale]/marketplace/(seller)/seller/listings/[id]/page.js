import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { getListingFormData } from '../../../_apicalls/formData';
import ListingForm from '../../../_components/ListingForm';
import SetupNotice from '../../../_components/SetupNotice';
import EmptyCatalogNotice from '../../../_components/EmptyCatalogNotice';

/**
 * This route's params are not known at build time, so under cacheComponents
 * the shell cannot be prerendered without blocking. Same reason, same fix as
 * listing/[slug]: route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Edit Listing',
  robots: { index: false, follow: false },
};

const STATE_LABELS = {
  live: { ar: 'منشور', en: 'Live' },
  draft: { ar: 'مسودة', en: 'Draft' },
  pending_review: { ar: 'قيد المراجعة', en: 'In review' },
  rejected: { ar: 'مرفوض', en: 'Rejected' },
  sold_out: { ar: 'مباع', en: 'Sold' },
  paused: { ar: 'موقوف', en: 'Paused' },
};

export default async function EditListingPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const data = await getListingFormData({ listingId: id, locale });

  // An empty catalog says nothing about whether THIS listing exists — the two
  // were tangled, so a missing listing rendered a setup notice instead of a
  // 404 whenever the brand list happened to be empty.
  if (!data.error && !data.existing) notFound();

  const existing = data.existing;
  const stateLabel = existing ? STATE_LABELS[existing.state]?.[isAr ? 'ar' : 'en'] ?? existing.state : null;

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
        <span className="text-gray-700 dark:text-gray-300">{t('تعديل', 'Edit')}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-brand-primary">
          {/* name is jsonb {ar,en}; fall back across locales so an
              English-only listing still shows a title in the Arabic UI. */}
          {existing
            ? (isAr ? existing.name?.ar : existing.name?.en) || existing.name?.ar || existing.name?.en || existing.slug
            : t('تعديل الإعلان', 'Edit listing')}
        </h1>
        {stateLabel ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {stateLabel}
          </span>
        ) : null}
      </div>

      {existing?.state === 'live' ? (
        <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          {t(
            'هذا الإعلان منشور — التعديلات تظهر مباشرة للمشترين.',
            'This listing is live — your edits go straight to buyers.'
          )}
        </p>
      ) : null}

      {/* Reported above the form, never instead of it — an edit page that
          swaps the seller's listing for a notice loses them their work. */}
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
          existing={existing}
        />
      </div>
    </main>
  );
}
