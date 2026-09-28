import Link from 'next/link';
import { CalendarMinus } from 'lucide-react';

/**
 * "Your subscription was shortened, and here is why."
 *
 * ── Why the date alone was not enough ───────────────────────────────────────
 *
 * An admin can take time back — a mistyped extension, a transfer that bounced,
 * a refund. Before this, all a seller saw was a different number: six months on
 * Monday, three on Tuesday, and nothing anywhere saying who did that or why. The
 * reason existed in the audit log, which is deliberately unreadable by its
 * subject, and in one bell notification that is read once and scrolls away.
 * Neither answers the question on the morning the seller notices.
 *
 * ── Separate from the countdown, deliberately ───────────────────────────────
 *
 * TrialEndingBanner fires inside the last week and says "you are nearly out".
 * This says "something changed" and is not tied to that window: taking four
 * months off a showroom with six left is the change worth announcing even though
 * two months is not urgent. The two can appear together — first what happened,
 * then how long is left — and that is the right order to read them in.
 *
 * ── Why it stops showing ────────────────────────────────────────────────────
 *
 * Two ways, and neither needs a dismiss button or anywhere to store one.
 *
 * An extension CLEARS the columns, because giving time back supersedes having
 * taken it. And after WINDOW_DAYS it stops on its own — a notice about a
 * correction made a month ago has been read or is never going to be, and a
 * permanent banner is a banner nobody sees. The record stays in the row and in
 * the bell either way.
 *
 * A server component with no state: the columns rode along on the session read
 * the layout had already done, so this costs nothing.
 */

const DAY = 86_400_000;

/** How long the notice stays up after the change. */
const WINDOW_DAYS = 14;

export default function AccessReducedNotice({
  locale = 'ar',
  reason = null,
  at = null,
  days = null,
  until = null,
}) {
  const t = (ar, en) => (locale === 'ar' ? ar : en);

  /* Nothing to say without a reason: the admin is required to type one, so a
     row with a date but no sentence predates that rule or predates the columns.
     A notice reading "your subscription was shortened" and stopping there is
     worse than silence — it is the ambush this exists to prevent. */
  if (!reason) return null;

  const when = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(when)) return null;
  if (Date.now() - when > WINDOW_DAYS * DAY) return null;

  const date = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  const ends = date(until);
  const n = Number(days);
  const count = Number.isFinite(n) && n > 0 ? n : null;

  return (
    <div className="mx-4 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 lg:mx-6 dark:bg-amber-950/40 dark:text-amber-300">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <CalendarMinus className="h-4 w-4 shrink-0" />

        <span className="font-medium">
          {count
            ? t(`تم تقليص مدة اشتراكك بـ ${count} يوم`, `${count} days were taken off your subscription`)
            : t('تم تقليص مدة اشتراكك', 'Your subscription was shortened')}
        </span>

        {ends ? (
          <span className="text-amber-800/80 dark:text-amber-300/80">
            {t(`تنتهي الآن في ${ends}`, `it now ends on ${ends}`)}
          </span>
        ) : null}

        <Link
          href={`/${locale}/marketplace/seller/billing`}
          className="ms-auto font-semibold underline hover:no-underline"
        >
          {t('تجديد الاشتراك', 'Renew')}
        </Link>
      </div>

      {/* The sentence the admin was made to type, on its own line rather than
          squeezed into the row above — it is the part that answers the question,
          and it can be up to 300 characters. */}
      <p className="mt-1 text-amber-800/90 dark:text-amber-300/90">{reason}</p>
    </div>
  );
}
