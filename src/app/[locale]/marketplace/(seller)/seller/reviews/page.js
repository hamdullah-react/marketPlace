import { Suspense } from 'react';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { Star, MessageSquare, EyeOff, BadgeCheck, Car } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorReviews, getReviewSummary } from '@/marketplace/db/queries/seller';
import { localized } from '@/marketplace/lib/listing';
import { Skeleton } from '@/components/ui/skeleton';

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

/** Five stars, filled to `value`. Half stars are not worth the SVG. */
function Stars({ value = 0, className = 'h-4 w-4' }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${className} ${
            n <= Math.round(value)
              ? 'fill-amber-400 text-amber-400'
              : 'text-gray-300 dark:text-gray-600'
          }`}
        />
      ))}
    </span>
  );
}

/**
 * What buyers said about this showroom.
 *
 * Hidden reviews are shown to the SELLER, marked as hidden. A review taken down
 * by moderation is still about them and still counted in the history they are
 * being judged on; hiding it from them too means watching a rating move with no
 * way to see why.
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

        <div className="px-4 lg:px-6">
          <Suspense fallback={<SummarySkeleton />}>
            <Summary searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<ListSkeleton />}>
            <List searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ── Average and histogram ───────────────────────────────────────────────── */

async function Summary({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  const s = await getReviewSummary(vendorId).catch(() => null);
  if (!s || !s.total) return null;

  return (
    <div className="flex flex-col gap-6 rounded-xl border bg-white p-5 shadow-xs sm:flex-row sm:items-center dark:border-white/10 dark:bg-[#161616]">
      <div className="shrink-0 text-center sm:w-40">
        <p className="text-4xl font-bold tabular-nums text-brand-primary">
          {s.average.toFixed(1)}
        </p>
        <div className="mt-1 flex justify-center">
          <Stars value={s.average} />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(`${s.total} تقييم`, `${s.total} review${s.total === 1 ? '' : 's'}`)}
        </p>
      </div>

      {/* Five bars, five stars down to one. Widths are a share of the largest
          bucket, not of the total — with 90% five-star, proportions of the
          total make the other four invisible. */}
      <div className="flex-1 space-y-1.5">
        {s.buckets.map((count, i) => {
          const stars = 5 - i;
          const max = Math.max(...s.buckets, 1);
          return (
            <div key={stars} className="flex items-center gap-2 text-xs">
              <span className="w-3 tabular-nums text-muted-foreground">{stars}</span>
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-white/10">
                <span
                  className="block h-full rounded-full bg-amber-400"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="w-6 text-end tabular-nums text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>

      {s.unanswered ? (
        <div className="shrink-0 rounded-lg bg-amber-50 px-4 py-3 text-center dark:bg-amber-950/40">
          <p className="text-lg font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {s.unanswered}
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('بلا رد', 'awaiting a reply')}
          </p>
        </div>
      ) : null}
    </div>
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

/* ── The reviews ─────────────────────────────────────────────────────────── */

async function List({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  let items = [];
  try {
    ({ items } = await getVendorReviews(vendorId));
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        {t('تعذّر تحميل التقييمات.', 'Could not load reviews.')}
      </p>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
        <Star className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('لا توجد تقييمات بعد', 'No reviews yet')}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            'يمكن للمشترين التقييم بعد إتمام عملية شراء أو تجربة قيادة.',
            'Buyers can leave a review after a completed purchase or a test drive.'
          )}
        </p>
      </div>
    );
  }

  const when = (iso) =>
    new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });

  return (
    <div className="space-y-3">
      {items.map((r) => {
        const listing = r.listings;
        const cover = Array.isArray(listing?.media) ? listing.media[0]?.url : null;

        return (
          <div
            key={r.id}
            className={`rounded-xl border bg-white p-4 dark:bg-[#161616] ${
              r.hidden
                ? 'border-red-200 dark:border-red-900/60'
                : 'border-gray-200 dark:border-white/10'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Stars value={r.rating} />

              {r.verified_purchase ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 dark:bg-green-950 dark:text-green-400">
                  <BadgeCheck className="h-3 w-3" />
                  {t('شراء موثّق', 'Verified purchase')}
                </span>
              ) : null}

              {/* Marked, not omitted — see the note at the top of the file. */}
              {r.hidden ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 dark:bg-red-950 dark:text-red-400">
                  <EyeOff className="h-3 w-3" />
                  {t('مخفي', 'Hidden')}
                </span>
              ) : null}

              <span className="ms-auto text-xs text-muted-foreground">{when(r.created_at)}</span>
            </div>

            {r.body ? (
              <p className="mt-3 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {r.body}
              </p>
            ) : (
              <p className="mt-3 text-sm italic text-muted-foreground">
                {t('تقييم بلا تعليق.', 'A rating with no comment.')}
              </p>
            )}

            {r.hidden && r.hidden_reason ? (
              <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {t('سبب الإخفاء: ', 'Hidden because: ')}
                {r.hidden_reason}
              </p>
            ) : null}

            {listing ? (
              <Link
                href={`/${locale}/marketplace/listing/${listing.slug}`}
                className="mt-3 flex items-center gap-2 text-xs text-muted-foreground hover:text-brand-primary"
              >
                {cover ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={cover} alt="" loading="lazy" className="h-8 w-10 rounded object-cover" />
                ) : (
                  <Car className="h-4 w-4" />
                )}
                {localized(listing.name, locale)}
              </Link>
            ) : null}

            {r.vendor_reply ? (
              <div className="mt-3 rounded-lg border-s-2 border-brand-primary bg-brand-primary/5 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-brand-primary">
                  <MessageSquare className="h-3.5 w-3.5" />
                  {t('ردّك', 'Your reply')}
                  {r.vendor_replied_at ? (
                    <span className="font-normal text-muted-foreground">
                      · {when(r.vendor_replied_at)}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{r.vendor_reply}</p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                {t('لم تردّ على هذا التقييم بعد.', 'You have not replied to this review yet.')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-3">
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
