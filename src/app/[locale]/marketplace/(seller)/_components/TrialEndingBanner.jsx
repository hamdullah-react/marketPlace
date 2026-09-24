import Link from 'next/link';
import { CalendarClock } from 'lucide-react';

/**
 * "Your access ends on Monday."
 *
 * Shown only in the last week (lib/access.js decides when), and deliberately as
 * a line rather than a dialog: a seller in the middle of publishing a car should
 * be told, not interrupted. The day it runs out they meet the real screen.
 *
 * A server component with no state — the countdown comes from the layout, which
 * already resolved the session, so this costs nothing and cannot disagree with
 * the guard that will eventually close the door.
 */
export default function TrialEndingBanner({ locale = 'ar', daysLeft = 0, until = null }) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);

  const when = until
    ? new Date(until).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
        day: 'numeric',
        month: 'long',
      })
    : null;

  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:mx-6 dark:bg-amber-950/40 dark:text-amber-300">
      <CalendarClock className="h-4 w-4 shrink-0" />

      <span className="font-medium">
        {daysLeft <= 1
          ? t('ينتهي وصولك إلى اللوحة اليوم', 'Your dashboard access ends today')
          : t(`ينتهي وصولك إلى اللوحة بعد ${daysLeft} أيام`, `Your dashboard access ends in ${daysLeft} days`)}
      </span>

      {when ? <span className="text-amber-800/80 dark:text-amber-300/80">({when})</span> : null}

      <Link
        href={`/${locale}/marketplace/seller/billing`}
        className="ms-auto font-semibold underline hover:no-underline"
      >
        {t('تجديد الاشتراك', 'Renew')}
      </Link>
    </div>
  );
}
