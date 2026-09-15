import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Car } from 'lucide-react';
import { getBrandBySlug, getBrandsIndex } from '@/marketplace/db/queries/cars';
import { getCarsFacets } from '../../cars/_apicalls/carsPageApi';
import CarsBrowse from '../../cars/_components/CarsBrowse';
import ModelTrimBar from './_components/ModelTrimBar';
import { getSiteSettings } from '@/marketplace/db/queries/site';

/**
 * One make's page: its logo and stock, then the full browse grid scoped to it.
 *
 * The grid, the sort, the chips and the pagination are the SAME component
 * /cars uses — see CarsBrowse — with `lock={{ brand: [id] }}`. A second grid
 * written just for brands is how the two drift until a card looks like a
 * different product depending on which page you found it on.
 *
 * No filter rail. You arrive here having already chosen the make, and beside a
 * decided page a rail is mostly sections that no longer apply. What IS still a
 * question is which model and which trim, and those are a row of pills under
 * the header rather than a sidebar — see ModelTrimBar. The lock is enforced
 * server-side either way: a hand-edited `?brand=<toyota>` on Changan's page
 * still returns Changans, because the page IS Changan.
 */

/**
 * Metadata and the page body both need the brand.
 *
 * No React cache() wrapper: getBrandBySlug reads getBrandsIndex, which is a
 * `use cache` function, so the second call is already served from that entry
 * rather than the database.
 */
export async function generateMetadata({ params }) {
  const { slug, locale } = await params;
  const isAr = locale === 'ar';
  const [brand, site] = await Promise.all([
    getBrandBySlug(slug, locale).catch(() => null),
    getSiteSettings(),
  ]);
  const siteName = isAr ? site.name.ar : site.name.en;

  if (!brand) {
    return {
      title: isAr ? 'الماركة غير موجودة' : 'Brand not found',
      robots: { index: false, follow: false },
    };
  }

  const name = (isAr ? brand.name?.ar || brand.name?.en : brand.name?.en || brand.name?.ar) || slug;

  return {
    title: isAr ? `سيارات ${name}` : `${name} Cars`,
    description: isAr
      ? `تصفّح ${brand.count} من سيارات ${name} المعروضة في ${siteName} من معارض موثوقة، بأسعار واضحة ومواصفات كاملة.`
      : `Browse ${brand.count} ${name} ${brand.count === 1 ? 'car' : 'cars'} listed on ${siteName} by verified showrooms, with clear pricing and full specifications.`,
    alternates: { canonical: `/${locale}/marketplace/brands/${slug}` },
    // noindex until real inventory replaces the seeded demo cars.
    robots: { index: false, follow: false },
  };
}

/**
 * One page per brand per locale, built ahead of time.
 *
 * The list comes from the same cached read the index uses, so the two cannot
 * disagree about which makes have a page. A make that gets its first car after
 * a deploy still renders on demand — Next's dynamicParams defaults to true and
 * nothing here turns it off.
 */
/**
 * ── Never an empty array ────────────────────────────────────────────────────
 *
 * `cacheComponents` is on, and under it a dynamic route whose
 * generateStaticParams returns nothing is a BUILD ERROR, not an empty build:
 *
 *   EmptyGenerateStaticParamsError — all `generateStaticParams` functions must
 *   return at least one result
 *
 * Next needs one real param to render at build time so it can prove the route
 * does not reach for cookies(), headers() or searchParams outside a cached
 * scope. With none, it has nothing to check and refuses.
 *
 * Which is exactly what a marketplace hands it on day one: no brand has a live
 * car yet, so this returned [] and `next build` failed on a page that was
 * working perfectly. It would fail again any day the last car sold.
 *
 * So a placeholder stands in when the list is empty — the shape the Next docs
 * prescribe for this case (generate-static-params.md, "With Cache Components").
 * The page below already calls notFound() for a slug with no brand behind it,
 * so the placeholder renders as a 404 and is never a reachable URL.
 *
 * The listing page solved this the same way; this one was written without the
 * guard, which is the whole difference between the two.
 */
export async function generateStaticParams() {
  const brands = await getBrandsIndex().catch(() => []);

  const params = ['en', 'ar'].flatMap((locale) =>
    brands.filter((b) => b.slug).map((b) => ({ locale, slug: b.slug })),
  );

  return params.length ? params : [{ locale: 'ar', slug: 'placeholder' }];
}

export default async function BrandPage({ params, searchParams }) {
  const { slug, locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const brand = await getBrandBySlug(slug, locale).catch(() => null);
  // 404 rather than an empty grid. A make with no live car is not listed on the
  // index either, so a page here would be reachable from nowhere and still
  // resolve — the sort of URL that ends up indexed with nothing on it.
  if (!brand) notFound();

  const name = (isAr ? brand.name?.ar || brand.name?.en : brand.name?.en || brand.name?.ar) || slug;
  const lock = { brand: [brand.id] };

  const description =
    (isAr ? brand.description?.ar || brand.description?.en : brand.description?.en || brand.description?.ar) || '';

  return (
    <CarsBrowse
      locale={locale}
      searchParams={searchParams}
      lock={lock}
      scopeKey={JSON.stringify(lock)}
      basePath={`/${locale}/marketplace/brands/${slug}`}
      crumbs={[
        { label: t('الماركات', 'Brands'), href: `/${locale}/marketplace/brands` },
        { label: name },
      ]}
      header={
        <div className="mb-6 flex flex-col items-center gap-5 rounded-2xl bg-white p-6 shadow-lg dark:bg-[#1a1a1a] sm:flex-row sm:items-start sm:p-8">
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-gray-50 to-white p-3 ring-1 ring-gray-100 dark:from-white/5 dark:to-transparent dark:ring-white/10">
            {brand.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={brand.logoUrl} alt="" className="h-full w-full object-contain" loading="eager" />
            ) : (
              <Car className="h-12 w-12 text-gray-300" />
            )}
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-start">
            <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">
              {t(`سيارات ${name}`, `${name} Cars`)}
            </h1>

            {description ? (
              <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-400">{description}</p>
            ) : null}

            <div className="mt-4 flex justify-center gap-8 sm:justify-start">
              <div>
                <div className="text-2xl font-bold text-brand-primary">{brand.count}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {t('سيارة متاحة', 'Available cars')}
                </div>
              </div>
              <div>
                <div className="text-2xl font-bold text-brand-primary">{brand.modelCount}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{t('موديلات', 'Models')}</div>
              </div>
              {brand.yearCount > 0 ? (
                <div>
                  <div className="text-2xl font-bold text-brand-primary">{brand.yearCount}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{t('سنوات', 'Years')}</div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              {/* The two halves of this make's stock, one click away. Real
                  filter URLs against this same page, so the rail, the chips
                  and the count all keep working. */}
              <Link
                href={`/${locale}/marketplace/brands/${slug}?condition=new`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-300"
              >
                {t('جديدة', 'New')}
              </Link>
              <Link
                href={`/${locale}/marketplace/brands/${slug}?condition=used`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-300"
              >
                {t('مستعملة', 'Used')}
              </Link>
              <Link
                href={`/${locale}/marketplace/brands`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-300"
              >
                {t('كل الماركات', 'All brands')}
              </Link>
            </div>

            {/* Its own boundary: the facets are a second query and the card
                above them is already in hand, so the name, the logo and the
                stats paint without waiting on the pills. */}
            <Suspense fallback={<PillsSkeleton />}>
              <ModelTrimPills locale={locale} brandId={brand.id} scopeKey={JSON.stringify(lock)} />
            </Suspense>
          </div>
        </div>
      }
    />
  );
}

/**
 * The models and trims THIS brand actually has, with counts.
 *
 * Read from getCarsFacets scoped to the brand — the same memoised call the
 * grid's filter chips make, so on this page the second one is free. A
 * dedicated query would be a third round trip to recount rows that have
 * already been counted.
 */
async function ModelTrimPills({ locale, brandId, scopeKey }) {
  const facets = await getCarsFacets(locale, scopeKey).catch(() => null);
  if (!facets) return null;

  // The scope guarantees one brand in the list, but `.find` rather than `[0]`
  // so a future scope with two makes in it degrades to "no pills" instead of
  // to the wrong make's models.
  const brand = (facets.brands ?? []).find((b) => b.id === brandId);
  if (!brand) return null;

  return (
    <ModelTrimBar
      locale={locale}
      models={brand.models ?? []}
      trimModels={facets.trimModels ?? []}
      total={brand.count}
    />
  );
}

function PillsSkeleton() {
  return (
    <div className="mt-5 animate-pulse border-t border-gray-100 pt-5 dark:border-white/10">
      <div className="mb-2 h-3 w-12 rounded bg-brand-primary/10 dark:bg-white/10" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-8 w-24 rounded-full bg-brand-primary/10 dark:bg-white/10" />
        ))}
      </div>
    </div>
  );
}
