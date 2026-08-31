import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Search, ShieldCheck, ArrowRight, Star, Store } from 'lucide-react';
import { getHomeCategories, getHomeFeatured, getHomeVendors } from './_apicalls/homeApi';
import {
  CategoryRailSkeleton, CarGridSkeleton, VendorGridSkeleton,
} from '../_components/Skeletons';
import ListingCard from '../_components/ListingCard';
import { getSavedIds } from '@/marketplace/db/queries/account';
import { getUser } from '@/marketplace/auth/session';

export const metadata = {
  title: 'Alromaih Marketplace',
  // Still noindex: the catalogue is demo data until real vendors are onboarded.
  // Flip to index:true in this file and in layout.js at launch.
  robots: { index: false, follow: false },
};

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

/** One shadow, defined once. Purple-tinted, matching CarCard. */
const CARD_SHADOW =
  'shadow-[0_8px_24px_rgba(70,25,79,0.10),0_2px_8px_rgba(0,0,0,0.04)] ' +
  'hover:shadow-[0_20px_40px_rgba(70,25,79,0.18),0_8px_16px_rgba(0,0,0,0.08)] ' +
  'dark:shadow-[0_8px_24px_rgba(0,0,0,0.3)]';

/** The shared surface: radius, border-that-becomes-a-ring, lift on hover. */
const CARD =
  `group relative flex flex-col overflow-hidden rounded-[14px] border-[5px] border-transparent ` +
  `bg-white transition-all duration-500 hover:-translate-y-1 ` +
  `dark:border-[rgb(38,38,38)] dark:bg-[#141414] ${CARD_SHADOW}`;

export default async function MarketplaceHomePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  return (
    <main className="pb-24">
      {/* ── Hero ────────────────────────────────────────────────────────────
          Full-bleed rather than boxed. The old hero was a left-aligned text
          block sitting inside the same container as everything under it, so
          the page opened with no change of register at all — it read as the
          first section, not as an entrance.
          ---------------------------------------------------------------- */}
      <section className="relative overflow-hidden bg-brand-primary dark:bg-[#1c0a20]">
        {/* Two soft radial washes. Cheap depth — no image to load, no layout
            shift, and it survives dark mode because it is drawn from the brand
            colour rather than a photograph. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,163,212,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_left,rgba(90,35,99,0.55),transparent_60%)]"
        />

        <div className="relative mx-auto w-full max-w-[1600px] px-4 py-20 sm:px-8 sm:py-28 lg:px-20 xl:px-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-white/70" />
            {t('قيد التطوير', 'In development')}
          </span>

          <h1 className="mt-6 max-w-3xl text-balance text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl">
            {t('سوق الرميح', 'Alromaih Marketplace')}
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
            {t(
              'سيارات جديدة ومستعملة من معارض موثوقة، بأسعار واضحة وتواصل مباشر مع البائع.',
              'New and used cars from verified showrooms — clear pricing, and a direct line to the seller.'
            )}
          </p>

          {/* One pill, not a box + a button beside it. The search is the hero's
              primary action, so it gets the visual weight of a single object. */}
          {/* Submits to the cars grid, which is where `?q=` is read. It used
              to post to /marketplace/search — a ComingSoon stub — so the one
              thing the hero asks a visitor to do landed on a placeholder.
              Search is a modal now (see SearchModal); this form is the
              no-JavaScript path to the same results. */}
          <form
            action={`/${locale}/marketplace/cars`}
            className="mt-9 flex max-w-xl items-center gap-2 rounded-2xl bg-white p-2 shadow-[0_16px_40px_rgba(0,0,0,0.22)] dark:bg-[#141414]"
          >
            <Search className="ms-3 h-5 w-5 shrink-0 text-neutral-400" />
            <input
              type="search"
              name="q"
              placeholder={t('ابحث عن ماركة أو موديل…', 'Search by brand or model…')}
              className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-hidden placeholder:text-neutral-400"
            />
            <button
              type="submit"
              className="h-11 shrink-0 rounded-xl bg-brand-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#5a2363] focus:outline-hidden focus:ring-2 focus:ring-white/50 dark:bg-[#c9a3d4] dark:text-[#1a0620]"
            >
              {t('بحث', 'Search')}
            </button>
          </form>

          {/* Static, so they paint with the hero — a visitor who already knows
              what they want never waits for a query to let them say so. */}
          <div className="mt-7 flex flex-wrap gap-2">
            {[
              { href: `/${locale}/marketplace/cars`, ar: 'كل السيارات', en: 'All cars' },
              { href: `/${locale}/marketplace/cars?condition=new`, ar: 'جديد', en: 'New' },
              { href: `/${locale}/marketplace/cars?condition=used`, ar: 'مستعمل', en: 'Used' },
              { href: `/${locale}/marketplace/vendors`, ar: 'المعارض', en: 'Showrooms' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-full border border-white/25 px-4 py-2 text-sm text-white/85 transition-colors hover:border-white/60 hover:bg-white/10"
              >
                {t(link.ar, link.en)}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-8 lg:px-20 xl:px-28">
        {/* ── Category rail ───────────────────────────────────────────────── */}
        <section className="pt-16">
          <SectionHead
            eyebrow={t('الأقسام', 'Sections')}
            title={t('تصفح حسب القسم', 'Browse by section')}
          />
          <Suspense fallback={<CategoryRailSkeleton />}>
            <CategoryRail locale={locale} t={t} />
          </Suspense>
        </section>

        {/* ── Featured listings ───────────────────────────────────────────── */}
        <section className="pt-16">
          <SectionHead
            eyebrow={t('رائج الآن', 'Trending now')}
            title={t('الأكثر مشاهدة', 'Most viewed')}
            href={`/${locale}/marketplace/cars`}
            linkLabel={t('عرض الكل', 'View all')}
            isAr={isAr}
          />
          <Suspense fallback={<CarGridSkeleton count={4} columns={4} />}>
            <FeaturedGrid locale={locale} />
          </Suspense>
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

        {/* ── Sell CTA ────────────────────────────────────────────────────── */}
        <section className="relative mt-20 overflow-hidden rounded-3xl bg-brand-primary px-6 py-16 text-center dark:bg-[#1c0a20]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(201,163,212,0.25),transparent_60%)]"
          />
          <div className="relative">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">
              {t('بِع على سوق الرميح', 'Sell on Alromaih')}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/70">
              {t(
                'انضم كمعرض واعرض سياراتك على آلاف المشترين.',
                'List your showroom and put your cars in front of thousands of buyers.'
              )}
            </p>
            <Link
              href={`/${locale}/marketplace/sell`}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-7 py-3.5 text-sm font-semibold text-brand-primary shadow-lg transition-transform hover:scale-105"
            >
              {t('ابدأ الآن', 'Get started')}
              <ArrowRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />
            </Link>
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
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary/70 dark:text-[#c9a3d4]/70">
          {eyebrow}
        </span>
        <h2 className="mt-1.5 text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      </div>

      {href ? (
        <Link
          href={href}
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary transition-colors hover:text-[#5a2363] dark:text-[#c9a3d4]"
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

async function CategoryRail({ locale, t }) {
  const categories = await getHomeCategories(locale);

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {categories.map((cat) => (
        <Link key={cat.id} href={`/${locale}${cat.path}`} className={`${CARD} p-6`}>
          {/* The tile is mostly whitespace on purpose — a category is a
              destination, not a data point, so it gets room rather than
              density. */}
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-primary/8 text-brand-primary transition-colors group-hover:bg-brand-primary group-hover:text-white dark:bg-[#c9a3d4]/10 dark:text-[#c9a3d4]">
            <Store className="h-5 w-5" />
          </span>

          <p className="mt-5 text-base font-semibold transition-colors group-hover:text-brand-primary dark:group-hover:text-[#c9a3d4]">
            {cat.name}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {cat.children.length} {t('تصنيف', 'categories')}
          </p>
        </Link>
      ))}
    </div>
  );
}

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
  const savedIds = user ? await getSavedIds(user.id) : null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
      {items.map((item, i) => (
        <ListingCard
          key={item.id}
          listing={item}
          locale={locale}
          priority={i < 4}
          cardSpecs={cardSpecs[item.id] ?? []}
          saved={savedIds ? savedIds.has(item.id) : null}
        />
      ))}
    </div>
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
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-primary/8 text-lg font-bold text-brand-primary dark:bg-[#c9a3d4]/10 dark:text-[#c9a3d4]">
                {v.name?.trim()?.[0] ?? '?'}
              </span>
            )}

            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate font-semibold transition-colors group-hover:text-brand-primary dark:group-hover:text-[#c9a3d4]">
                {v.name}
                {v.verified ? (
                  <ShieldCheck className="h-4 w-4 shrink-0 text-brand-primary dark:text-[#c9a3d4]" />
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
