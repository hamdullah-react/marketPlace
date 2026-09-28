import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import {
  CalendarMinus, Landmark, Lock, Receipt, Wallet,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorPlans, getOpenRenewal } from '@/marketplace/db/queries/access';
import { getVendorChargeTotals } from '@/marketplace/db/queries/billing';
import { latestProofsByCharge } from '@/marketplace/db/queries/proofs';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { accessLabel, accessTone, WARN_DAYS } from '@/marketplace/lib/access';
import { billingDetails, accountKindLabel, formatIban } from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import AccessCountdown from '../../_components/AccessCountdown';
import RenewalPanel from '../../_components/RenewalPanel';

export const instant = false;

export const metadata = {
  title: 'Your subscription',
  robots: { index: false, follow: false },
};

/**
 * Where a showroom's subscription stands, on a page of its own.
 *
 * ── Why this exists, and what it replaced ───────────────────────────────────
 *
 * The warning used to be a banner in the seller layout, which meant it sat on
 * top of EVERY page of the dashboard — above the listings, above the leads,
 * above the media library — for as long as it applied. Two lines of amber over
 * a screen somebody opened to do something else is not a warning, it is a
 * tax on every other task, and the usual outcome is that it stops being read
 * after the second day.
 *
 * So the warning has a page, and the header's countdown is the doorway to it.
 * The chip is always on screen and changes colour as the date approaches, which
 * is the part that has to be persistent; everything a seller would DO about it
 * is one press away rather than in their way.
 *
 * ── It repeats the renewal controls deliberately ────────────────────────────
 *
 * The same panel and the same bank details are on /seller/billing. That is not
 * duplication to be tidied away: somebody arriving here has been told their
 * access is ending, and sending them on to a second page to act on it is the
 * one thing this page exists to stop. Both render the same components, so
 * neither can drift.
 */
export default async function SellerSubscriptionPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">
            {t('اشتراكك', 'Your subscription')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'كم تبقّى من مدتك، وما الذي يبقيها مفتوحة.',
              'How long you have left, and what keeps it open.'
            )}
          </p>
        </div>

        <Suspense fallback={<SubscriptionSkeleton />}>
          <Body searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId, vendor } = await requireVendor(sp?.vendor || null);

  const [plans, openRenewal, totals, site] = await Promise.all([
    getVendorPlans().catch(() => []),
    getOpenRenewal(vendorId).catch(() => null),
    getVendorChargeTotals(vendorId).catch(() => null),
    getSiteSettings().catch(() => null),
  ]);

  const { byCharge: renewalProofs } = await latestProofsByCharge(
    openRenewal ? [openRenewal.id] : []
  ).catch(() => ({ byCharge: new Map() }));

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);
  const terms = localized(details.terms, locale);

  /* The verdict computed once, by the session, and READ here. Re-deriving it on
     a page is how the blocked screen once disagreed with the guard that sent
     somebody to it — see the note in (blocked)/subscription. */
  const access = vendor.access;
  const ending = access.state === 'ending';
  const out = !access.allowed;

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Riyadh',
        })
      : null;

  return (
    <>
      {/* ── The clock, as the subject rather than a corner ─────────────────
          The same component as the header chip, in its large face. One rule for
          when amber starts, in one place. */}
      <div className="px-4 lg:px-6">
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-3 p-5">
          <AccessCountdown
            locale={locale}
            until={access.until}
            allowed={access.allowed}
            initialDaysLeft={access.daysLeft}
            size="lg"
          />

          <div className="min-w-0">
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${accessTone(access.state)}`}
            >
              {accessLabel(access.state, locale)}
            </span>
            {access.until ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {out
                  ? t(`انتهت في ${when(access.until)}`, `Ended on ${when(access.until)}`)
                  : t(`تنتهي في ${when(access.until)}`, `Ends on ${when(access.until)}`)}
              </p>
            ) : null}
          </div>

          {totals ? (
            <div className="ms-auto text-end">
              <p className="text-xs text-muted-foreground">{t('المستحق عليك', 'You owe')}</p>
              <p className="text-xl font-bold tabular-nums text-brand-primary">
                {money(totals.outstanding)}
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      {/* ── Why it is ending, when there is a reason beyond the calendar ───
          Three different causes, and a seller is owed the right one: the date
          simply arriving, an admin taking time back, or an admin switching them
          off. The first needs no explanation; the other two do. */}
      {out && access.reason ? (
        <div className="px-4 lg:px-6">
          <Card className="border-red-200 p-4 dark:border-red-900/60">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <Lock className="h-4 w-4" />
              {t('أوقفت الإدارة لوحتك', 'The platform has switched your dashboard off')}
            </p>
            <p className="mt-1 text-sm">{access.reason}</p>
          </Card>
        </div>
      ) : null}

      {vendor.access_reduced_reason ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <CalendarMinus className="h-4 w-4" />
              {Number(vendor.access_reduced_days) > 0
                ? t(
                    `تم تقليص مدتك بـ ${Number(vendor.access_reduced_days)} يوم`,
                    `${Number(vendor.access_reduced_days)} days were taken off your subscription`
                  )
                : t('تم تقليص مدة اشتراكك', 'Your subscription was shortened')}
            </p>
            <p className="mt-1 text-sm">{vendor.access_reduced_reason}</p>
            {vendor.access_reduced_at ? (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {when(vendor.access_reduced_at)}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* The plain countdown warning, for the case where nothing unusual
          happened and the date is simply close. */}
      {ending && !vendor.access_reduced_reason ? (
        <div className="px-4 lg:px-6">
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {access.daysLeft <= 1
              ? t(
                  'ينتهي وصولك إلى اللوحة اليوم. جدّد الآن حتى لا تتوقف صفحتك عن العمل من الداخل — تبقى سياراتك ظاهرة للمشترين في الحالتين.',
                  'Your dashboard access ends today. Renew now so you do not lose it — your cars stay visible to buyers either way.'
                )
              : t(
                  `ينتهي وصولك إلى اللوحة بعد ${access.daysLeft} أيام. التجديد مبكراً لا يضيّع شيئاً: المدة تُضاف إلى ما تبقّى.`,
                  `Your dashboard access ends in ${access.daysLeft} days. Renewing early loses you nothing — the time is added to whatever is left.`
                )}
          </p>
        </div>
      ) : null}

      {/* ── Renewing ──────────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-brand-primary">
            {t('تجديد الاشتراك', 'Renew your subscription')}
          </h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            {t(
              'التمديد يُضاف إلى ما تبقّى من مدتك، فالتجديد مبكراً لا يضيّع أياماً.',
              'Time is added to whatever is left, so renewing early loses you nothing.'
            )}
          </p>

          <RenewalPanel
            locale={locale}
            vendorId={vendorId}
            plans={plans}
            openRenewal={openRenewal}
            openRenewalProof={openRenewal ? (renewalProofs.get(openRenewal.id) ?? null) : null}
            requireProof={details.requireProof}
            currency={site?.currency}
          />
        </Card>
      </div>

      {/* ── Where to send it ──────────────────────────────────────────────── */}
      {details.filled ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
              <Landmark className="h-4 w-4" />
              {t('طريقة الدفع', 'How to pay')}
            </h2>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {details.accounts.map((account) => (
                <div key={account.id} className="raised-card rounded-xl p-3">
                  <p className="text-sm font-semibold text-brand-primary">{account.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {accountKindLabel(account.kind, locale)}
                    {account.country ? ` · ${account.country}` : ''}
                  </p>

                  <dl className="mt-2 space-y-0.5 text-xs">
                    {account.bankName ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('البنك', 'Bank')}</dt>
                        <dd className="truncate font-medium">{account.bankName}</dd>
                      </div>
                    ) : null}
                    {account.accountName ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('اسم الحساب', 'Account name')}</dt>
                        <dd className="truncate font-medium">{account.accountName}</dd>
                      </div>
                    ) : null}
                    {account.iban ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('الآيبان', 'IBAN')}</dt>
                        <dd className="truncate font-mono font-medium" dir="ltr">
                          {formatIban(account.iban)}
                        </dd>
                      </div>
                    ) : null}
                    {account.accountNumber ? (
                      <div className="flex gap-2">
                        <dt className="text-muted-foreground">{t('رقم الحساب', 'Account no.')}</dt>
                        <dd className="truncate font-mono font-medium" dir="ltr">
                          {account.accountNumber}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </div>
              ))}
            </div>

            {terms ? <p className="mt-3 text-xs text-muted-foreground">{terms}</p> : null}

            <p className="mt-3 flex items-start gap-2 rounded-lg bg-brand-primary/5 p-2 text-xs text-muted-foreground">
              <Receipt className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {t(
                'بعد التحويل، أرسل صورة الإيصال — لا تُسجّل الدفعة قبل أن يراها الفريق.',
                'After transferring, send us the receipt — the payment is not recorded until somebody here has seen it.'
              )}
            </p>
          </Card>
        </div>
      ) : null}

      <p className="px-4 text-xs text-muted-foreground lg:px-6">
        <Link
          href={`/${locale}/marketplace/seller/billing`}
          className="inline-flex items-center gap-1.5 font-medium text-brand-primary hover:underline"
        >
          <Wallet className="h-3.5 w-3.5" />
          {t('كشف المستحقات كاملاً', 'The full statement')}
        </Link>
      </p>
    </>
  );
}

function SubscriptionSkeleton() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border p-5 dark:border-white/10">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-3 h-3 w-64" />
        </div>
      </div>
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border p-4 dark:border-white/10">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-3 h-24 w-full" />
        </div>
      </div>
    </>
  );
}
