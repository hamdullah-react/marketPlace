import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { Scale, ArrowLeft } from 'lucide-react';
import {
  getComparison, getPickableCars, cleanSlugs, comparisonTitle, MAX_COMPARE,
} from '../_apicalls/compareApi';
import CompareTable from '../_components/CompareTable';

/**
 * This route's params are not known at build time, so under cacheComponents
 * the shell cannot be prerendered without blocking. Same reason, same fix as
 * listing/[slug]: route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

/**
 * /marketplace/compare/<slug>/<slug>
 *
 * An OPTIONAL catch-all, so /marketplace/compare with nothing after it is the
 * same route showing its picker — one page, not a landing page that hands off
 * to a second one. It replaces the ComingSoon stub that used to sit at
 * compare/page.js; the two cannot coexist, because [[...slugs]] matches the
 * bare /compare path as well (see the Next dynamic-routes doc).
 *
 * Slugs in the path rather than ?ids= for the reason set out in compareApi:
 * a comparison is a thing worth sharing and worth indexing, and a query string
 * is neither as readable in a WhatsApp message nor as good a canonical.
 */

/**
 * Indexable only once there is a comparison to index.
 *
 * "A vs B" is a page a search engine should have — it answers a question people
 * genuinely type. An empty compare page answers nothing, and one car is not a
 * comparison, so both are noindex. The rule is about CONTENT rather than a flag
 * to remember to flip: it starts allowing pages the day a second seller lists a
 * car, without anyone editing this file.
 */
export async function generateMetadata({ params }) {
  const { locale, slugs } = await params;
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const wanted = cleanSlugs(slugs);
  const base = {
    title: t('قارن بين السيارات', 'Compare cars'),
    description: t(
      'قارن السيارات المعروضة في السوق جنباً إلى جنب — السعر والبائع والمواصفات.',
      'Compare cars listed on the marketplace side by side — price, seller and specifications.'
    ),
    alternates: {
      canonical: `/${locale}/marketplace/compare`,
      languages: {
        ar: '/ar/marketplace/compare',
        en: '/en/marketplace/compare',
      },
    },
    robots: { index: false, follow: true },
  };

  if (wanted.length < 2) return base;

  const { cars } = await getComparison(wanted, locale);
  if (cars.length < 2) return base;

  const names = comparisonTitle(cars, locale);
  const path = `/${locale}/marketplace/compare/${cars.map((c) => c.slug).join('/')}`;
  const title = t(`${names} — أيهما أفضل؟`, `${names} — which is better?`);

  // The cheapest of the cars being compared, because "from SAR x" is the line
  // that earns the click. Only when every car quotes one.
  const prices = cars.map((c) => Number(c.price)).filter((n) => Number.isFinite(n) && n > 0);
  const from = prices.length === cars.length
    ? t(` تبدأ من ${cars.find((c) => Number(c.price) === Math.min(...prices))?.priceLabel}.`,
        ` From ${cars.find((c) => Number(c.price) === Math.min(...prices))?.priceLabel}.`)
    : '';

  const description = t(
    `مقارنة تفصيلية بين ${names}.${from} قارن السعر والبائع والمواصفات لاختيار الأنسب.`,
    `A detailed comparison of ${names}.${from} Compare price, seller and specifications to choose.`
  );

  const image = cars.find((c) => c.image)?.image;

  return {
    title,
    description,
    alternates: {
      canonical: path,
      languages: {
        ar: `/ar/marketplace/compare/${cars.map((c) => c.slug).join('/')}`,
        en: `/en/marketplace/compare/${cars.map((c) => c.slug).join('/')}`,
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      title,
      description,
      url: path,
      images: image ? [{ url: image, alt: names }] : undefined,
      locale: isAr ? 'ar_SA' : 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ComparePage({ params }) {
  const { locale, slugs } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  /**
   * Both at once, not one after the other.
   *
   * These were two awaits in a row, so every visit — and every add and every
   * remove, since each one is a fresh request — paid for the comparison AND
   * THEN for the sixty cars the picker offers, back to back. They need nothing
   * from each other, so the page now waits for the slower rather than the sum.
   *
   * The picker excludes what the URL ASKED for rather than what resolved. That
   * is what breaks the dependency, and it excludes the same set: a slug that
   * resolved to nothing names no car, so it cannot be in the picker's list to
   * be excluded from.
   */
  const [{ cars, overview, keySpecs, groups, missing }, pickable] = await Promise.all([
    getComparison(slugs, locale),
    getPickableCars(cleanSlugs(slugs), locale),
  ]);

  /**
   * ItemList of the cars being compared.
   *
   * Deliberately NOT the FAQPage the main site also emits. That one answers
   * "which is better?" with a paragraph that says the choice depends on your
   * needs — a non-answer dressed as structured data, and exactly what Google's
   * guidance on FAQ markup asks publishers not to ship. The ItemList is true:
   * these are the cars, in this order, at these prices.
   *
   * Emitted as a plain script tag so it is in the initial HTML — next/script
   * with afterInteractive can land too late for a crawler.
   */
  const jsonLd = cars.length >= 2
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: comparisonTitle(cars, locale),
        numberOfItems: cars.length,
        itemListElement: cars.map((car, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          item: {
            '@type': 'Car',
            name: car.title,
            url: `/${locale}${car.path}`,
            image: car.image || undefined,
            brand: car.brand ? { '@type': 'Brand', name: car.brand.name } : undefined,
            offers: {
              '@type': 'Offer',
              price: car.price,
              priceCurrency: car.currency,
              availability: car.inStock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
              seller: car.vendor
                ? { '@type': 'Organization', name: car.vendor.name }
                : undefined,
            },
          },
        })),
      }
    : null;

  return (
    <main className="pb-20">
      {jsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // `<` escaped, for the same reason listing/[slug] escapes it: every
            // string in here — the car's name, the brand, the showroom's name —
            // is written by a seller, and a `</script>` inside one would close
            // this tag and hand the rest of the value to the parser as markup.
            __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
          }}
        />
      ) : null}

      {/* ── Header band ─────────────────────────────────────────────────────
          The main site's compare header: a white bar that stays put as the
          spec tables scroll, so the title of what is being compared is never
          off screen.

          top-16/sm:top-20, not top-0. The marketplace header is fixed and
          everything, so a bar stuck to the top of the viewport would slide
          underneath it and disappear; this one stops exactly where that one
          ends. The layout's own pt-20 keeps the two from overlapping at rest.
          ---------------------------------------------------------------- */}
      <div className="sticky top-16 z-30 raised-card sm:top-20">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-2.5 sm:px-8 md:py-4 lg:px-20 xl:px-28">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            {/* The way back, as an arrow rather than a crumb trail — this is a
                tool a visitor arrives at from a car, and what they want is out
                of it, not a map of where they are. It mirrors in Arabic,
                because an arrow that points the wrong way is worse than none. */}
            <Link
              href={`/${locale}/marketplace/cars`}
              aria-label={t('العودة إلى السيارات', 'Back to cars')}
              className="shrink-0 rounded-xl p-1.5 transition-colors hover:bg-gray-100 dark:hover:bg-white/10 md:p-2"
            >
              <ArrowLeft className={`h-5 w-5 ${isAr ? 'rotate-180' : ''}`} />
            </Link>

            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-lg font-bold tracking-tight text-brand-primary md:text-2xl lg:text-3xl">
                <Scale className="hidden h-6 w-6 shrink-0 md:block" />
                <span className="truncate">
                  {cars.length >= 2
                    ? comparisonTitle(cars, locale)
                    : t('مقارنة السيارات', 'Car Comparison')}
                </span>
              </h1>
              <p className="mt-0.5 hidden text-xs text-gray-600 dark:text-gray-400 md:block md:text-sm">
                {t(
                  `السعر والبائع والمواصفات، جنباً إلى جنب — حتى ${MAX_COMPARE} سيارات.`,
                  `Price, seller and specifications, side by side — up to ${MAX_COMPARE} cars.`
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1600px] px-4 pt-4 sm:px-8 md:pt-6 lg:px-20 xl:px-28">
        <CompareTable
          locale={locale}
          cars={cars}
          overview={overview}
          keySpecs={keySpecs}
          groups={groups}
          missing={missing}
          pickable={pickable}
          max={MAX_COMPARE}
        />
      </div>
    </main>
  );
}
