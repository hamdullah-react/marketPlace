import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Car } from 'lucide-react';
import { getBrandsIndex } from '@/marketplace/db/queries/cars';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/** Managed on Admin → Website content → Pages SEO (defaults in lib/sitePages.js). */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('brands', locale);
}

/**
 * The brands directory.
 *
 * Only makes with a live car are listed. `car_brands` holds 26 because a
 * seller has to be able to pick one when listing; a directory of 26 tiles
 * where 22 open on an empty grid is 22 dead ends, and it is also exactly the
 * shape of page search engines treat as thin. A make appears here the moment
 * it has its first car — see getBrandsIndex.
 *
 * The card is the whole point of the page, so it carries the three numbers a
 * buyer would otherwise have to click through to find: cars, models, years.
 */
export default async function BrandsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8 lg:px-20 xl:px-28">
      <SeoJsonLd pageKey="brands" locale={locale} />
      <Suspense fallback={<BrandsSkeleton />}>
        <BrandsGrid locale={locale} />
      </Suspense>
    </main>
  );
}

async function BrandsGrid({ locale }) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const brands = await getBrandsIndex(locale).catch(() => []);
  const totalCars = brands.reduce((sum, b) => sum + b.count, 0);
  const nameOf = (b) => (isAr ? b.name?.ar || b.name?.en : b.name?.en || b.name?.ar) || b.slug;

  return (
    <>
      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/${locale}/marketplace`}>{t('السوق', 'Marketplace')}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t('الماركات', 'Brands')}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="mb-6 rounded-2xl bg-linear-to-r from-[var(--brand-primary)] to-[#095A30] p-6 text-white shadow-lg sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">{t('الماركات', 'Car Brands')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80">
          {t(
            'كل ماركة معروضة في السوق، وعدد السيارات المتاحة تحتها الآن.',
            'Every brand listed on the marketplace, and how many cars each one has right now.',
          )}
        </p>

        <div className="mt-5 flex gap-8">
          <div>
            <div className="text-2xl font-bold">{brands.length}</div>
            <div className="text-xs text-white/70">{t('ماركة', 'Brands')}</div>
          </div>
          {/* A link, because the number is a promise the /cars page keeps. */}
          <Link href={`/${locale}/marketplace/cars`} className="transition-opacity hover:opacity-80">
            <div className="text-2xl font-bold">{totalCars}</div>
            <div className="text-xs text-white/70">{t('سيارة متاحة', 'Available cars')}</div>
          </Link>
        </div>
      </div>

      {brands.length === 0 ? (
        <div className="rounded-2xl bg-white p-12 text-center shadow-lg dark:bg-[#1a1a1a]">
          <Car className="mx-auto mb-4 h-16 w-16 text-gray-300" />
          <h2 className="text-lg font-semibold">{t('لا توجد ماركات بعد', 'No brands yet')}</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t(
              'ستظهر الماركة هنا بمجرد إدراج أول سيارة تحتها.',
              'A brand appears here as soon as its first car is listed.',
            )}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {brands.map((b) => (
            <Link
              key={b.id}
              href={`/${locale}/marketplace/brands/${b.slug}`}
              className="raised-card group overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-1"
            >
              <div className="relative flex aspect-square items-center justify-center bg-linear-to-br from-gray-50 to-white p-6 dark:from-white/5 dark:to-transparent">
                {b.logoUrl ? (
                  /* A plain <img>: these are on the marketplace's own Supabase
                     host, which is not in next.config's remotePatterns, so
                     next/image would refuse them outright. Same call the
                     listing cards make. */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={b.logoUrl}
                    alt=""
                    loading="lazy"
                    className="h-20 w-20 object-contain transition-transform duration-300 group-hover:scale-110"
                  />
                ) : (
                  <Car className="h-16 w-16 text-gray-300" />
                )}

                <span className="raised-solid absolute end-2 top-2 rounded-full bg-brand-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                  {b.count}
                </span>
              </div>

              <div className="border-t border-gray-100 p-4 text-center dark:border-white/10">
                <h2 className="truncate font-semibold text-gray-900 transition-colors group-hover:text-brand-primary dark:text-gray-100">
                  {nameOf(b)}
                </h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {b.count} {t(b.count === 1 ? 'سيارة' : 'سيارات', b.count === 1 ? 'car' : 'cars')}
                  {b.modelCount > 0
                    ? ` · ${b.modelCount} ${t(b.modelCount === 1 ? 'موديل' : 'موديلات', b.modelCount === 1 ? 'model' : 'models')}`
                    : ''}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function BrandsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-4 h-5 w-48 rounded bg-brand-primary/10 dark:bg-white/10" />
      <div className="mb-6 h-40 rounded-2xl bg-brand-primary/10 dark:bg-white/10" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="raised-card overflow-hidden rounded-2xl">
            <div className="flex aspect-square items-center justify-center bg-gray-50 dark:bg-white/5">
              <div className="h-20 w-20 rounded-full bg-brand-primary/10 dark:bg-white/10" />
            </div>
            <div className="flex flex-col items-center gap-2 border-t border-gray-100 p-4 dark:border-white/10">
              <div className="h-5 w-20 rounded bg-brand-primary/10 dark:bg-white/10" />
              <div className="h-3 w-24 rounded bg-brand-primary/10 dark:bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
