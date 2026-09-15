import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Store, BadgeCheck, MapPin, Star, Car } from 'lucide-react';
import { getApprovedVendors } from '@/marketplace/db/queries/vendors';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { localized } from '@/marketplace/lib/listing';
import { Skeleton } from '@/components/ui/skeleton';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';
import { getSiteSettings } from '@/marketplace/db/queries/site';

/** Managed on Admin → Website content → Pages SEO (defaults in lib/sitePages.js). */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('vendors', locale);
}

const PAGE_SIZE = 24;

/**
 * Every showroom on the marketplace.
 *
 * The heading and the city filter are static, so they paint immediately and the
 * page never blanks between filters; only the grid streams. Same shape as the
 * cars listing, deliberately — a visitor moving between the two should not have
 * to relearn where the controls are.
 */
export default async function VendorsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const site = await getSiteSettings();
  const siteName = locale === 'ar' ? site.name.ar : site.name.en;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <SeoJsonLd pageKey="vendors" locale={locale} />
      <div className="text-center">
        <h1 className="text-3xl font-bold text-brand-primary sm:text-4xl">
          {t('المعارض', 'Showrooms')}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-gray-400">
          {t(
            `المعارض والتجّار على ${siteName}. اختر معرضاً لتصفّح سياراته والتواصل معه مباشرة.`,
            `The dealers and showrooms on ${siteName}. Pick one to browse its cars and get in touch directly.`
          )}
        </p>
      </div>

      <Suspense fallback={<CityBarSkeleton />}>
        <CityBar searchParams={searchParams} locale={locale} t={t} />
      </Suspense>

      <Suspense fallback={<GridSkeleton />}>
        <Grid searchParams={searchParams} locale={locale} t={t} />
      </Suspense>
    </div>
  );
}

/* ── Cities ─────────────────────────────────────────────────────────────────
   Read from the vendors themselves rather than a fixed list: a city with no
   showrooms is a filter that returns an empty page, and the set changes as the
   marketplace grows.
   ------------------------------------------------------------------------ */

async function CityBar({ searchParams, locale, t }) {
  const sp = await searchParams;
  const active = sp?.city || '';

  const { data } = await getMarketplaceDb()
    .from('vendors')
    .select('city')
    .eq('state', 'approved')
    .not('city', 'is', null);

  const cities = [...new Set((data ?? []).map((r) => r.city).filter(Boolean))].sort();
  if (!cities.length) return null;

  const href = (city) =>
    `/${locale}/marketplace/vendors${city ? `?city=${encodeURIComponent(city)}` : ''}`;

  const pill = (on) =>
    `rounded-lg px-3 py-1.5 text-sm ${
      on
        ? 'bg-brand-primary text-white'
        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5'
    }`;

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-2">
      <Link href={href('')} className={pill(!active)}>
        {t('الكل', 'All')}
      </Link>
      {cities.map((city) => (
        <Link key={city} href={href(city)} className={pill(active === city)}>
          {city}
        </Link>
      ))}
    </div>
  );
}

function CityBarSkeleton() {
  return (
    <div className="mt-8 flex flex-wrap justify-center gap-2">
      {['w-12', 'w-16', 'w-20', 'w-14'].map((w) => (
        <Skeleton key={w} className={`h-8 rounded-lg ${w}`} />
      ))}
    </div>
  );
}

/* ── The grid ───────────────────────────────────────────────────────────── */

async function Grid({ searchParams, locale, t }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp?.page) || 1);
  const city = sp?.city || undefined;

  let items = [];
  let total = 0;
  try {
    ({ items, total } = await getApprovedVendors({
      city,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    }));
  } catch {
    // A failed read is a temporary problem, not an empty marketplace — say so
    // rather than implying there are no showrooms.
    return (
      <p className="mt-14 text-center text-sm text-muted-foreground">
        {t('تعذّر تحميل المعارض. حاول تحديث الصفحة.', 'Could not load showrooms. Try refreshing.')}
      </p>
    );
  }

  // Live-listing counts for the whole page in ONE read. Per card it would be a
  // round trip each, and the grid holds twenty-four of them.
  const counts = new Map();
  if (items.length) {
    const { data } = await getMarketplaceDb()
      .from('listings')
      .select('vendor_id')
      .eq('state', 'live')
      .in('vendor_id', items.map((v) => v.id));
    for (const row of data ?? []) {
      counts.set(row.vendor_id, (counts.get(row.vendor_id) ?? 0) + 1);
    }
  }

  if (!items.length) {
    return (
      <div className="mt-14 text-center">
        <Store className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('لا توجد معارض هنا بعد', 'No showrooms here yet')}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {city
            ? t('جرّب مدينة أخرى.', 'Try another city.')
            : t('كن أول معرض على السوق.', 'Be the first showroom on the marketplace.')}
        </p>
        <Link
          href={`/${locale}/marketplace/sell`}
          className="raised-solid mt-5 inline-block rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white"
        >
          {t('افتح معرضك', 'Open your showroom')}
        </Link>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((v) => (
          <Link
            key={v.id}
            href={`/${locale}/marketplace/vendors/${v.slug}`}
            className="raised-card group overflow-hidden rounded-xl transition-transform duration-300 hover:-translate-y-0.5"
          >
            {/* The banner doubles as the card's colour. A showroom without one
                keeps the same footprint, so rows never change height. */}
            <div className="relative h-24 bg-linear-to-br from-brand-primary/10 to-brand-light/30 dark:from-[#1c1420] dark:to-[#221a26]">
              {v.banner_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={v.banner_url} alt="" loading="lazy" className="h-full w-full object-cover" />
              ) : null}
            </div>

            <div className="p-4">
              <div className="-mt-10 mb-2 flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-white shadow-xs dark:border-[#161616] dark:bg-[#252525]">
                {v.logo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={v.logo_url} alt="" loading="lazy" className="h-full w-full object-contain" />
                ) : (
                  <Store className="h-6 w-6 text-brand-primary" />
                )}
              </div>

              <h2 className="flex items-center gap-1.5 font-semibold text-brand-primary">
                <span className="truncate">{localized(v.name, locale)}</span>
                {v.verified ? (
                  <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" aria-label={t('موثّق', 'Verified')} />
                ) : null}
              </h2>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                {v.city ? (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {v.city}
                  </span>
                ) : null}
                <span className="flex items-center gap-1 tabular-nums">
                  <Car className="h-3.5 w-3.5" />
                  {counts.get(v.id) ?? 0} {t('سيارة', 'cars')}
                </span>
                {v.rating_count > 0 ? (
                  <span className="flex items-center gap-1 tabular-nums">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {Number(v.rating_avg).toFixed(1)}
                  </span>
                ) : null}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {pageCount > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3">
          {page > 1 ? (
            <Link
              href={`/${locale}/marketplace/vendors?${new URLSearchParams({
                ...(city ? { city } : {}),
                page: String(page - 1),
              })}`}
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
              href={`/${locale}/marketplace/vendors?${new URLSearchParams({
                ...(city ? { city } : {}),
                page: String(page + 1),
              })}`}
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

function GridSkeleton() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
          <Skeleton className="h-24 rounded-none" />
          <div className="p-4">
            <Skeleton className="-mt-10 mb-2 h-14 w-14 rounded-xl" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
