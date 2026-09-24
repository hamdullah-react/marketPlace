import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight, BadgeCheck, Star, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { getVendorBySlug } from '@/marketplace/db/queries/vendors';
import { getPublicVendorReviews, getVendorRatingSummary, getReviewableDealFor } from '@/marketplace/db/queries/reviews';
import { currentViewer } from '@/marketplace/auth/session';
import { localized } from '@/marketplace/lib/listing';
import { Skeleton } from '@/components/ui/skeleton';
import ReviewCard from '@/marketplace/ui/ReviewCard';
import RatingSummary from '@/marketplace/ui/RatingSummary';
import Stars from '@/marketplace/ui/Stars';

/**
 * This route's params are not known at build time, so under cacheComponents
 * the shell cannot be prerendered without blocking. Same reason, same fix as
 * listing/[slug]: route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

const PER_PAGE = 20;

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const vendor = await getVendorBySlug(slug).catch(() => null);
  if (!vendor) return { title: 'Reviews' };

  const name = localized(vendor.name, locale);
  const isAr = locale === 'ar';

  return {
    title: isAr ? `تقييمات ${name}` : `Reviews of ${name}`,
    description: isAr
      ? `ما قاله المشترون عن ${name} — التقييمات والردود.`
      : `What buyers said about ${name} — ratings and replies.`,
    alternates: { canonical: `/${locale}/marketplace/vendors/${vendor.slug}/reviews` },
    /* INDEXABLE, unlike the account and seller review pages. Reviews are the
       most searched-for thing about a showroom after its name, and this is the
       page that answers it. */
  };
}

/**
 * Every review a showroom has, in public.
 *
 * ── Hidden reviews are not here, and not counted ────────────────────────────
 *
 * getPublicVendorReviews filters them out and the summary is built from the
 * same rows, so the average at the top always matches the reviews underneath
 * it. That is the whole reason the summary is computed from the reviews rather
 * than read off vendors.rating_avg — the two agree today because a trigger
 * keeps them in step, and if they ever stop agreeing, the page shows the one
 * that can be checked by scrolling.
 *
 * ── The star filter is a LINK ───────────────────────────────────────────────
 *
 * Same argument as the storefront's tabs: "the one-star reviews of this
 * showroom" is a thing somebody wants to send to somebody else, so it has a
 * URL. It also keeps this page a server component with one query.
 */
export default async function VendorReviewsPage({ params, searchParams }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const vendor = await getVendorBySlug(slug).catch(() => null);
  if (!vendor) notFound();

  const name = localized(vendor.name, locale);
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 lg:px-6">
      <Link
        href={`/${locale}/marketplace/vendors/${vendor.slug}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-primary"
      >
        <Back className="h-3.5 w-3.5" />
        {t('رجوع إلى المعرض', 'Back to the showroom')}
      </Link>

      <header className="mt-3 flex items-center gap-3">
        {vendor.logo_url ? (
          <Image
            src={vendor.logo_url}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-primary/10">
            <Store className="h-5 w-5 text-brand-primary" />
          </span>
        )}

        <div>
          <h1 className="flex items-center gap-1.5 text-xl font-bold text-brand-primary">
            {name}
            {vendor.verified ? <BadgeCheck className="h-4 w-4 text-brand-primary" /> : null}
          </h1>
          <p className="text-sm text-muted-foreground">{t('تقييمات المشترين', 'Buyer reviews')}</p>
        </div>
      </header>

      {/* ONE boundary: the summary and the list are one answer to one question
          and must not arrive separately. */}
      <Suspense fallback={<ReviewsSkeleton />}>
        <Body vendor={vendor} searchParams={searchParams} locale={locale} t={t} name={name} />
      </Suspense>
    </div>
  );
}

async function Body({ vendor, searchParams, locale, t, name }) {
  const sp = (await searchParams) ?? {};

  const stars = Number(sp.stars);
  const rating = stars >= 1 && stars <= 5 ? stars : null;
  const page = Math.max(1, Number(sp.page) || 1);

  /**
   * And: may the person reading this rate them?
   *
   * A buyer who dealt with a showroom and is now on its reviews page is the
   * likeliest person on the site to leave one, and this page used to say nothing
   * to them. It costs one narrow read, and only for a signed-in visitor — an
   * anonymous reader pays nothing for a prompt that could not apply to them.
   */
  const viewer = await currentViewer();

  const [summary, { items, total }, myDeal] = await Promise.all([
    getVendorRatingSummary(vendor.id),
    getPublicVendorReviews(vendor.id, {
      rating,
      limit: PER_PAGE,
      offset: (page - 1) * PER_PAGE,
    }),
    viewer ? getReviewableDealFor(viewer.userId, vendor.id).catch(() => null) : null,
  ]);

  /* Shown above the reviews, and above the empty state too: being the first to
     rate a showroom is a perfectly good thing to invite. */
  const invitation = myDeal ? (
    <Card className="mt-6 flex flex-wrap items-center gap-3 p-4">
      <Star className="h-5 w-5 fill-[var(--gold)] text-[var(--gold)]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-primary">
          {t('تعاملت مع هذا المعرض', 'You dealt with this showroom')}
        </p>
        <p className="text-xs text-muted-foreground">
          {t('شارك تجربتك لمساعدة بقية المشترين.', 'Tell other buyers how it went.')}
        </p>
      </div>
      <Link
        href={`/${locale}/marketplace/account/reviews?lead=${myDeal.id}`}
        className="raised-solid rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
      >
        {t('اكتب تقييماً', 'Write a review')}
      </Link>
    </Card>
  ) : null;

  if (!summary.total) {
    return (
      <>
      {invitation}
      <div className="mt-8 rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
        <Star className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('لا توجد تقييمات بعد', 'No reviews yet')}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            'يقيّم المشترون المعرض بعد التواصل معه بشأن سيارة.',
            'Buyers rate a showroom after they have been in touch about a car.'
          )}
        </p>
      </div>
      </>
    );
  }

  const href = (next) => {
    const q = new URLSearchParams();
    if (next.rating) q.set('stars', String(next.rating));
    if (next.page && next.page > 1) q.set('page', String(next.page));
    const query = q.toString();
    return `/${locale}/marketplace/vendors/${vendor.slug}/reviews${query ? `?${query}` : ''}`;
  };

  const pages = Math.ceil(total / PER_PAGE);

  return (
    <>
      {/* Google reads this, and it is what puts stars beside the showroom in a
          search result. Built from the same visible rows as the page, so the
          markup can never claim a rating the page does not show. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'AutoDealer',
            name,
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: Number(summary.average.toFixed(2)),
              reviewCount: summary.total,
              bestRating: 5,
              worstRating: 1,
            },
          }),
        }}
      />

      {invitation}

      <div className="mt-6 rounded-xl border p-5 dark:border-white/10">
        <RatingSummary summary={summary} locale={locale} />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link
          href={href({})}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            rating
              ? 'border-gray-200 text-muted-foreground hover:border-brand-primary dark:border-white/10'
              : 'border-brand-primary bg-brand-primary/10 text-brand-primary'
          }`}
        >
          {t('الكل', 'All')} ({summary.total})
        </Link>

        {[5, 4, 3, 2, 1].map((n) => {
          const count = summary.buckets[5 - n];
          return (
            <Link
              key={n}
              href={count ? href({ rating: n }) : href({})}
              aria-disabled={!count}
              className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs transition-colors ${
                rating === n
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-gray-200 text-muted-foreground hover:border-brand-primary dark:border-white/10'
              } ${count ? '' : 'pointer-events-none opacity-40'}`}
            >
              {n}
              <Stars value={1} size="h-3 w-3" label={`${n}`} />
              <span className="tabular-nums">({count})</span>
            </Link>
          );
        })}
      </div>

      <div className="mt-4 space-y-3">
        {items.length ? (
          items.map((review) => (
            <ReviewCard key={review.id} review={review} locale={locale} showCar />
          ))
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t('لا توجد تقييمات بهذا العدد من النجوم.', 'No reviews with that many stars.')}
          </p>
        )}
      </div>

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ rating, page: n })}
              aria-current={n === page ? 'page' : undefined}
              className={`min-w-9 rounded-lg border px-3 py-1.5 text-center text-xs tabular-nums ${
                n === page
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-gray-200 text-muted-foreground hover:border-brand-primary dark:border-white/10'
              }`}
            >
              {n}
            </Link>
          ))}
        </nav>
      ) : null}
    </>
  );
}

function ReviewsSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      <div className="rounded-xl border p-5 dark:border-white/10">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="mt-3 h-2 w-full" />
        <Skeleton className="mt-2 h-2 w-full" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-xl border p-4 dark:border-white/10">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
