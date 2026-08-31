import { setRequestLocale } from 'next-intl/server';
import CarsBrowse from '../_components/CarsBrowse';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  const isAr = locale === 'ar';

  return {
    title: isAr ? 'سيارات جديدة' : 'New Cars',
    description: isAr ? 'سيارات جديدة من معارض موثوقة، بأسعار واضحة وتواصل مباشر مع البائع.' : 'Brand-new cars from verified showrooms — clear pricing and a direct line to the seller.',
    alternates: { canonical: `/${locale}/marketplace/cars/new` },
    // noindex until real inventory replaces the seeded demo cars — same rule
    // as /cars, and it has to be repeated because metadata is not inherited
    // from a sibling route, only from a parent layout.
    robots: { index: false, follow: false },
  };
}

/**
 * New cars — /cars with `condition` decided by the path.
 *
 * A separate ROUTE and not `?condition=new`, because these are the two
 * halves everyone shops by: they want their own title, their own description,
 * their own link in the menu, and eventually their own place in the sitemap. A
 * query string gets none of that.
 *
 * The lock is enforced server-side (getCarsResults spreads it last, so a
 * hand-edited `?condition=used` here still returns new cars) and there is no
 * rail here to offer the choice the page has already made.
 */
export default async function NewCarsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isAr = locale === 'ar';

  return (
    <CarsBrowse
      locale={locale}
      searchParams={searchParams}
      lock={{ condition: ['new'] }}
      scopeKey={JSON.stringify({ condition: ['new'] })}
      basePath={`/${locale}/marketplace/cars/new`}
      crumbs={[
        { label: isAr ? 'السيارات' : 'Cars', href: `/${locale}/marketplace/cars` },
        { label: isAr ? 'سيارات جديدة' : 'New cars' },
      ]}
    />
  );
}
