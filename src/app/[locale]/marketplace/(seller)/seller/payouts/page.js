import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Wallet, Clock, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorPayouts, getPayoutTotals } from '@/marketplace/db/queries/seller';
import { formatPrice } from '@/marketplace/lib/listing';
import { TableSkeleton } from '../../../_components/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Payouts',
  robots: { index: false, follow: false },
};

const STATE_STYLES = {
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  approved: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  paid: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  failed: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
};

const STATE_LABELS = {
  draft: { ar: 'قيد الإعداد', en: 'Being prepared' },
  approved: { ar: 'معتمد', en: 'Approved' },
  paid: { ar: 'مدفوع', en: 'Paid' },
  failed: { ar: 'فشل التحويل', en: 'Transfer failed' },
};

/**
 * What the platform owes this showroom, and what it has already sent.
 *
 * Read-only, and the page says so. A payout is the platform's statement of
 * account; a seller who could edit one would be editing the evidence. Every
 * button here would have been a button that fails.
 */
export default async function PayoutsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('المستحقات', 'Payouts')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'ما تم تحويله إليك وما هو قيد التحويل. تُعد المستحقات لكل فترة تلقائياً.',
              'What has been transferred to you and what is on its way. Payouts are prepared per period automatically.'
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
          <TotalsSkeleton />
        </div>

        <div className="px-4 lg:px-6">
          <TableSkeleton rows={6} cols={5} />
        </div>
            </>
          }
        >
        <div className="px-4 lg:px-6">
          <Totals searchParams={searchParams} locale={locale} t={t} />
        </div>

        <div className="px-4 lg:px-6">
          <PayoutTable searchParams={searchParams} locale={locale} t={t} />
        </div>
        </Suspense>
      </div>
    </div>
  );
}

/* ── The three numbers ───────────────────────────────────────────────────── */

async function Totals({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  const totals = await getPayoutTotals(vendorId).catch(() => ({
    paid: 0, pending: 0, failed: 0,
  }));

  const CARDS = [
    { key: 'paid', icon: CheckCircle2, ar: 'مدفوع', en: 'Paid out', value: totals.paid, tone: 'text-green-600' },
    { key: 'pending', icon: Clock, ar: 'قيد التحويل', en: 'On its way', value: totals.pending, tone: 'text-amber-600' },
    // Only when it has happened. A permanent "0 failed" card spends a third of
    // the row telling a seller nothing has gone wrong.
    ...(totals.failed
      ? [{ key: 'failed', icon: AlertTriangle, ar: 'فشل', en: 'Failed', value: totals.failed, tone: 'text-red-600' }]
      : []),
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CARDS.map(({ key, icon: Icon, ar, en, value, tone }) => (
        <div
          key={key}
          className="rounded-xl border bg-white p-5 shadow-xs dark:border-white/10 dark:bg-[#161616]"
        >
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon className={`h-4 w-4 ${tone}`} />
            {t(ar, en)}
          </p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-brand-primary">
            {formatPrice(value, locale)}
          </p>
        </div>
      ))}
    </div>
  );
}

function TotalsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="rounded-xl border p-5 dark:border-white/10">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

/* ── The statements ──────────────────────────────────────────────────────── */

async function PayoutTable({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  let items = [];
  try {
    ({ items } = await getVendorPayouts(vendorId));
  } catch {
    return (
      <p className="text-sm text-muted-foreground">
        {t('تعذّر تحميل المستحقات.', 'Could not load payouts.')}
      </p>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
        <Wallet className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('لا توجد مستحقات بعد', 'No payouts yet')}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {t(
            'تظهر هنا أول مستحقات بعد أول عملية بيع مكتملة.',
            'Your first statement appears here after your first completed sale.'
          )}
        </p>
      </div>
    );
  }

  const period = (from, to) => {
    const fmt = (d) =>
      new Date(d).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
        day: 'numeric', month: 'short', year: 'numeric',
      });
    return `${fmt(from)} – ${fmt(to)}`;
  };

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-gray-50 dark:bg-[#141414]">
            <tr className="text-xs text-gray-500 dark:text-gray-400">
              <th className="px-4 py-3 text-start font-medium">{t('الفترة', 'Period')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('الإجمالي', 'Gross')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('العمولة', 'Commission')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('الصافي', 'Net')}</th>
              <th className="px-4 py-3 text-start font-medium">{t('الحالة', 'Status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {items.map((p) => (
              <tr key={p.id} className="bg-white dark:bg-[#1a1a1a]">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">
                    {period(p.period_start, p.period_end)}
                  </p>
                  {p.reference ? (
                    <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                      {p.reference}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 tabular-nums">{formatPrice(p.gross, locale)}</td>
                {/* Shown as a negative, because it is money leaving the gross —
                    printing it bare makes the arithmetic look wrong. */}
                <td className="px-4 py-3 tabular-nums text-gray-500 dark:text-gray-400">
                  −{formatPrice(p.commission, locale)}
                </td>
                <td className="px-4 py-3 font-semibold tabular-nums text-brand-primary">
                  {formatPrice(p.net, locale)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      STATE_STYLES[p.state] ?? STATE_STYLES.draft
                    }`}
                  >
                    {t(
                      STATE_LABELS[p.state]?.ar ?? p.state,
                      STATE_LABELS[p.state]?.en ?? p.state
                    )}
                  </span>
                  {/* The reason a transfer failed is the only actionable thing
                      on this page — usually a wrong IBAN. */}
                  {p.state === 'failed' && p.failure_reason ? (
                    <p className="mt-1 text-xs text-red-600">{p.failure_reason}</p>
                  ) : null}
                  {p.state === 'paid' && p.paid_at ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.paid_at).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB')}
                    </p>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t(
          'المستحقات تُعدّها المنصة ولا يمكن تعديلها من هنا. لأي استفسار عن مبلغ، تواصل معنا.',
          'Payouts are prepared by the platform and cannot be edited here. Get in touch about any amount you have a question about.'
        )}
      </p>
    </>
  );
}
