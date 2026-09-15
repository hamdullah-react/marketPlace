import { setRequestLocale } from 'next-intl/server';
import CarsBrowse from './_components/CarsBrowse';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/**
 * Title, description, indexing and share card come from Admin → Website
 * content → Pages SEO (defaults in lib/sitePages.js). noindex by default until
 * real inventory replaces the seeded demo cars.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('cars', locale);
}

/**
 * Every car on the marketplace.
 *
 * The layout, the rail, the grid and the pagination all live in
 * <CarsBrowse> — /cars/new, /cars/used and /brands/[slug] are the same page
 * with a filter the URL has already applied, and they were four copies of this
 * file waiting to happen. What is left here is what makes this route THIS
 * route: no lock, no hidden sections, and its own breadcrumb.
 *
 * searchParams is NOT awaited here on purpose. Every filter change is a new
 * URL, and awaiting the params at the top of the page would make the whole
 * page — the rail included — wait on the query. Passing the promise down means
 * only the grid goes back to a skeleton while a filter applies.
 */
export default async function CarsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isAr = locale === 'ar';

  return (
    <>
      <SeoJsonLd pageKey="cars" locale={locale} />
      <CarsBrowse
        locale={locale}
        searchParams={searchParams}
        // The only one of the four browse pages with a rail — see CarsBrowse.
        showFilters
        basePath={`/${locale}/marketplace/cars`}
        crumbs={[{ label: isAr ? 'السيارات' : 'Cars' }]}
      />
    </>
  );
}
