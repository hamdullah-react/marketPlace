import { setRequestLocale } from 'next-intl/server';
import CarsBrowse from '../_components/CarsBrowse';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr ? 'سيارات مستعملة' : 'Used Cars',
    description: isAr ? 'سيارات مستعملة من معارض موثوقة، مع العداد والحالة والمواصفات الكاملة لكل إعلان.' : 'Used cars from verified showrooms — mileage, condition and full specifications on every listing.',
    alternates: { canonical: `/${locale}/marketplace/cars/used` },
    // noindex until real inventory replaces the seeded demo cars — same rule
    // as /cars, and it has to be repeated because metadata is not inherited
    // from a sibling route, only from a parent layout.
    robots: { index: false, follow: false },
  };
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
  );
}
