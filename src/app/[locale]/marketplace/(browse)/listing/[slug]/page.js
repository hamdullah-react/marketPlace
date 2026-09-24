import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { FileText } from 'lucide-react';
import { getListingMeta, getListingPageData, getSimilarCars } from './_apicalls/listingDetailApi';
import {
  GallerySkeleton, SpecsSkeleton, BuyPanelSkeleton,
} from '../../../_components/Skeletons';
import ListingFold from './_components/ListingFold';
import SpecSheet from './_components/SpecSheet';
import ListingCard from '../../../_components/ListingCard';
import { routing } from '@/i18n/routing';
import { getLiveListingSlugs } from '@/marketplace/db/queries/listings';
import { getSavedIds } from '@/marketplace/db/queries/account';
import { getUser, getViewer } from '@/marketplace/auth/session';
import { getOpenLead } from '@/marketplace/db/queries/leads';
import {
  getVendorFormFields, getVendorFormStyle, getVendorFormTabs,
} from '@/marketplace/db/queries/forms';
import { ListingCardGridSkeleton } from '../../../_components/ListingCardSkeleton';
import ViewBeacon from './_components/ViewBeacon';

/**
 * This route is allowed to block — and that is the trade this page already
 * made on purpose.
 *
 * Next 16.3 flags the unguarded getListingMeta() await below: "fetch(...) or
 * connection() accessed outside of <Suspense> prevents the route from being
 * prerendered". True, and the alternative is worse. notFound() has to fire
 * BEFORE the first chunk ships, because after that the status is already 200
 * and a sold car answers a crawler with a soft 404 instead of a real one. See
 * the comment on ListingDetailPage.
 *
 * `instant = false` is the documented way to say so (route-segment-config/
 * instant.md, "Disabling instant") rather than leaving a dev-overlay error
 * standing that somebody later "fixes" by deleting the 404.
 *
 * It costs nothing at build: everything after the existence check is already
 * inside Suspense, so the gallery, the panel and the specs still stream.
 */
export const instant = false;

/**
 * Which car pages are built ahead of time.
 *
 * Params for BOTH segments, [locale] and [slug], because a page may generate
 * params for the segments above it and the pair is what identifies a document:
 * /ar/marketplace/listing/x and /en/marketplace/listing/x are two pages with
 * two titles, two descriptions and two canonicals.
 *
 * dynamicParams is left at its default of true, deliberately. A seller who
 * publishes a car must not have to wait for a deploy to have a page: a slug
 * that is not in this list renders on its first request and is written to disk
 * from then on. This list is a head start, not the set of cars that exist.
 *
 * It never throws. A build that cannot reach DB2 should ship a site whose car
 * pages render on demand, not fail — and Cache Components requires at least
 * one param (an empty array is a build error), so the fallback is a single
 * slug that no car has and the page 404s.
 */
export async function generateStaticParams() {
  try {
    const slugs = await getLiveListingSlugs(500);
    const params = slugs.flatMap((slug) =>
      routing.locales.map((locale) => ({ locale, slug }))
    );
    return params.length ? params : [{ locale: routing.defaultLocale, slug: 'placeholder' }];
  } catch (error) {
    console.error(`[listing] generateStaticParams: ${error.message}`);
    return [{ locale: routing.defaultLocale, slug: 'placeholder' }];
  }
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const listing = await getListingMeta(slug, locale);
  if (!listing) return { title: 'Not found', robots: { index: false, follow: false } };

  /**
   * Straight from the columns the seller's SEO tab writes.
   *
   * Every one of them is filled on save — by the seller if they typed
   * something, by listingSeo() from the car itself if they did not — so there
   * is no "if it exists" branching here. The fallbacks are only for rows saved
   * before those columns existed.
   */
  const seo = listing.seo ?? {};
  const title = seo.title || listing.title;
  const description = seo.description || listing.description?.slice(0, 160);

  const path = `/${locale}/marketplace/listing/${slug}`;
  const images = seo.ogImage ? [{ url: seo.ogImage, alt: title }] : undefined;

  return {
    title,
    description,
    keywords: seo.keywords?.length ? seo.keywords : undefined,

    // The seller's canonical when they set one; otherwise this page. Both
    // locales point at the Arabic URL as the original and declare each other
    // as alternates, which is what stops the two competing as duplicates.
    alternates: {
      canonical: seo.canonical || path,
      languages: {
        ar: `/ar/marketplace/listing/${slug}`,
        en: `/en/marketplace/listing/${slug}`,
      },
    },

    // Was hardcoded noindex while the catalog was demo data. It is real now,
    // and the decision belongs to the seller — the Indexing switches on the
    // SEO tab, defaulting to on.
    robots: { index: seo.index !== false, follow: seo.follow !== false },

    openGraph: {
      type: 'website',
      title: seo.ogTitle || title,
      description: seo.ogDescription || description,
      url: path,
      images,
      locale: locale === 'ar' ? 'ar_SA' : 'en_US',
    },

    twitter: {
      card: seo.twitterCard || 'summary_large_image',
      title: seo.twitterTitle || seo.ogTitle || title,
      description: seo.twitterDescription || seo.ogDescription || description,
      images: seo.twitterImage ? [seo.twitterImage] : undefined,
    },
  };
}

/**
 * Absolute origin for the ids inside the JSON-LD graph. Structured data has to
 * carry absolute URLs — a relative one identifies nothing to a crawler that
 * fetched the page from somewhere else.
 */
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.alromaihcars.com';

/**
 * Render one JSON-LD node.
 *
 * `<` is escaped to its unicode form, per next/dist/docs/.../json-ld.md:
 * JSON.stringify does not sanitise, so a description containing `</script>`
 * would otherwise close this tag and put whatever follows into the document as
 * markup. A seller writes that description.
 */
function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

/**
 * schema.org/Car for the listing.
 *
 * This is the half of SEO that meta tags cannot do: it is what puts the price,
 * the mileage and the availability into the search result itself rather than
 * leaving Google to guess them out of the prose. Car extends Vehicle extends
 * Product, so one node carries both the vehicle properties and the offer.
 *
 * Every value comes from a column or the resolved catalog — nothing is
 * restated by hand here, so a spec the seller edits is a spec the rich result
 * shows. `structured_data` from the SEO tab is merged LAST, so an override
 * wins over anything generated.
 */
function carSchema({ listing, kindFacts, trims, variants, locale, url }) {
  const fact = (kind) => kindFacts.find((f) => f.kind === kind)?.value ?? undefined;
  const attrs = listing.attributes ?? {};

  const node = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    '@id': `${url}#car`,
    url,
    name: listing.seo?.title || listing.title,
    description: listing.seo?.description || listing.description || undefined,
    image: (listing.media ?? []).slice(0, 8).map((m) => m.url).filter(Boolean),
    sku: listing.slug,

    brand: listing.brand ? { '@type': 'Brand', name: listing.brand.name } : undefined,
    vehicleModelDate: attrs.year ? String(attrs.year) : undefined,
    // The trim's NAME, not the slug listings.attributes stores. "GL" is the
    // answer; "gl" is the URL fragment it happens to be filed under.
    vehicleConfiguration: trims?.current?.name || undefined,
    // The primary colour variant. A car with no variants has no stated colour,
    // which is honest — better than naming the one in the cover photo.
    color: variants?.find((v) => v.isPrimary)?.name || variants?.[0]?.name || undefined,

    // Only when the car has actually been driven. `0 km` on a new car is a
    // fact; on a listing whose seller never filled the field in it is a lie,
    // and the field is optional.
    mileageFromOdometer: attrs.mileage_km
      ? { '@type': 'QuantitativeValue', value: attrs.mileage_km, unitCode: 'KMT' }
      : undefined,

    vehicleTransmission: fact('transmission'),
    fuelType: fact('fuel'),
    bodyType: fact('body_type'),
    vehicleSeatingCapacity: fact('seats'),

    itemCondition:
      attrs.condition === 'new'
        ? 'https://schema.org/NewCondition'
        : 'https://schema.org/UsedCondition',

    offers: {
      '@type': 'Offer',
      url,
      price: listing.price,
      priceCurrency: listing.currency,
      // A car is one of one. Live means you can buy it; anything else means
      // you cannot, and saying InStock either way is how a marketplace ends up
      // with rich results advertising cars that sold last month.
      availability: listing.inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/SoldOut',
      itemCondition:
        attrs.condition === 'new'
          ? 'https://schema.org/NewCondition'
          : 'https://schema.org/UsedCondition',
      seller: listing.vendor
        ? {
            '@type': 'AutoDealer',
            name: listing.vendor.name,
            url: `${SITE_URL}/${locale}${listing.vendor.path}`,
          }
        : undefined,
      areaServed: listing.city || undefined,
    },
  };

  // A rating Google will show only if it is real. Zero reviews with a 0.0
  // average is a structured-data penalty, not a neutral value.
  if (listing.vendor?.ratingCount > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: listing.vendor.rating,
      reviewCount: listing.vendor.ratingCount,
    };
  }

  // JSON.stringify drops undefined, so the optional properties above simply do
  // not appear rather than shipping as nulls — which schema.org treats as a
  // stated empty value, not an absent one.
  return { ...node, ...(listing.seo?.structuredData ?? {}) };
}

/**
 * Two streaming tiers.
 *
 * The existence check runs first and unguarded: notFound() has to fire BEFORE
 * any Suspense boundary renders, because once the first chunk ships the status
 * code is already 200 and Next can only fall back to a noindex meta tag. That
 * one await is the price of a real 404.
 *
 * After it, the gallery + panel + specs share a boundary (they are one visual
 * unit — the fold) and "similar cars" gets its own, since a slow related-cars
 * query should never hold up the car the visitor actually came to see.
 */
export default async function ListingDetailPage({ params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const listing = await getListingMeta(slug, locale);
  if (!listing) notFound();

  const path = `${SITE_URL}/${locale}/marketplace/listing/${slug}`;

  return (
    <main className="mx-auto w-full max-w-[1600px] px-3 py-6 sm:px-8 sm:py-8 lg:px-12 xl:px-20">
      {/* The same trail the nav below shows, in the form a crawler reads. It
          is what turns the grey URL in a search result into
          "Marketplace › Cars › Suzuki Fronx GL 2026". */}
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: t('السوق', 'Marketplace'), item: `${SITE_URL}/${locale}/marketplace` },
            { '@type': 'ListItem', position: 2, name: t('السيارات', 'Cars'), item: `${SITE_URL}/${locale}/marketplace/cars` },
            { '@type': 'ListItem', position: 3, name: listing.title, item: path },
          ],
        }}
      />

      {/* ── Breadcrumb — the title is already known, so no skeleton here ─── */}
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Link href={`/${locale}/marketplace`} className="hover:text-brand-primary">
          {t('السوق', 'Marketplace')}
        </Link>
        <span>›</span>
        <Link href={`/${locale}/marketplace/cars`} className="hover:text-brand-primary">
          {t('السيارات', 'Cars')}
        </Link>
        <span>›</span>
        <span className="truncate text-gray-700 dark:text-gray-300">{listing.title}</span>
      </nav>

      <Suspense fallback={<AboveTheFoldSkeleton t={t} />}>
        <AboveTheFold slug={slug} locale={locale} t={t} />
      </Suspense>

      <Suspense fallback={null}>
        <Related slug={slug} locale={locale} t={t} />
      </Suspense>
    </main>
  );
}

/* ── Above the fold: gallery, specs, description, buy panel ─────────────── */

function AboveTheFoldSkeleton({ t }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <GallerySkeleton />
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-brand-primary">{t('المواصفات', 'Specifications')}</h2>
          <SpecsSkeleton />
        </section>
      </div>
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <BuyPanelSkeleton />
      </aside>
    </div>
  );
}

async function AboveTheFold({ slug, locale, t }) {
  const data = await getListingPageData(slug, locale);
  if (!data) notFound();

  const { listing, variants, trims, kindFacts, specSheet, keySpecs } = data;

  /**
   * Who is looking, for the enquiry buttons.
   *
   * Read HERE rather than in the page shell: this component is already behind
   * a Suspense boundary, so a session lookup delays the buy panel and nothing
   * else. Read in the shell it would hold up the breadcrumbs and the title
   * too, for a fact only two buttons need.
   *
   * Reshaped rather than passed through. ListingFold is a client component,
   * so whatever goes in is serialised into HTML that every visitor can read —
   * and the viewer carries user ids, a role and a vendor list, none of which
   * belongs in the page source of a public listing.
   */
  /**
   * The seller's own questions, fetched alongside the viewer.
   *
   * In parallel, not in sequence: neither depends on the other, and this
   * component is already behind a Suspense boundary, so the buy panel waits for
   * the slower of the two rather than the sum of both.
   *
   * Only the ACTIVE fields — a question the seller switched off is one buyers
   * should stop being asked, and getVendorFormFields defaults to that.
   */
  const [viewer, leadFields, leadLook, leadTabs] = await Promise.all([
    getViewer(),
    listing.vendor?.id ? getVendorFormFields(listing.vendor.id) : Promise.resolve([]),
    // { styleKey, theme } — the preset and the three axes on top of it.
    listing.vendor?.id ? getVendorFormStyle(listing.vendor.id) : Promise.resolve(null),
    listing.vendor?.id ? getVendorFormTabs(listing.vendor.id) : Promise.resolve([]),
  ]);

  /**
   * Has this person already got a request open on this car?
   *
   * Sequential rather than in the Promise.all above, because it needs the
   * viewer's id — and it is skipped entirely for a signed-out visitor, which
   * is most of them.
   *
   * Asked here so the panel can say so BEFORE the form is filled in. sendLead
   * refuses it either way; being told after typing for a minute is the version
   * that reads as a rejection rather than as information.
   */
  const openLead =
    viewer && listing.vendor?.id
      ? await getOpenLead(listing.vendor.id, listing.id, viewer.userId)
      : null;

  const fold = {
    signedIn: Boolean(viewer),
    // A seller browsing their own car gets an explanation instead of a form.
    // The real refusal is in the action; this only avoids offering it.
    ownsListing: Boolean(viewer && listing.vendor && viewer.vendorIds.includes(listing.vendor.id)),
    phone: viewer?.phone ?? '',
    // Just the date — the lead's id is the showroom's business, and everything
    // in `fold` is serialised into the HTML of a public page.
    alreadySentAt: openLead?.created_at ?? null,
  };

  return (
    <>
      <ViewBeacon listingId={listing.id} />
      {/*
       * Layout mirrors (main)/car/[slug] — see car-gallery.jsx:183.
       *
       * A TEN-column grid split 7/3, breaking at xl (not lg), gallery in the
       * wide column and the buy panel beside it. Both live inside ListingFold
       * because they share the selected-colour state. Description and the spec
       * sheet sit OUTSIDE the grid, full width beneath it — same as the main
       * site, and the reason a spec sheet that wants two columns of its own is
       * no longer squeezed into the narrow track while the space beside the
       * (short) panel stays empty down the length of the page.
       */}
      {/* Rendered here rather than in the shell above because it needs the
          resolved catalog — transmission, fuel and body type arrive with the
          rest of the page data, not with the slug. */}
      <JsonLd
        data={carSchema({
          listing,
          kindFacts,
          trims,
          variants,
          locale,
          url: `${SITE_URL}/${locale}/marketplace/listing/${listing.slug}`,
        })}
      />

      <ListingFold
        listing={listing}
        variants={variants}
        trims={trims}
        locale={locale}
        viewer={fold}
        leadFields={leadFields}
        leadStyle={leadLook?.styleKey ?? 'classic'}
        leadTheme={leadLook?.theme ?? null}
        leadTabs={leadTabs}
      />

      {/* ── Car Description ────────────────────────────────────────────
          Purple header bar over the body, matching the main site's block.
          What used to sit here was an "At a glance" grid that repeated
          Transmission, Fuel Type, Body style and Seats — every one of which
          the Car Information row below already shows. The main site has no
          such section, and two tiles saying "Automatic" on one page is not a
          summary, it is noise.
          ---------------------------------------------------------------- */}
      {listing.description ? (
        <section className="mt-8 raised-card overflow-hidden rounded-xl">
          <div className="bg-linear-to-r from-brand-primary to-brand-dark px-5 py-3.5">
            <h2 className="flex items-center gap-2 text-base font-bold text-white">
              <FileText className="h-4 w-4" />
              {t('وصف السيارة', 'Car Description')}
            </h2>
          </div>
          <p className="whitespace-pre-line px-5 py-5 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
            {listing.description}
          </p>
        </section>
      ) : null}

      {/* The full sheet the seller filled in, grouped by category. Renders
          nothing at all when a listing has no specs — see SpecSheet. */}
      <SpecSheet sheet={specSheet} keySpecs={keySpecs} locale={locale} />
    </>
  );
}

/* ── Related ────────────────────────────────────────────────────────────────
   Renders nothing at all when there are no similar cars, so the fallback is
   `null` rather than a skeleton — a skeleton here would promise a row that may
   never arrive, which is worse than a section that simply appears.
   ------------------------------------------------------------------------ */

async function Related({ slug, locale, t }) {
  const { cars: related, cardSpecs } = await getSimilarCars(slug, locale);
  if (related.length === 0) return null;

  // Read after the early return, so a page with no similar cars does not pay
  // for a query whose answer it will not use.
  const user = await getUser();
  /**
   * An EMPTY SET on failure, never null.
   *
   * `saved={null}` is how a card is told "nobody is signed in", and it answers
   * that by falling back to the localStorage wishlist. So a lookup that failed
   * for a SIGNED-IN visitor used to hand back null and quietly turn their cards
   * back into signed-out ones — hearts lit from a list they built before they
   * ever had an account, while /account/saved read the database and showed
   * nothing. Two sources disagreeing, with no error anywhere to explain it.
   *
   * A signed-in visitor now always gets a Set. Empty means "nothing saved",
   * which is the safe direction to fail: a heart that is wrongly empty is
   * corrected by one tap, and a heart that is wrongly full is a lie about their
   * account that the saved page contradicts.
   */
  const savedIds = user
    ? await getSavedIds(user.id).catch(() => new Set())
    : null;

  return (
    <section className="mt-14">
      <h2 className="text-lg font-semibold text-brand-primary">{t('سيارات مشابهة', 'Similar cars')}</h2>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-6 xl:grid-cols-4">
        {related.map((r) => (
          <ListingCard
            key={r.id}
            listing={r}
            locale={locale}
            cardSpecs={cardSpecs[r.id] ?? []}
            saved={savedIds ? savedIds.has(r.id) : null}
          />
        ))}
      </div>
    </section>
  );
}
