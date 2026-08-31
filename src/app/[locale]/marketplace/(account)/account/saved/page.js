import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Heart, Car } from 'lucide-react';
import { requireUser } from '@/marketplace/auth/session';
import { getSavedListings } from '@/marketplace/db/queries/account';
import { getCardSpecs } from '@/marketplace/db/queries/specs';
import { normalizeListing } from '@/marketplace/lib/listing';
import ListingCard from '../../../_components/ListingCard';
import { CarGridSkeleton } from '../../../_components/Skeletons';

export const metadata = {
  title: 'Saved Cars',
  robots: { index: false, follow: false },
};

const PAGE_SIZE = 12;

export default async function SavedPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Link href={`/${locale}/marketplace/account`} className="hover:text-brand-primary">
          {t('حسابي', 'My account')}
        </Link>
        <span>›</span>
        <span className="text-gray-700 dark:text-gray-300">{t('المحفوظات', 'Saved cars')}</span>
      </nav>

      <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">
        {t('السيارات المحفوظة', 'Saved cars')}
      </h1>

      <Suspense fallback={<div className="mt-8"><CarGridSkeleton count={6} /></div>}>
        <Grid searchParams={searchParams} locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

async function Grid({ searchParams, locale, t }) {
  const viewer = await requireUser();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);

  let items = [];
  let total = 0;
  try {
    ({ items, total } = await getSavedListings(viewer.userId, {
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  } catch {
    return (
      <p className="mt-8 text-sm text-muted-foreground">
        {t('تعذّر تحميل المحفوظات.', 'Could not load your saved cars.')}
      </p>
    );
  }

  if (!items.length) {
    return (
      <div className="mt-8 rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
        <Heart className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('لا توجد سيارات محفوظة', 'Nothing saved yet')}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {t(
            'اضغط القلب على أي سيارة لحفظها هنا والرجوع إليها لاحقاً.',
            'Tap the heart on any car to keep it here and come back to it later.'
          )}
        </p>
        <Link
          href={`/${locale}/marketplace/cars`}
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363]"
        >
          <Car className="h-4 w-4" />
          {t('تصفّح السيارات', 'Browse cars')}
        </Link>
      </div>
    );
  }

  const cardSpecs = await getCardSpecs(items.map((r) => r.id), locale).catch(() => new Map());
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(`${total} سيارة`, `${total} car${total === 1 ? '' : 's'}`)}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((row, i) => {
          const listing = normalizeListing(row, locale);
          return (
            <ListingCard
              key={listing.id}
              listing={listing}
              locale={locale}
              priority={i < 3}
              cardSpecs={cardSpecs.get(listing.id) ?? []}
              // Every card on THIS page is saved by definition, so the heart
              // starts filled and one tap here removes it.
              saved
            />
          );
        })}
      </div>

      {pageCount > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link
              href={`/${locale}/marketplace/account/saved?page=${page - 1}`}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
            >
              {t('السابق', 'Previous')}
            </Link>
          ) : null}
          <span className="text-xs text-muted-foreground">
            {t(`صفحة ${page} من ${pageCount}`, `Page ${page} of ${pageCount}`)}
          </span>
          {page < pageCount ? (
            <Link
              href={`/${locale}/marketplace/account/saved?page=${page + 1}`}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm dark:border-gray-600"
            >
              {t('التالي', 'Next')}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}
