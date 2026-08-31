import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { MediaGridSkeleton } from '../../../_components/Skeletons';
import { getMediaVendors, getMediaPageData } from './_apicalls/mediaPageApi';
import MediaGallery from '../../_components/MediaGallery';

export const metadata = {
  title: 'Media Library',
  robots: { index: false, follow: false },
};

const mb = (bytes) => (bytes / 1048576).toFixed(1);

/**
 * Heading and breadcrumb are static. The file counter and the grid stream
 * together — they come from the same read, and a counter that lands before the
 * thumbnails it counts would just be noise.
 */
export default async function SellerMediaPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-8 sm:px-8 lg:px-20 xl:px-28">
      <nav className="mb-1 mt-6 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Link href={`/${locale}/marketplace/seller`} className="hover:text-brand-primary">
          {t('لوحة البائع', 'Seller')}
        </Link>
        <span>›</span>
        <span className="text-gray-700 dark:text-gray-300">{t('مكتبة الصور', 'Media')}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">{t('مكتبة الصور', 'Media library')}</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {t(
              'ارفع الصور مرة واحدة واستخدمها في أي إعلان أو لون.',
              'Upload once, then reuse across any listing or colour.'
            )}
          </p>
        </div>
        <Suspense fallback={<Skeleton className="h-4 w-32" />}>
          <MediaCount searchParams={searchParams} t={t} />
        </Suspense>
      </div>

      <div className="mt-6">
        <Suspense fallback={<MediaGridSkeleton count={12} />}>
          <Library searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </main>
  );
}

/* ── Streaming sections ──────────────────────────────────────────────────── */

async function resolveVendor(searchParams) {
  const sp = await searchParams;
  const vendors = await getMediaVendors();
  return vendors.find((v) => v.id === sp?.vendor) ?? vendors[0] ?? null;
}

async function MediaCount({ searchParams, t }) {
  const vendor = await resolveVendor(searchParams);
  if (!vendor) return null;

  const { stats } = await getMediaPageData(vendor.id);
  return (
    <p className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
      {stats.count} {t('ملف', 'files')} · {mb(stats.bytes)} MB
    </p>
  );
}

async function Library({ searchParams, locale, t }) {
  const vendor = await resolveVendor(searchParams);
  const { assets, folders, error } = vendor
    ? await getMediaPageData(vendor.id)
    : { assets: [], folders: [], error: null };

  if (error) {
    console.error('[seller/media] load failed:', error);

    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          {t('مكتبة الصور غير متاحة حالياً', 'The media library is unavailable right now')}
        </p>
        <p className="mt-2 text-amber-700 dark:text-amber-400">
          {t('حاول تحديث الصفحة بعد قليل.', 'Try refreshing in a moment.')}
        </p>
      </div>
    );
  }

  return (
    <MediaGallery
      locale={locale}
      vendorId={vendor?.id}
      initialAssets={assets}
      initialFolders={folders}
      mode="manage"
    />
  );
}
