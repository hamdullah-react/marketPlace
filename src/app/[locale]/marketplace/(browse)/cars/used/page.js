import { setRequestLocale } from 'next-intl/server';
import CarsBrowse from '../_components/CarsBrowse';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/** Managed on Admin → Website content → Pages SEO (defaults in lib/sitePages.js). */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('cars-used', locale);
}

/**
 * Used cars — /cars with `condition` decided by the path.
 *
 * A separate ROUTE and not `?condition=used`, because these are the two
 * halves everyone shops by: they want their own title, their own description,
 * their own link in the menu, and eventually their own place in the sitemap. A
 * query string gets none of that.
 *
 * The lock is enforced server-side (getCarsResults spreads it last, so a
 * hand-edited `?condition=used` here still returns used cars) and there is no
 * rail here to offer the choice the page has already made.
 */
export default async function UsedCarsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isAr = locale === 'ar';

  return (
    <>
      <SeoJsonLd pageKey="cars-used" locale={locale} />
      <CarsBrowse
        locale={locale}
        searchParams={searchParams}
        lock={{ condition: ['used'] }}
        scopeKey={JSON.stringify({ condition: ['used'] })}
        basePath={`/${locale}/marketplace/cars/used`}
        crumbs={[
          { label: isAr ? 'السيارات' : 'Cars', href: `/${locale}/marketplace/cars` },
          { label: isAr ? 'سيارات مستعملة' : 'Used cars' },
        ]}
      />
    </>
  );
}
