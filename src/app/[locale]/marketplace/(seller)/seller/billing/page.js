import { Suspense } from 'react';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle, Clock, FileText, Landmark, Megaphone, RefreshCw, Wallet } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorCharges, getVendorChargeTotals } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { getVendorPlans, getOpenRenewal } from '@/marketplace/db/queries/access';
import {
  billingDetails, stateLabel, stateTone, methodLabel, isOverdue, overdueLabel,
  accountKindLabel, formatIban, kindLabel,
} from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import RenewalPanel from '../../_components/RenewalPanel';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Billing',
  robots: { index: false, follow: false },
};

/**
 * What this showroom owes the platform, and what it has already paid.
 *
 * ── This replaces "Payouts", which pointed the wrong way ────────────────────
 *
 * The old page showed what the PLATFORM owed the SHOWROOM, from orders it had
 * collected on their behalf. It was built, correct, and could never show a row:
 * this marketplace does not take the buyer's money. The buyer rings the showroom
 * and pays them there, so nothing is ever held and nothing is ever paid out.
 *
 * The real money goes the other way — a showroom pays to feature a car — and
 * until now a seller had no screen telling them what they owed for a boost they
 * had been granted. This is that screen. /seller/payouts redirects here.
 *
 * ── Read-only, and it says why ──────────────────────────────────────────────
 *
 * There is no "mark as paid" here, deliberately. A showroom confirming its own
 * payment is a showroom marking its own homework — the platform records money
 * when it can see it has arrived. What the seller gets instead is the bank
 * details, the reference to quote, and a total they can check.
 */
export default async function SellerBillingPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('المستحقات', 'Billing')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'ما على معرضك مقابل تمييز السيارات، وما تم تسجيله مدفوعاً.',
              'What your showroom owes for featuring cars, and what has been recorded as paid.'
            )}
          </p>
        </div>

        {/* ONE boundary — the total and the rows it is made of. */}
        <Suspense fallback={<BillingSkeleton />}>
          <Body searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  const [totals, list, site, plans, openRenewal] = await Promise.all([
    getVendorChargeTotals(vendorId),
    getVendorCharges(vendorId),
    getSiteSettings().catch(() => null),
    getVendorPlans().catch(() => []),
    getOpenRenewal(vendorId).catch(() => null),
  ]);

  /* The section has not been run on this database. A showroom is told nothing
     rather than a confident zero — "you owe nothing" is the one wrong answer
     this page must never give by accident. */
  if (!totals.ready || !list.ready) {
    return (
      <div className="px-4 lg:px-6">
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          {t(
            'المستحقات غير متاحة حالياً. تواصل مع فريق المنصة.',
            'Billing is not available right now. Please contact the platform team.'
          )}
        </p>
      </div>
    );
  }

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);
  const terms = localized(details.terms, locale);

  /* Subscription before promotions, deliberately: it is the one that can close
     this dashboard, so it is the one a showroom should read first.
     byKind comes from the same single read as the headline totals — see
     getVendorChargeTotals — so the two can never disagree with each other. */
  const byKind = totals.byKind ?? { boost: {}, subscription: {}, other: {} };
  const SECTIONS = [
    {
      key: 'subscription',
      label: kindLabel('subscription', locale),
      icon: RefreshCw,
      figures: { outstanding: 0, overdue: 0, ...byKind.subscription },
    },
    {
      key: 'boost',
      label: kindLabel('boost', locale),
      icon: Megaphone,
      figures: { outstanding: 0, overdue: 0, ...byKind.boost },
    },
    /* Renders only when it has rows (see the guard in the map). Without it, a
       charge an admin entered by hand would be counted in the headline total
       while appearing in none of the sections — a statement whose rows do not
       add up to its own figure. */
    {
      key: 'other',
      label: kindLabel('other', locale),
      icon: Wallet,
      figures: { outstanding: 0, overdue: 0, ...byKind.other },
    },
  ];

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  if (!list.items.length) {
    return (
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <Wallet className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-600" />
          <p className="mt-3 font-semibold text-brand-primary">
            {t('لا مستحقات عليك', 'You owe nothing')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {t(
              'يظهر هنا مستحق عند الموافقة على طلب تمييز لإحدى سياراتك، أو عند طلب تجديد الاشتراك. ويُعرض كل نوع على حدة.',
              'A charge appears here when a request to feature one of your cars is approved, or when you ask to renew your subscription. Each kind is listed on its own.'
            )}
          </p>
          <Link
            href={`/${locale}/marketplace/seller/promotions`}
            className="mt-3 inline-block text-sm font-medium text-brand-primary hover:underline"
          >
            {t('الترويج والتمييز', 'Promotions')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-3 lg:px-6">
        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            {t('المستحق عليك', 'You owe')}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-primary">
            {money(totals.outstanding)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {t(`${totals.dueCount} مستحق`, `${totals.dueCount} charge${totals.dueCount === 1 ? '' : 's'}`)}
          </p>
        </Card>

        {/* Only when there is something late. A zero here would be a warning
            about nothing, on a screen about money. */}
        {totals.overdue > 0 ? (
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('متأخر', 'Overdue')}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
              {money(totals.overdue)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
              {t(`${totals.overdueCount} متأخر`, `${totals.overdueCount} past its due date`)}
            </p>
          </Card>
        ) : null}

        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Landmark className="h-3.5 w-3.5" />
            {t('إجمالي المدفوع', 'Paid to date')}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-primary">{money(totals.collected)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {t(`${totals.paidCount} دفعة`, `${totals.paidCount} payment${totals.paidCount === 1 ? '' : 's'}`)}
          </p>
        </Card>
      </div>

      {/* ── Renewing ──────────────────────────────────────────────────────
          Here as well as on the blocked screen, and that is the point: a
          showroom should be able to renew BEFORE it is locked out. The banner in
          the dashboard's last week links straight here.
          --------------------------------------------------------------- */}
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
            currency={site?.currency}
          />
        </Card>
      </div>

      {/* ── Where to pay ──────────────────────────────────────────────────
          Above the list when anything is owed: a statement with no payment
          details is a bill with nowhere to send the money.
          --------------------------------------------------------------- */}
      {totals.outstanding > 0 ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
              <Landmark className="h-4 w-4" />
              {t('طريقة الدفع', 'How to pay')}
            </h2>

            {details.filled ? (
              <>
                {/* One card per way to pay — a bank, a wallet, cash at the
                    office. Whichever suits them. */}
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
                        {account.swift ? (
                          <div className="flex gap-2">
                            <dt className="text-muted-foreground">SWIFT</dt>
                            <dd className="truncate font-mono" dir="ltr">
                              {account.swift}
                            </dd>
                          </div>
                        ) : null}
                        {account.notes ? (
                          <p className="pt-1 text-muted-foreground">{account.notes}</p>
                        ) : null}
                      </dl>
                    </div>
                  ))}
                </div>

                {terms ? <p className="mt-3 text-xs text-muted-foreground">{terms}</p> : null}

                {/* The reference is what lets the platform match a transfer to a
                    row on this page. Without it a payment arrives from a name
                    that may not match the showroom's, against nothing. */}
                <p className="mt-3 rounded-lg bg-brand-primary/5 p-2 text-xs text-muted-foreground">
                  {t(
                    'اكتب رقم المستحق (مثل CHG-2026-00001) في بيان التحويل حتى نتمكن من مطابقته.',
                    'Put the charge reference (e.g. CHG-2026-00001) on the transfer so we can match it.'
                  )}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  'لم تُنشر بيانات التحويل بعد. تواصل مع فريق المنصة لمعرفة طريقة الدفع.',
                  'Payment details have not been published yet. Contact the platform team to arrange payment.'
                )}
              </p>
            )}
          </Card>
        </div>
      ) : null}

      {/* ── The statement, in two ───────────────────────────────────────
          Subscription first, then promotions, and never interleaved. They are
          different debts with different consequences: falling behind on the
          subscription closes this dashboard, while an unpaid promotion does
          not. A single date-ordered list put those side by side as though they
          were the same thing, which is what made this page confusing.

          Each section carries its own outstanding figure, so a showroom can see
          what it owes for WHAT rather than one merged number it has to take
          apart itself.

          A GRID inside each: every charge is the same handful of facts, so they
          read as a comparable set instead of a column that wastes the width.
          --------------------------------------------------------------- */}
      {SECTIONS.map((group) => {
        const rows = list.items.filter((charge) => charge.kind === group.key);
        if (!rows.length) return null;

        const owed = group.figures.outstanding;

        return (
          <div key={group.key} className="px-4 lg:px-6">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
                <group.icon className="h-4 w-4" />
                {group.label}
              </h2>

              {owed > 0 ? (
                <span className="text-xs text-muted-foreground">
                  {t('مستحق عليك ', 'you owe ')}
                  <span className="font-semibold tabular-nums text-brand-primary">{money(owed)}</span>
                  {group.figures.overdue > 0
                    ? t(` — منها ${money(group.figures.overdue)} متأخرة`, ` — ${money(group.figures.overdue)} of it overdue`)
                    : null}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {t('لا مستحقات', 'nothing outstanding')}
                </span>
              )}

              <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                {rows.length} {t('سجل', rows.length === 1 ? 'record' : 'records')}
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((charge) => {
                const late = isOverdue(charge);

                return (
                  <Card
                    key={charge.id}
                    className={`flex flex-col p-4 ${late ? 'ring-1 ring-amber-300 dark:ring-amber-900/60' : ''}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                        {charge.ref}
                      </span>

                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateTone(charge.state)}`}>
                        {stateLabel(charge.state, locale)}
                      </span>

                      {late ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          {overdueLabel(charge, locale)}
                        </span>
                      ) : null}

                      <span className="ms-auto text-base font-bold tabular-nums text-brand-primary">
                        {money(charge.amount)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-gray-800 dark:text-gray-200">
                      {localized(charge.description, locale)}
                      {charge.listings ? (
                        <Link
                          href={`/${locale}/marketplace/listing/${charge.listings.slug}`}
                          className="ms-2 text-xs text-muted-foreground hover:text-brand-primary"
                        >
                          {localized(charge.listings.name, locale)}
                        </Link>
                      ) : null}
                    </p>

                    <div className="mt-2 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                      <span>
                        {t('صدر: ', 'Issued: ')}
                        {when(charge.issued_at)}
                      </span>
                      {charge.state === 'due' && charge.due_at ? (
                        <span>
                          {t('الاستحقاق: ', 'Due: ')}
                          {when(charge.due_at)}
                        </span>
                      ) : null}
                      {charge.state === 'paid' ? (
                        <>
                          <span>
                            {t('دُفع: ', 'Paid: ')}
                            {when(charge.paid_at)}
                          </span>
                          <span>{methodLabel(charge.payment_method, locale)}</span>
                          {charge.paid_into ? <span>{charge.paid_into}</span> : null}
                          {charge.payment_ref ? (
                            <span className="font-mono" dir="ltr">
                              {charge.payment_ref}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </div>

                    {/* The document, for every charge — a receipt once it is paid, a
                        statement of what is owed before that. Both are things a
                        showroom's accounts department asks for by email. */}
                    <div className="mt-auto border-t pt-3 dark:border-white/10">
                      <Link
                        href={`/${locale}/marketplace/seller/billing/${charge.id}`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {charge.state === 'paid'
                          ? t('سند الاستلام — عرض وطباعة', 'Receipt — view and print')
                          : t('بيان المستحق — عرض وطباعة', 'Statement — view and print')}
                      </Link>
                    </div>

                    {/* A cancelled charge is SHOWN, with the reason. A bill that
                        simply vanishes leaves the showroom arguing with a screen that
                        says nothing ever happened. */}
                    {charge.state === 'void' && charge.void_reason ? (
                      <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-muted-foreground dark:bg-white/5">
                        {t('أُلغي لأن: ', 'Cancelled because: ')}
                        {charge.void_reason}
                      </p>
                    ) : null}
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      <p className="px-4 text-xs text-muted-foreground lg:px-6">
        {t(
          'تُسجَّل الدفعات من قِبل فريق المنصة بعد استلامها. إن حوّلت مبلغاً ولم يظهر هنا، تواصل معنا.',
          'Payments are recorded by the platform team once received. If you have transferred and it is not shown here, get in touch.'
        )}
      </p>
    </>
  );
}

function BillingSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-3 lg:px-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-xl border p-4 dark:border-white/10">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-6 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3 px-4 lg:px-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-xl border p-4 dark:border-white/10">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-3 w-full" />
          </div>
        ))}
      </div>
    </>
  );
}
