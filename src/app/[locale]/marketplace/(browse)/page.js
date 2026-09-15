import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Search, ShieldCheck, ArrowRight, Star, Store } from 'lucide-react';
import { getHomeFeatured, getHomeMostViewed, getHomeVendors } from './_apicalls/homeApi';
import {
  VendorGridSkeleton,
} from '../_components/Skeletons';
import ListingCard from '../_components/ListingCard';
import { getSavedIds } from '@/marketplace/db/queries/account';
import { getUser } from '@/marketplace/auth/session';
import HeroFilter, { HeroFilterSkeleton } from './_components/HeroFilter';
import HeroCarousel from './_components/HeroCarousel';
import { HERO_SLIDES } from './_components/heroSlides';
import { getHeroSlides, getSiteSettings } from '@/marketplace/db/queries/site';
import SeoJsonLd from '../_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';
import { getCarFacets } from '@/marketplace/db/queries/cars';
import { ListingCardGridSkeleton } from '../_components/ListingCardSkeleton';
import LiveViews from '../_components/LiveViews';

/**
 * Managed on Admin → Website content → Pages SEO. Still noindex by default —
 * the catalogue is demo data until real vendors are onboarded; switch
 * "Show in search results" on for the Home page there at launch.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('home', locale);
}

/**
 * ── Design language ─────────────────────────────────────────────────────────
 *
 * Everything on this page is built from the card treatment the marketplace
 * CarCard already established — a 10px radius, a 5px transparent border that
 * becomes the hover ring, and a PURPLE-TINTED shadow rather than a grey one.
 * That last detail is most of why the site reads as a brand rather than a
 * bootstrap template, and this page previously ignored it: plain neutral
 * borders, flat `hover:shadow-md`, `text-lg` section headings.
 *
 * So the refresh is mostly a matter of stopping the page from having its own
 * private visual language. Same shadow, same radius, same purple, one type
 * scale — and generous vertical rhythm, which is the cheapest thing that
 * separates premium from cramped.
 *
 * The page function still awaits no data. Hero, headings and the CTA are plain
 * markup and paint in the first chunk; each data-backed section sits behind its
 * own <Suspense> and streams independently. See _apicalls/homeApi.js for why
 * the three run as separate queries.
 */

/**
 * The shared surface for this page's tiles.
 *
 * `raised-card` carries the colour, the lighting and both shadows — see the
 * RAISED SURFACES block in globals.css. What stays here is what belongs to a
 * CARD specifically rather than to a raised panel: the radius, and the lift on
 * hover. A dropdown is raised too and must not rise when pointed at.
 *
 * This replaces a hand-written gradient + two-shadow stack that predated the
 * utility and said the same thing in grey.
 */
const CARD =
  'raised-card group relative flex flex-col overflow-hidden rounded-[14px] ' +
  'transition-transform duration-500 hover:-translate-y-1';

/** The carousel's slides and speed, from Admin → Website content. Both reads are cached. */
async function HeroArt({ locale }) {
  const [{ ready, slides }, site] = await Promise.all([getHeroSlides(), getSiteSettings()]);
  // The placeholder art stays until the first real slide is added, so the
  // hero is never an empty dark box.
  // Fallback off (Settings → Language): a slide shows only the visitor's own
  // language, so an untranslated caption is blank rather than the other one.
  const own = (value) => (site.localeFallback ? value : { [locale]: value?.[locale] ?? '' });
  const data = ready && slides.length
    ? {
        intervalMs: site.heroIntervalMs,
        slides: slides.map((s) => ({ ...s, title: own(s.title), description: own(s.description), alt: own(s.alt) })),
      }
    : HERO_SLIDES;
  return <HeroCarousel data={data} locale={locale} />;
}

export default async function MarketplaceHomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  // The app name from Admin → Settings (a cached read).
  const site = await getSiteSettings();
  const siteName = isAr ? site.name.ar : site.name.en;

  return (
    <main className="pb-24">
      <SeoJsonLd pageKey="home" locale={locale} />
      {/* ── Hero ──────────────────────────────────────────────
          Full-bleed photograph, the words on top of it, the filter bar beneath
          them — one object rather than a stack of three.

          ── Height comes from the CONTENT ─────────────────────────

          The section is sized by the text and the filter inside it, and the
          carousel is absolutely positioned to cover whatever that turns out to
          be. So the image can never shift the layout — there is no reserved box
          waiting to be filled, and CLS on this screen is structurally zero
          rather than zero if the aspect ratio was guessed right.

          ── The artwork ───────────────────────────────────────

          Managed on Admin → Website content → Home carousel (hero_slides).
          heroSlides.js is the placeholder art, used until the first slide is
          added there (or while the WEBSITE CONTENT SQL has not been run).
          ---------------------------------------------------------------- */}
      <section className="relative isolate flex min-h-[400px] flex-col justify-end overflow-hidden bg-neutral-900 sm:min-h-[560px] lg:min-h-[640px]">
        {/* The photograph, filling the section. */}
        <div className="absolute inset-0">
          <Suspense fallback={null}>
            <HeroArt locale={locale} />
          </Suspense>
        </div>

        {/* ── Scrim ──────────────────────────────────────────
            THIS is where the 20% lives. Dimming the photograph itself put the
            car behind a veil; a 20% wash over a full-strength image leaves the
            car plainly visible and still gives white text something to sit on.

            Slightly deeper at the top and foot than in the middle, because that
            is where the words are — the caption in the centre has its own
            drop-shadow and the car deserves the clearest band of the frame.

            A gradient and not backdrop-blur — blurring a full-width layer is one
            of the more expensive things a phone GPU can be asked to do, and it
            would be repainted on every slide change. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 bg-linear-to-b from-black/35 via-black/20 to-black/45"
        />

        {/*
          pointer-events-none on the stack, auto on what is actually clickable.
          The content sits above the carousel, so without this the invisible
          column would swallow every click meant for the arrows and the dots.
        */}
        <div className="pointer-events-none relative z-20 mx-auto flex w-full max-w-[1600px] flex-1 flex-col justify-end px-3 pb-8 pt-6 sm:px-8 sm:pb-12 sm:pt-8 lg:px-20 xl:px-28">
          {/* ── The page's heading ───────────────────────────────
              Present, singular, and not drawn.

              The visible headline now belongs to the carousel — it changes with
              the slide, and all five are in the DOM at once. Five h1 elements
              is the same as none, and a heading that rotates is not a heading
              the page can be indexed on. So the h1 is one stable sentence,
              read by screen readers and crawlers, while the slides carry the
              copy a visitor actually sees.
              -------------------------------------------------------- */}
          <h1 className="sr-only">
            {t(
              `${siteName} — وجهتك لبيع وشراء السيارات في السعودية`,
              `${siteName} — buy and sell cars across Saudi Arabia`
            )}
          </h1>

          {/* ── Filters ─────────────────────────────────────────
              Behind its own boundary: the options are a live tally of what is
              listed, which is a database read, and the headline above must not
              wait for it. */}
          <div className="pointer-events-auto mx-auto mt-auto w-full max-w-5xl pt-16 sm:pt-24">
            <Suspense fallback={<HeroFilterSkeleton />}>
              <HeroFilterSlot locale={locale} />
            </Suspense>
          </div>

          {/* Static, so they paint with the hero — a visitor who already knows
              what they want never waits for a query to let them say so. */}
          <div className="pointer-events-auto mt-4 flex flex-wrap justify-center gap-1.5 sm:mt-6 sm:gap-2">
            {[
              { href: `/${locale}/marketplace/cars`, ar: 'كل السيارات', en: 'All cars' },
              { href: `/${locale}/marketplace/cars?condition=new`, ar: 'جديد', en: 'New' },
              { href: `/${locale}/marketplace/cars?condition=used`, ar: 'مستعمل', en: 'Used' },
              { href: `/${locale}/marketplace/vendors`, ar: 'المعارض', en: 'Showrooms' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                /* `raised`, like every other control in the chrome. These were
                   white outlines on the photograph, which made them the one
                   set of buttons on the page lit by nothing. */
                className="raised rounded-full px-3 py-1.5 text-xs font-bold sm:px-4 sm:py-2 sm:text-sm"
              >
                {t(link.ar, link.en)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 lg:px-20 xl:px-28">
        {/* ── Featured listings ───────────────────────────────────────────── */}
        <section className="pt-16">
          <SectionHead
            eyebrow={t('مختارة', 'Handpicked')}
            title={t('سيارات مميزة', 'Featured cars')}
            href={`/${locale}/marketplace/cars`}
            linkLabel={t('عرض الكل', 'View all')}
            isAr={isAr}
          />
          <Suspense fallback={<ListingCardGridSkeleton count={4} columns={4} />}>
            <FeaturedGrid locale={locale} />
          </Suspense>
        </section>

        {/* ── Most viewed — ordered by the real view counter ─────────────── */}
        <section className="pt-16">
          {/* A panel of its own — green easing into gold — so the one row that
              changes while you watch reads as live rather than as another grid. */}
          <div className="relative overflow-hidden rounded-3xl border border-brand-primary/10 bg-linear-to-br from-[#F7FCF9] via-[var(--app-bg)] to-[#FBF6E4] p-4 sm:p-6 lg:p-8 dark:border-white/10 dark:from-[#0F1D15] dark:via-[var(--app-bg-dark)] dark:to-[#1C180B]">
            <div aria-hidden="true" className="pointer-events-none absolute -end-24 -top-24 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -start-24 h-64 w-64 rounded-full bg-brand-primary/10 blur-3xl" />

            <div className="relative">
              <SectionHead
                eyebrow={t('رائج الآن', 'Trending now')}
                title={t('الأكثر مشاهدة', 'Most viewed')}
                href={`/${locale}/marketplace/cars?sort=popular`}
                linkLabel={t('عرض الكل', 'View all')}
                isAr={isAr}
              />
              <Suspense fallback={<ListingCardGridSkeleton count={4} columns={4} />}>
                <MostViewedGrid locale={locale} />
              </Suspense>
            </div>
          </div>
        </section>

        {/* ── Vendors ─────────────────────────────────────────────────────── */}
        <section className="pt-16">
          <SectionHead
            eyebrow={t('البائعون', 'Sellers')}
            title={t('بائعون مميزون', 'Featured vendors')}
            href={`/${locale}/marketplace/vendors`}
            linkLabel={t('كل البائعين', 'All vendors')}
            isAr={isAr}
          />
          <Suspense fallback={<VendorGridSkeleton />}>
            <VendorGrid locale={locale} t={t} />
          </Suspense>
        </section>

        {/* ── Sell CTA ──────────────────────────────────────────────────────
            Words on the lead edge, a real listing on the trailing one.

            The car comes out of the DATABASE rather than from stock art,
            because the pitch is "put YOUR cars in front of buyers" and the
            honest illustration of that is a car somebody has actually listed.
            It sits behind its own <Suspense> so the copy and the button paint
            with the rest of the page, and it renders nothing at all when the
            catalogue is empty — a CTA with a hole where a photo should be is
            worse than a CTA that is only words.
            -------------------------------------------------------------- */}
        <section className="relative mt-20 overflow-hidden rounded-3xl bg-brand-primary dark:bg-[var(--brand-ink)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(76,192,138,0.25),transparent_60%)]"
          />

          <div className="relative grid items-center gap-8 px-6 py-12 sm:py-16 md:grid-cols-2 md:gap-4 md:ps-12 md:pe-0">
            <div className="text-center md:text-start">
              <h2 className="text-2xl font-bold text-white sm:text-3xl">
                {t(`بِع على ${siteName}`, `Sell on ${siteName}`)}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70 md:mx-0">
                {t(
                  'انضم كمعرض واعرض سياراتك على آلاف المشترين.',
                  'List your showroom and put your cars in front of thousands of buyers.'
                )}
              </p>
              <Link
                href={`/${locale}/marketplace/sell`}
                className="raised mt-8 inline-flex items-center gap-2 rounded-xl px-7 py-3.5 text-sm font-bold"
              >
                {t('ابدأ الآن', 'Get started')}
                <ArrowRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />
              </Link>
            </div>

            <div className="relative h-[150px] w-full sm:h-[200px] md:h-[230px]">
              <Suspense fallback={null}>
                <SellCtaCar locale={locale} />
              </Suspense>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ── Section heading ─────────────────────────────────────────────────────────
   An eyebrow above a large title, with the "view all" link baselined against
   it. Replaces the old `text-lg font-semibold` + `border-t` pairing, where
   every section opened with a horizontal rule and a heading barely larger than
   the body text around it.
   ------------------------------------------------------------------------ */
function SectionHead({ eyebrow, title, href, linkLabel, isAr }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary/70 dark:text-[var(--brand-on-dark)]/70">
          {eyebrow}
        </span>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      </div>

      {href ? (
        <Link
          href={href}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary transition-colors hover:text-[var(--brand-dark)] dark:text-[var(--brand-on-dark)]"
        >
          {linkLabel}
          <ArrowRight
            className={`h-4 w-4 transition-transform group-hover:translate-x-0.5 ${isAr ? 'rotate-180 group-hover:-translate-x-0.5' : ''}`}
          />
        </Link>
      ) : null}
    </div>
  );
}

/* ── Streaming sections ─────────────────────────────────────────────────────
   Module scope, not nested in the page — a component declared inside another
   component is a new type on every render, which remounts its whole subtree.
   ------------------------------------------------------------------------ */

/**
 * The featured row uses the SAME ListingCard as the cars grid and the related
 * strip — one card, three placements.
 *
 * It used to be a bespoke inline tile: different radius, different shadow,
 * different price treatment. The same car therefore looked like a different
 * product depending on which page a buyer arrived from, and the spec row the
 * Kinds tab drives did not reach the home page at all.
 */
async function FeaturedGrid({ locale }) {
  const { items, cardSpecs } = await getHomeFeatured(locale);

  /**
   * Which of these the visitor has already saved.
   *
   * One read for the whole grid, and null for a signed-out visitor — that null
   * is what tells ListingCard to fall back to localStorage instead of posting
   * to a table it has no user for.
   */
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
      {items.map((item, i) => (
        <ListingCard
          key={item.id}
          listing={item}
          locale={locale}
          /*
            Nothing in this grid is priority any more.

            It used to mark the first four, which was right when the hero was a
            text block and these cars were the first images on the page. The
            hero is now a full-bleed photograph, so the LCP element is up there
            — and four eager card images racing it for bandwidth make the one
            image that IS measured arrive later. These sit below the fold on
            every viewport; lazy is the honest answer.
          */
          priority={false}
          cardSpecs={cardSpecs[item.id] ?? []}
          saved={savedIds ? savedIds.has(item.id) : null}
        />
      ))}
    </div>
  );
}

/** Same card grid as FeaturedGrid, ordered by views, with the count on each card. */
async function MostViewedGrid({ locale }) {
  const [{ items, cardSpecs }, user] = await Promise.all([
    getHomeMostViewed(locale, 4),
    getUser(),
  ]);
  if (!items.length) return null;

  const savedIds = user ? await getSavedIds(user.id).catch(() => new Set()) : null;

  return (
    <>
      {/* The live badge, the running total, and the poll that keeps every
          count on these cards current without a reload. */}
      <div className="-mt-3 mb-5">
        <LiveViews locale={locale} initial={items.map((i) => ({ id: i.id, views: i.views ?? 0 }))} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        {items.map((item, i) => (
          <ListingCard
            key={item.id}
            listing={item}
            locale={locale}
            priority={false}
            cardSpecs={cardSpecs[item.id] ?? []}
            saved={savedIds ? savedIds.has(item.id) : null}
            showViews
            rank={i + 1}
          />
        ))}
      </div>
    </>
  );
}

async function VendorGrid({ locale, t }) {
  const vendors = await getHomeVendors(locale);

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
      {vendors.map((v) => (
        <Link key={v.id} href={`/${locale}${v.path}`} className={`${CARD} p-6`}>
          <div className="flex items-center gap-3.5">
            {/* The logo when there is one, the initial when there is not —
                rather than an empty circle, which reads as a failed image. */}
            {v.logo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={v.logo}
                alt=""
                loading="lazy"
                className="h-12 w-12 shrink-0 rounded-full border border-neutral-200 object-cover dark:border-neutral-700"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/8 text-lg font-bold text-brand-primary dark:bg-[var(--brand-on-dark)]/10 dark:text-[var(--brand-on-dark)]">
                {v.name?.trim()?.[0] ?? '?'}
              </span>
            )}

            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-semibold transition-colors group-hover:text-brand-primary dark:group-hover:text-[var(--brand-on-dark)]">
                {v.name}
                {v.verified ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-brand-primary dark:text-[var(--brand-on-dark)]" />
                ) : null}
              </p>
              <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">{v.city}</p>
            </div>
          </div>

          <p className="mt-4 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            {v.bio}
          </p>

          <div className="mt-4 flex items-center gap-1.5 border-t border-neutral-100 pt-3.5 text-xs tabular-nums text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
              {v.rating.toFixed(1)}
            </span>
            <span>· {v.ratingCount} {t('تقييم', 'reviews')}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ── Hero filter ────────────────────────────────────────────

   getCarFacets tallies the LIVE listings, so the four dropdowns only ever
   offer makes, models, trims and cities that something is actually listed
   under. That is the difference between a filter bar and a decorative one: a
   visitor cannot compose a search that returns nothing.

   One read for all four, and it is memoised — the cars page asks for the same
   facets, so arriving there from this bar does not pay for them twice.
   -------------------------------------------------------------------------- */
async function HeroFilterSlot({ locale }) {
  const facets = await getCarFacets(locale).catch(() => null);

  // A failed tally must not take the hero down with it. No bar is a worse page
  // than a working one; a broken page is worse than both.
  if (!facets?.brands?.length) return null;

  return <HeroFilter facets={facets} locale={locale} />;
}

/* ── The car in the Sell CTA ────────────────────────────────────────────────

   One real listing's photo, read the same way the featured row reads its cars.

   Deliberately the FIRST featured listing rather than a random one: this block
   sits at the foot of a page that has already shown the featured grid, and a
   car the visitor just scrolled past is a better illustration of "your cars, in
   front of buyers" than a second unrelated one. It also costs nothing extra —
   getHomeFeatured is memoised, so the featured grid above has already paid for
   this read.

   Returns null on an empty catalogue or a failed read. The stage keeps its
   height either way, so the section does not reflow when the photo is missing.
   -------------------------------------------------------------------------- */
async function SellCtaCar({ locale }) {
  const { items } = await getHomeFeatured(locale, 8).catch(() => ({ items: [] }));
  const car = (items ?? []).find((c) => c.image);
  if (!car) return null;

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={car.image}
      alt={car.imageAlt || car.title}
      loading="lazy"
      className="h-full w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)]"
    />
  );
}
