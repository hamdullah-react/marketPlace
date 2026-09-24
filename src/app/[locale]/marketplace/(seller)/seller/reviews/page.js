import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Star } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorReviews, getReviewSummary } from '@/marketplace/db/queries/seller';
import { Skeleton } from '@/components/ui/skeleton';
import ReviewCard from '@/marketplace/ui/ReviewCard';
import RatingSummary from '@/marketplace/ui/RatingSummary';
import ReviewReplyForm from '../../_components/ReviewReplyForm';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Reviews',
  robots: { index: false, follow: false },
};

/**
 * What buyers said about this showroom, and where it answers them.
 *
 * ── The seller may reply, and may not edit ──────────────────────────────────
 *
 * The only control on this page writes `vendor_reply`. A rating cannot be
 * changed, deleted or hidden from here — moderation is the platform's, and a
 * marketplace where a showroom can delete its own one-star reviews has a
 * rating column that means nothing. What a seller gets instead is the last
 * word, in public, under the review.
 *
 * ── Hidden reviews are shown to the SELLER, marked ──────────────────────────
 *
 * A review taken down by moderation is still about them and still part of the
 * history they are judged on. Hiding it from them as well means watching a
 * rating move with no way to see why. It is excluded from the average, exactly
 * as it is on the storefront.
 */
export default async function SellerReviewsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('التقييمات', 'Reviews')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'ما قاله المشترون عن معرضك. الرد على تقييم يظهر تحته للجميع.',
              'What buyers said about your showroom. A reply appears underneath for everyone to see.'
            )}
          </p>
        </div>

        {/* ONE loading step. These sections had a boundary each and finished at
            different moments, so the page filled in piece by piece and read as
            loading more than once. One boundary swaps every skeleton for the
            finished page together. */}
        <Suspense
          fallback={
            <>
              <div className="px-4 lg:px-6">
                <SummarySkeleton />
              </div>
              <div className="px-4 lg:px-6">
                <ListSkeleton />
              </div>
            </>
          }
        >
          <Body searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  /* Both reads at once, from one resolved vendor. They used to be two
     components resolving the session twice. */
  const [summary, list] = await Promise.all([
    getReviewSummary(vendorId).catch(() => null),
    getVendorReviews(vendorId).catch(() => null),
  ]);

  if (!list) {
    return (
      <div className="px-4 lg:px-6">
        <p className="text-sm text-muted-foreground">
          {t('تعذّر تحميل التقييمات.', 'Could not load reviews.')}
        </p>
      </div>
    );
  }

  const items = list.items ?? [];

  if (!items.length) {
    return (
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <Star className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-semibold text-brand-primary">
            {t('لا توجد تقييمات بعد', 'No reviews yet')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t(
              'يقيّم المشتري معرضك بعد أن يرسل طلباً وتتواصل معه.',
              'A buyer can rate your showroom once they have sent a request and you have been in touch.'
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {summary?.total ? (
        <div className="px-4 lg:px-6">
          <div className="flex flex-col gap-6 rounded-xl border bg-white p-5 shadow-xs sm:flex-row sm:items-center dark:border-white/10 dark:bg-[#161616]">
            <RatingSummary summary={summary} locale={locale} className="flex-1" />

            {summary.unanswered ? (
              <div className="shrink-0 rounded-lg bg-amber-50 px-4 py-3 text-center dark:bg-amber-950/40">
                <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
                  {summary.unanswered}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t('بلا رد', 'awaiting a reply')}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="space-y-3 px-4 lg:px-6">
        {items.map((review) => (
          <ReviewCard
            key={review.id}
            review={review}
            locale={locale}
            showCar
            showHiddenReason
            replyLabel={t('ردّك', 'Your reply')}
          >
            <ReviewReplyForm
              locale={locale}
              reviewId={review.id}
              vendorId={vendorId}
              reply={review.vendor_reply ?? ''}
            />
          </ReviewCard>
        ))}
      </div>
    </>
  );
}

function SummarySkeleton() {
  return (
    <div className="flex flex-col gap-6 rounded-xl border p-5 sm:flex-row dark:border-white/10">
      <div className="sm:w-40">
        <Skeleton className="mx-auto h-10 w-16" />
        <Skeleton className="mx-auto mt-2 h-4 w-24" />
      </div>
      <div className="flex-1 space-y-2">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-2 w-full" />
        ))}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3 px-4 lg:px-6">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
