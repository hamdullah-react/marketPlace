import Link from 'next/link';
import { Fragment, Suspense } from 'react';
import { X } from 'lucide-react';
import { getCarsFacets, getCarsResults } from '../_apicalls/carsPageApi';
import {
  FilterSidebarSkeleton, MobileFilterButtonSkeleton, ResultsHeaderSkeleton, CarGridSkeleton,
} from '../../../_components/Skeletons';
import FilterSidebar, { MobileFilters } from './FilterSidebar';
import ResultsHeader from './ResultsHeader';
import ListingCard from '../../../_components/ListingCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList,
  BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Pagination, PaginationContent, PaginationItem, PaginationLink,
  PaginationNext, PaginationPrevious,
} from '@/components/ui/pagination';
import { getSavedIds } from '@/marketplace/db/queries/account';
import { getUser } from '@/marketplace/auth/session';

/**
 * The browse grid — rail on the left, results on the right — for every page
 * that is a view of the car inventory.
 *
 * FOUR routes render this: /cars, /cars/new, /cars/used and
 * /brands/[slug]. They differ in exactly three things, which are the props:
 *
 *   lock         the filter the PATH has already applied. Spread over the
 *                parsed searchParams in getCarsResults, so it cannot be
 *                overridden from the address bar.
 *   scopeKey     the same thing as JSON, for the facets.
 *   showFilters  whether the rail is there at all.
 *
 * ── Why /cars is the only one with a rail ───────────────────────────────────
 *
 * /cars is where you go WITHOUT knowing what you want, so it needs sixteen
 * ways to narrow down. The other three are pages you arrive at already having
 * decided — new, used, or this make — and beside a decided page a rail is
 * mostly sections that no longer apply, on a set small enough to scan. The
 * grid gets the full width instead.
 *
 * Sort and the filter chips stay on all four: a `?condition=new` can still
 * reach a brand page from its own header links, and a chip is how you take it
 * off again.
 *
 * They were nearly one file each before this existed — same layout, same
 * Suspense boundaries, same pagination, four copies. The version that mattered
 * is the pagination: /cars rebuilt its hrefs from `/marketplace/cars`, so a
 * copy on the brand page would have sent page 2 to the wrong route, and that
 * is the sort of bug that only shows up once there are thirteen cars.
 *
 * `basePath` is therefore a prop rather than a constant, and `header` lets a
 * page put something above the layout — the brand's logo and stats — without
 * this component knowing what a brand is.
 */
export default async function CarsBrowse({
  locale,
  searchParams,
  lock = null,
  scopeKey = '',
  showFilters = false,
  basePath,
  crumbs = [],
  header = null,
}) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  return (
    /* The marketplace's own frame, NOT Tailwind's `container`.

       The main site puts /all-cars inside `container mx-auto`, which caps at
       1280px on a 1440px screen — but the main site also wraps everything in
       `<main className="pt-24 p-4 lg:px-32 xl:px-20">` (ClientProviders), so
       that cap is measured against an already-padded box and the result looks
       full width there.

       The marketplace has no such wrapper: its header, footer, home, listing
       and compare pages all lay out on `max-w-[1600px] px-4 sm:px-8 lg:px-20
       xl:px-28`. Using `container` here made this the one page narrower than
       the header above it, so the filter rail started inside the logo. Same
       frame as its own chrome is what makes it line up. */
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8 sm:py-8 lg:px-20 xl:px-28">
      {header}

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* ── The rail ───────────────────────────────────────────────────────
            Its own boundary, and it reads no searchParams: the available
            filters are the same whatever is currently selected, so this
            resolves once and then stays put while the grid re-runs.
            ------------------------------------------------------------- */}
        {/* Width only. The rail brings its own sticky, height, radius and
            shadow, and so does its skeleton — the two swap without the frame
            around them moving. */}
        {showFilters ? (
          <aside className="lg:w-[320px] lg:shrink-0">
            <Suspense fallback={<FilterSidebarSkeleton />}>
              <Filters locale={locale} scopeKey={scopeKey} />
            </Suspense>
          </aside>
        ) : null}

        {/* ── Everything else ────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Breadcrumb — static, so it paints with the frame. */}
          <Breadcrumb className="mb-4">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href={`/${locale}/marketplace`}>{t('السوق', 'Marketplace')}</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              {/* The separator is a SIBLING of the item, not a child of it.
                  Both BreadcrumbItem and BreadcrumbSeparator render an <li>,
                  so nesting them put an <li> inside an <li> — invalid HTML,
                  and React reported it as a hydration error on every page
                  that uses this layout. Hence the Fragment. */}
              {crumbs.map((c, i) => (
                <Fragment key={c.href ?? c.label}>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    {/* The last crumb is where you already are, so it is text.
                        A link to the current page is a link that does nothing. */}
                    {i === crumbs.length - 1 || !c.href ? (
                      <BreadcrumbPage>{c.label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink asChild>
                        <Link href={c.href}>{c.label}</Link>
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>

          {/* The phone's filter button lives HERE, above the results, and not
              in the rail — on a narrow screen the rail is below everything it
              would be filtering. Same facets as the rail, resolved from one
              request-memoised query. */}
          {showFilters ? (
            <Suspense fallback={<MobileFilterButtonSkeleton />}>
              <MobileFilterTrigger locale={locale} scopeKey={scopeKey} />
            </Suspense>
          ) : null}

          <Suspense
            fallback={
              <>
                <ResultsHeaderSkeleton />
                <CarGridSkeleton count={9} />
              </>
            }
          >
            <Results
              searchParams={searchParams}
              locale={locale}
              t={t}
              lock={lock}
              scopeKey={scopeKey}
              basePath={basePath}
              showFilters={showFilters}
            />
          </Suspense>
        </div>
      </div>
    </main>
  );
}

/* ── Streaming sections ──────────────────────────────────────────────────── */

async function Filters({ locale, scopeKey }) {
  const facets = await getCarsFacets(locale, scopeKey);
  return <FilterSidebar facets={facets} locale={locale} total={facets.total} />;
}

async function MobileFilterTrigger({ locale, scopeKey }) {
  const facets = await getCarsFacets(locale, scopeKey);
  return <MobileFilters facets={facets} locale={locale} total={facets.total} />;
}

async function Results({ searchParams, locale, t, lock, scopeKey, basePath, showFilters }) {
  const sp = await searchParams;

  /* The results and the facets together: the chips need the facets to turn a
     vendor uuid back into a name, and getCarsFacets is memoised, so on a page
     where the rail resolved first this is free. */
  /* The viewer goes in the same wave. getUser() is a cookie read and a session
     lookup that knows nothing about which cars matched, but it was awaited
     AFTER them — one more round trip in series on every filter change. */
  const [{ cars, total, page, pageCount, cardSpecs }, facets, user] = await Promise.all([
    getCarsResults(sp, locale, lock),
    getCarsFacets(locale, scopeKey),
    getUser().catch(() => null),
  ]);

  /**
   * Which of these the visitor has already saved.
   *
   * One read for the whole grid rather than one per card, and null for a
   * signed-out visitor — that null is what tells ListingCard to fall back to
   * localStorage instead of posting to a table it has no user for.
   */
  const savedIds = user ? await getSavedIds(user.id).catch(() => null) : null;

  // Preserve every active filter when paging — rebuilding the query string from
  // scratch would silently drop the user's filters on page 2.
  const pageHref = (n) => {
    const params_ = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (k === 'page' || v == null || v === '') continue;
      params_.set(k, Array.isArray(v) ? v.join(',') : String(v));
    }
    if (n > 1) params_.set('page', String(n));
    const qs = params_.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <>
      <ResultsHeader
        locale={locale}
        total={total}
        page={page}
        pageCount={pageCount}
        facets={facets}
      />

      {cars.length === 0 ? (
        <Card className="rounded-2xl border-0 shadow-lg dark:bg-[#1a1a1a]">
          <CardContent className="p-8 text-center">
            <X className="mx-auto mb-4 h-16 w-16 text-red-500" />
            <h3 className="mb-2 text-xl font-bold">
              {t('لم يتم العثور على سيارات', 'No Cars Found')}
            </h3>
            <p className="mx-auto max-w-sm text-sm text-gray-500 dark:text-gray-400">
              {t(
                'جرّب توسيع نطاق البحث أو مسح بعض عوامل التصفية.',
                'Try widening your search or clearing some filters.'
              )}
            </p>
            {/* Back to THIS page unfiltered, not to /cars — on a brand page
                "reset" means "every Changan", not "every car on the site". */}
            <Button
              asChild
              className="mt-4 bg-brand-primary text-white hover:bg-brand-dark dark:border dark:border-white dark:bg-[#1e1e1e] dark:hover:bg-[#2a2a2a]"
            >
              <Link href={basePath}>{t('إعادة تعيين الفلاتر', 'Reset Filters')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Four across without the rail, three with it — the cards are the
           same width either way, which is what stops a listing looking like a
           different product on a brand page than it does on /cars. */
        <div
          className={
            showFilters
              ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-2 xl:grid-cols-3'
              : 'grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 xl:grid-cols-4'
          }
        >
          {cars.map((car, i) => (
            <ListingCard
              key={car.id}
              listing={car}
              locale={locale}
              priority={i < 3}
              cardSpecs={cardSpecs[car.id] ?? []}
              saved={savedIds ? savedIds.has(car.id) : null}
            />
          ))}
        </div>
      )}

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {pageCount > 1 ? (
        <Pagination className="mt-10">
          <PaginationContent>
            {page > 1 ? (
              <PaginationItem>
                <PaginationPrevious href={pageHref(page - 1)} />
              </PaginationItem>
            ) : null}

            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <PaginationItem key={n}>
                <PaginationLink
                  href={pageHref(n)}
                  isActive={n === page}
                  className={
                    n === page
                      ? 'border-brand-primary bg-brand-primary text-white hover:bg-brand-dark hover:text-white'
                      : undefined
                  }
                >
                  {n}
                </PaginationLink>
              </PaginationItem>
            ))}

            {page < pageCount ? (
              <PaginationItem>
                <PaginationNext href={pageHref(page + 1)} />
              </PaginationItem>
            ) : null}
          </PaginationContent>
        </Pagination>
      ) : null}
    </>
  );
}
