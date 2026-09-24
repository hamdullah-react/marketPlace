import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Star } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getModerationReviews, getModerationCounts } from '@/marketplace/db/queries/reviews';
import ReviewCard from '@/marketplace/ui/ReviewCard';
import ReviewModerationActions from '../../_components/ReviewModerationActions';

export const instant = false;

export const metadata = {
  title: 'Review moderation',
  robots: { index: false, follow: false },
};

const PER_PAGE = 30;

/**
 * Moderation.
 *
 * ── The tabs are the job, not a filter menu ─────────────────────────────────
 *
 * Nobody opens this screen to read every review ever left. They open it because
 * a showroom complained, or to check on the ones most likely to need an eye.
 * So the scopes are the questions actually asked: what is currently taken down
 * (and can be put back), which reviews are harsh enough to be worth reading
 * (1–2 stars), and which have been sitting unanswered — a showroom that never
 * replies is a marketplace problem before it is theirs.
 *
 * ── There is no "reported" queue, deliberately ──────────────────────────────
 *
 * Nothing on the site lets a visitor report a review, so a queue built on
 * reports would always be empty and would imply a button that does not exist.
 * `critical` is the honest version of the same idea until reporting is built.
 */
export default async function AdminReviewsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">
            {t('إدارة التقييمات', 'Review moderation')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'إخفاء تقييم يوقف احتسابه في تقييم المعرض فوراً، ويمكن التراجع عنه.',
              'Hiding a review stops it counting towards the showroom’s rating at once, and can be undone.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<ModerationSkeleton />}>
            <Body searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Body({ searchParams, locale, t }) {
  const sp = (await searchParams) ?? {};

  const SCOPES = [
    { key: 'all', label: t('الكل', 'All') },
    { key: 'critical', label: t('نجمة أو نجمتان', '1–2 stars') },
    { key: 'unanswered', label: t('بلا رد', 'Unanswered') },
    { key: 'hidden', label: t('مخفية', 'Hidden') },
  ];

  const scope = SCOPES.some((s) => s.key === sp.scope) ? sp.scope : 'all';
  const page = Math.max(1, Number(sp.page) || 1);

  const [counts, feed] = await Promise.all([
    getModerationCounts(),
    getModerationReviews({ scope, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }).catch(() => ({
      items: [],
      total: 0,
      missing: true,
    })),
  ]);

  /* The table has never been created on this database. Said plainly, with the
     file to run — the alternative is an empty screen that looks like a bug. */
  if (feed.missing) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          {t('جدول التقييمات غير موجود', 'The reviews table is not there yet')}
        </p>
        <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
          {t(
            'شغّل src/marketplace/db/schema.sql (قسم REVIEWS) على قاعدة البيانات.',
            'Run src/marketplace/db/schema.sql (the REVIEWS section) on this database.'
          )}
        </p>
      </div>
    );
  }

  const href = (next) => {
    const q = new URLSearchParams();
    if (next.scope && next.scope !== 'all') q.set('scope', next.scope);
    if (next.page && next.page > 1) q.set('page', String(next.page));
    const query = q.toString();
    return `/${locale}/marketplace/admin/reviews${query ? `?${query}` : ''}`;
  };

  const countOf = (key) =>
    key === 'all' ? counts.all : key === 'hidden' ? counts.hidden : key === 'unanswered' ? counts.unanswered : counts.critical;

  const pages = Math.ceil(feed.total / PER_PAGE);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {SCOPES.map((s) => (
          <Link
            key={s.key}
            href={href({ scope: s.key })}
            aria-current={s.key === scope ? 'page' : undefined}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              s.key === scope
                ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                : 'border-gray-200 text-muted-foreground hover:border-brand-primary dark:border-white/10'
            }`}
          >
            {s.label}
            <span className="ms-1.5 tabular-nums">{countOf(s.key)}</span>
          </Link>
        ))}
      </div>

      {feed.items.length ? (
        <div className="mt-4 space-y-3">
          {feed.items.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              locale={locale}
              showCar
              showShop
              showHiddenReason
            >
              <ReviewModerationActions
                locale={locale}
                reviewId={review.id}
                hidden={Boolean(review.hidden)}
              />
            </ReviewCard>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <Star className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-semibold text-brand-primary">
            {scope === 'all'
              ? t('لا توجد تقييمات بعد', 'No reviews yet')
              : t('لا شيء في هذه القائمة', 'Nothing in this list')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {scope === 'hidden'
              ? t('لم يُخفَ أي تقييم.', 'No review has been taken down.')
              : t('وهذا خبر جيد.', 'Which is good news.')}
          </p>
        </div>
      )}

      {pages > 1 ? (
        <nav className="mt-6 flex items-center justify-center gap-2">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link
              key={n}
              href={href({ scope, page: n })}
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

function ModerationSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
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
