import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Clock, Star } from 'lucide-react';
import { currentViewer } from '@/marketplace/auth/session';
import { getBuyerReviews, getReviewableDeals } from '@/marketplace/db/queries/reviews';
import { localized } from '@/marketplace/lib/listing';
import { REVIEW_WAIT_HOURS } from '@/marketplace/lib/review';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import ReviewCard from '@/marketplace/ui/ReviewCard';
import ReviewForm from '../../_components/ReviewForm';

export const metadata = {
  title: 'My reviews',
  robots: { index: false, follow: false },
};

/**
 * Where a buyer rates a showroom they dealt with, and reads back what they
 * wrote.
 *
 * ── The page starts from DEALS, not from a "write a review" button ──────────
 *
 * There is no box on this site into which anybody may type a rating of anybody.
 * A review hangs off a request the buyer actually sent, so the page opens with
 * the requests that are ready to be rated and the form is attached to one of
 * them. That is also what makes the rating on a storefront mean something: it
 * cannot be written by a stranger, a competitor or a robot.
 *
 * ── Why "not yet" rows are shown at all ─────────────────────────────────────
 *
 * A request sent an hour ago cannot be reviewed yet (see lib/review.js). It
 * would be easier to leave it out of the list — and then a buyer who came here
 * to rate that exact showroom finds nothing and concludes the feature is
 * broken. It is listed, greyed, with the hour it opens.
 */
export default async function AccountReviewsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);



  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6">
      <h1 className="text-2xl font-bold text-brand-primary">{t('تقييماتي', 'My reviews')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          'قيّم المعارض التي تعاملت معها. تقييمك يظهر على صفحة المعرض باسمك الأول.',
          'Rate the showrooms you dealt with. Your review appears on their page under your first name.'
        )}
      </p>

      {/* ONE boundary for the whole page. Two sections that finish at different
          moments read as the page loading twice. */}
      <Suspense fallback={<PageSkeleton />}>
        <Body locale={locale} t={t} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({ locale, t, searchParams }) {
  /**
   * `?lead=<id>` — one deal, its form already open. What a "rate us" link
   * points at: landing on a list and having to find the right showroom in it is
   * the friction that stops somebody who had already decided to write one.
   *
   * Awaited HERE, inside the Suspense boundary, and not in the page above it.
   * Reading searchParams in the shell makes the shell un-prerenderable under
   * cacheComponents — the build says so outright: "encountered uncached or
   * runtime data during prerendering". Same shape as every other page in this
   * app that takes a query parameter.
   */
  const sp = (await searchParams) ?? {};
  const wantedLead = typeof sp.lead === 'string' ? sp.lead : null;

  const viewer = await currentViewer();
  if (!viewer) redirect(`/${locale}/marketplace/login?next=/${locale}/marketplace/account/reviews`);

  const [{ open, waiting }, mine] = await Promise.all([
    getReviewableDeals(viewer.userId),
    getBuyerReviews(viewer.userId),
  ]);

  /* The named deal first — a link that opens a form three screens down is a
     link that looks broken on a phone. */
  if (wantedLead) {
    open.sort((a, b) => (a.id === wantedLead ? -1 : b.id === wantedLead ? 1 : 0));
  }

  const nothingAtAll = !open.length && !waiting.length && !mine.length;

  if (nothingAtAll) {
    return (
      <div className="mt-6 rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
        <Star className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('لا يوجد ما تقيّمه بعد', 'Nothing to review yet')}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            'بعد إرسال طلب إلى معرض والتواصل معه، يمكنك تقييم تجربتك من هنا.',
            'Once you have sent a request to a showroom and heard from them, you can rate the experience here.'
          )}
        </p>
      </div>
    );
  }

  const carName = (lead) =>
    localized(lead.listings?.name ?? lead.listing_title, locale) || t('سيارة', 'a car');

  const shopName = (lead) => localized(lead.vendors?.name, locale);

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
      : null;

  return (
    <div className="mt-6 space-y-8">
      {open.length ? (
        <section>
          <h2 className="text-sm font-semibold text-brand-primary">
            {t('بانتظار تقييمك', 'Waiting for your rating')}
            <span className="ms-2 font-normal text-muted-foreground tabular-nums">({open.length})</span>
          </h2>

          <div className="mt-3 space-y-3">
            {open.map((lead) => (
              <Card
                key={lead.id}
                id={`deal-${lead.id}`}
                className={`p-4 ${lead.id === wantedLead ? 'ring-2 ring-brand-primary' : ''}`}
              >
                <p className="text-sm font-medium text-brand-primary">{shopName(lead)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{carName(lead)}</p>
                <div className="mt-3">
                  <ReviewForm
                    locale={locale}
                    leadId={lead.id}
                    shopName={shopName(lead)}
                    carName={carName(lead)}
                    open={lead.id === wantedLead}
                  />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {waiting.length ? (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground">
            {t('لم يحن وقتها بعد', 'Not open for rating yet')}
          </h2>

          <div className="mt-3 space-y-2">
            {waiting.map((lead) => (
              <Card key={lead.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 opacity-70">
                <span className="text-sm font-medium text-brand-primary">{shopName(lead)}</span>
                <span className="text-xs text-muted-foreground">{carName(lead)}</span>
                <span className="ms-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {lead.eligibility?.availableAt
                    ? t(`يمكنك التقييم بعد ${when(lead.eligibility.availableAt)}`, `You can rate this after ${when(lead.eligibility.availableAt)}`)
                    : t(`بعد ${REVIEW_WAIT_HOURS} ساعة من الإرسال`, `${REVIEW_WAIT_HOURS} hours after you send it`)}
                </span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {mine.length ? (
        <section>
          <h2 className="text-sm font-semibold text-brand-primary">
            {t('ما كتبته', 'What you wrote')}
            <span className="ms-2 font-normal text-muted-foreground tabular-nums">({mine.length})</span>
          </h2>

          <div className="mt-3 space-y-3">
            {mine.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                locale={locale}
                showShop
                /* Their own words, so they are told WHY it was taken down —
                   the only way an appeal or a rewrite can start. */
                showHiddenReason
              >
                <details className="group">
                  <summary className="cursor-pointer list-none text-xs text-muted-foreground hover:text-brand-primary">
                    {t('تعديل أو حذف', 'Edit or delete')}
                  </summary>
                  <div className="mt-3">
                    <ReviewForm locale={locale} review={review} open />
                  </div>
                </details>
              </ReviewCard>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-xl border p-4 dark:border-white/10">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-2 h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-36" />
        </div>
      ))}
    </div>
  );
}
