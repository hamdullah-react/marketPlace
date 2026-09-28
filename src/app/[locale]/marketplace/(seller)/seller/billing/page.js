import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle, Landmark, Megaphone, Receipt, RefreshCw, Wallet } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorCharges, getVendorChargeTotals } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { getVendorPlans, getOpenRenewal } from '@/marketplace/db/queries/access';
import { billingDetails, hasReceiptWithUs, accountKindLabel, formatIban } from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import RenewalPanel from '../../_components/RenewalPanel';
import BillingTable from '../../_components/BillingTable';
import { latestProofsByCharge } from '@/marketplace/db/queries/proofs';

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

  /* The latest receipt per charge, in ONE read rather than one per row: the
     statement has a Receipt column and every line needs it, not only the lines
     still owed. It used to ask for the `due` ones alone, which was right while
     the button was the only thing that read it and wrong now there is a column:
     a receipt refused on a charge an admin later cancelled would have shown as
     "—", losing the one explanation the row had.

     Keyed on the charge ids, so it runs after them, and it never throws — a
     database without the PAYMENT PROOFS section simply shows no receipt state
     and the rest of the page is unaffected. */
  const { byCharge: proofs } = await latestProofsByCharge(
    (list.items ?? []).map((c) => c.id)
  );

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);
  const terms = localized(details.terms, locale);

  /* Subscription before promotions, deliberately: it is the one that can close
     this dashboard, so it is the one a showroom should read first.
  /* ── One page, one table, and two things above it ─────────────────
     This was five tabs over three card grids, and the tabs were the problem
     rather than the fix: a showroom that came to renew had to read past a bill
     to find the button, one checking a promotion charge scrolled past the
     subscription panel, and the `all` tab's own empty state hid the renewal
     card from exactly the showroom that had no charges yet and had followed
     "Renew" to get here.

     So the order is now what somebody came for: where they stand, the button
     that changes it, the statement, and the bank details under it. The kind and
     state filters live on the table, where they cost no round trip.

     byKind comes from the same single read as the headline totals — see
     getVendorChargeTotals — so the two can never disagree. */
  const byKind = totals.byKind ?? { boost: {}, subscription: {}, other: {} };

  /* Every charge still owed with no receipt with us — or one that came back
     refused. Both renewals and promotions, because the rule is the same for
     each: the platform records money when it can SEE it has arrived, and a
     showroom that transferred yesterday and said nothing is waiting for
     something that is not going to happen. */
  const unsent = (list.items ?? []).filter(
    (c) => c.state === 'due' && !hasReceiptWithUs(proofs.get(c.id))
  );

  return (
    <>
      {/* ── The one thing they may not know ───────────────────────
          Above the figures, because it is the only thing on this page that is
          waiting on THEM. It renders nothing when there is nothing to send,
          which is most of the time — a permanent notice is one nobody reads. */}
      {unsent.length ? (
        <div className="px-4 lg:px-6">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <Receipt className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <strong className="font-semibold">
                {unsent.length === 1
                  ? t('مستحق واحد ينتظر إيصال التحويل. ', 'One charge is waiting for your transfer receipt. ')
                  : t(`${unsent.length} مستحقات تنتظر إيصال التحويل. `, `${unsent.length} charges are waiting for your transfer receipt. `)}
              </strong>
              {details.requireProof
                ? t(
                    'لا تصل هذه الطلبات إلى فريق المنصة قبل إرسال الإيصال. أرسله من قائمة الإجراءات في الجدول أدناه، وعند اعتماده تبدأ المدة أو يبدأ الترويج.',
                    'These requests do not reach the platform team until the receipt is sent. Send it from a row’s actions menu below — and when it is accepted, your days or your promotion begin.'
                  )
                : t(
                    'تُسجّل الدفعة بعد أن يرى الفريق الإيصال — وعندها تبدأ المدة أو يبدأ الترويج. أرسله من قائمة الإجراءات في الجدول أدناه.',
                    'The payment is recorded once somebody here has seen the receipt — and that is when your days or your promotion begin. Send it from a row’s actions menu in the statement below.'
                  )}
            </span>
          </div>
        </div>
      ) : null}

      {/* ── Where they stand ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
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

        {/* Only when something is late. A zero here would be a warning about
            nothing, on a screen about money. */}
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
            <RefreshCw className="h-3.5 w-3.5" />
            {t('الاشتراك', 'Subscription')}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-primary">
            {money(byKind.subscription?.outstanding ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {t(`${byKind.subscription?.count ?? 0} سجل`, `${byKind.subscription?.count ?? 0} record${(byKind.subscription?.count ?? 0) === 1 ? '' : 's'}`)}
          </p>
        </Card>

        <Card className="p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Megaphone className="h-3.5 w-3.5" />
            {t('الترويج', 'Promotions')}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-brand-primary">
            {money(byKind.boost?.outstanding ?? 0)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {t(`${byKind.boost?.count ?? 0} سجل`, `${byKind.boost?.count ?? 0} record${(byKind.boost?.count ?? 0) === 1 ? '' : 's'}`)}
          </p>
        </Card>
      </div>

      {/* ── Renewing ────────────────────────────────────────
          UNCONDITIONAL, and that is the fix. It used to sit behind a tab whose
          own empty state returned before reaching it, so a showroom with no
          charges yet — which is exactly the showroom in its last week, following
          "Renew" from the dashboard banner — arrived at "you owe nothing" with no
          way to renew. A showroom should be able to renew BEFORE it is locked
          out, and this is the only control on the page that does that. */}
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
            openRenewalProof={openRenewal ? (proofs.get(openRenewal.id) ?? null) : null}
            requireProof={details.requireProof}
            currency={site?.currency}
          />
        </Card>
      </div>

      {/* ── The statement ───────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <BillingTable
          locale={locale}
          vendorId={vendorId}
          items={list.items}
          /* Pairs, not a Map: a Map does not survive the boundary to a client
             component, and the table rebuilds it in one pass. */
          proofPairs={[...proofs.entries()]}
          currency={site?.currency}
        />
      </div>

      {/* ── Where to pay ──────────────────────────────────────
          No longer a tab of its own. It was one press away from the statement it
          belongs under — a bill with nowhere to send the money is a bill nobody
          can pay — and putting it here costs nothing, because a showroom that
          does not need it scrolls past it once. */}
      {details.filled ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
              <Landmark className="h-4 w-4" />
              {t('طريقة الدفع', 'How to pay')}
            </h2>

            {/* One card per way to pay — a bank, a wallet, cash at the office. */}
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

            {/* The reference is what lets the platform match a transfer to a row
                in the statement above. Without it a payment arrives from a name
                that may not match the showroom's, against nothing. */}
            <p className="mt-3 rounded-lg bg-brand-primary/5 p-2 text-xs text-muted-foreground">
              {t(
                'اكتب رقم المستحق (مثل CHG-2026-00001) في بيان التحويل حتى نتمكن من مطابقته.',
                'Put the charge reference (e.g. CHG-2026-00001) on the transfer so we can match it.'
              )}
            </p>
          </Card>
        </div>
      ) : (
        <div className="px-4 lg:px-6">
          <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {t(
              'لم تُنشر بيانات التحويل بعد. تواصل مع فريق المنصة لمعرفة طريقة الدفع.',
              'Payment details have not been published yet. Contact the platform team to arrange payment.'
            )}
          </p>
        </div>
      )}

      <p className="px-4 text-xs text-muted-foreground lg:px-6">
        {t(
          'تُسجّل الدفعات من قِبل فريق المنصة بعد استلامها. أرسل إيصال التحويل من قائمة الإجراءات لتسريع المراجعة.',
          'Payments are recorded by the platform team once received. Send the transfer receipt from a row\u2019s actions menu to speed that up.'
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
