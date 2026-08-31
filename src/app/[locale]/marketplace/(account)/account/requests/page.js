import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ClipboardList } from 'lucide-react';
import { currentViewer } from '@/marketplace/auth/session';
import { getBuyerRequests } from '@/marketplace/db/queries/account';
import RequestCard from '../../_components/RequestCard';
import LiveRequests from '../../_components/LiveRequests';
import { Skeleton } from '@/components/ui/skeleton';

export const metadata = {
  title: 'My requests',
  robots: { index: false, follow: false },
};

/**
 * What the buyer has sent, and who has it.
 *
 * Replaces the old "My enquiries" thread list. There is no conversation to open
 * any more — a showroom answers a request by calling the number on it — so this
 * page tells someone the two things they can actually use: that it arrived, and
 * which showroom is holding it.
 *
 * ── It IS a status page now, carefully ──────────────────────────────────────
 *
 * It deliberately was not, on the grounds that `stage` is the seller's private
 * note to themselves. That reasoning protected the wrong person: a buyer with
 * no idea whether anyone had even opened their request has nothing to do but
 * send it again, which is how a pipeline fills with duplicates.
 *
 * The stage is shown — TRANSLATED for the buyer, never in the showroom's own
 * words. `lost` is the seller's judgement that a deal died; the buyer sees
 * "Closed", which is the same fact without the verdict. See lib/lead-stages,
 * where the two vocabularies live side by side so neither can leak into the
 * other by accident.
 */
export default async function RequestsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 lg:px-6">
      <h1 className="text-2xl font-bold text-brand-primary">{t('طلباتي', 'My requests')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          'ما أرسلته إلى المعارض. يتواصل معك البائع على رقمك.',
          'What you have sent to showrooms. The seller contacts you on your number.'
        )}
      </p>

      <div className="mt-6">
        <Suspense fallback={<ListSkeleton />}>
          <RequestList locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function RequestList({ locale, t }) {
  const viewer = await currentViewer();
  if (!viewer) redirect(`/${locale}/marketplace/login?next=/${locale}/marketplace/account/requests`);

  const { items, missing } = await getBuyerRequests(viewer.userId);

  /**
   * The listener goes OUTSIDE the empty check, and that is the whole point.
   *
   * It used to live in the has-items branch, which made it work in every case
   * except the one that needed it most: a buyer whose only request had just
   * been deleted saw the empty state, so nothing was mounted, so nothing was
   * listening — and when the showroom restored it a moment later the page sat
   * there empty until they reloaded by hand.
   *
   * An empty list is a STATE, not an absence of the page. It can stop being
   * empty without the buyer doing anything, so it has to be listening too.
   */
  return (
    <>
      {/* Renders nothing. Listens on buyer:<id> and re-reads this list when a
          showroom moves, deletes or restores one of these requests. */}
      <LiveRequests userId={viewer.userId} />

      {missing || !items.length ? (
        <div className="rounded-2xl border border-dashed border-gray-300 p-10 text-center dark:border-white/15">
          <ClipboardList className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t('لم ترسل أي طلب بعد.', 'You have not sent a request yet.')}
          </p>
          <Link
            href={`/${locale}/marketplace/cars`}
            className="mt-4 inline-block rounded-2xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white"
          >
            {t('تصفّح السيارات', 'Browse cars')}
          </Link>
        </div>
      ) : (
      <ul className="flex flex-col gap-3">
        {items.map((row) => (
        // One client component per row, and it owns its own status.
        //
        // The markup used to be server-rendered with two small client
        // components bolted on for the buttons, which worked and FELT broken:
        // pressing cancel did nothing visible until the row had been written,
        // the path revalidated and a new page streamed down. The card now shows
        // what it believes and corrects itself when the server answers.
          <RequestCard key={row.id} row={row} locale={locale} />
        ))}
      </ul>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-28 w-full rounded-2xl" />
      ))}
    </div>
  );
}
