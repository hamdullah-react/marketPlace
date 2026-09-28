import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle, BanknoteIcon, Landmark, Megaphone, RefreshCw, Store, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { getBillingOverview, listCharges } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { billingDetails, kindLabel } from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import ChargeRowActions from '../../_components/ChargeRowActions';
import PaymentAccountsManager from '../../_components/PaymentAccountsManager';
import ChargesTable from '../../_components/ChargesTable';
import PaymentProofQueue from '../../_components/PaymentProofQueue';
import { listPendingProofs, openProofsByCharge } from '@/marketplace/db/queries/proofs';

export const instant = false;

export const metadata = {
  title: 'Finance',
  robots: { index: false, follow: false },
};

/* The most charges one ledger will show. See the listCharges call for why this
   is a ceiling and not a page size. */
const LEDGER_MAX = 500;

/**
 * Finance — what showrooms owe the platform, and what has been paid.
 *
 * ── This is not the payout screen the schema imagined ───────────────────────
 *
 * § 9 of schema.sql models a cart marketplace: the platform collects from
 * buyers, keeps a commission and pays the rest out. Nothing here works that way
 * — a buyer rings the showroom and pays them directly, so the platform never
 * holds their money. `payouts` has therefore never held a row, and the two
 * pages built on it say so in their own words.
 *
 * The money that does move goes the other way: a showroom pays to feature a
 * car. This page is that ledger. See the VENDOR BILLING section of schema.sql
 * for why it is `vendor_charges` and deliberately not `invoices`.
 *
 * ── Overdue is shown as its own figure ──────────────────────────────────────
 *
 * "Outstanding" alone flatters the position: a charge raised this morning and
 * one ignored for six weeks are the same number in it. The overdue total is the
 * one an admin acts on, so it gets its own card and its own tab.
 */
export default async function AdminFinancePage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('المالية', 'Finance')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'مستحقات المعارض على المنصة — تمييز السيارات والاشتراكات، كل منهما على حدة.',
              'What showrooms owe the platform — promotions and subscriptions, each kept on its own.'
            )}
          </p>
        </div>

        {/* ONE boundary. The numbers, the list and the bank details are one
            answer to one question and must not arrive in three pieces. */}
        <Suspense fallback={<FinanceSkeleton />}>
          <Body searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ searchParams, locale, t }) {
  const sp = (await searchParams) ?? {};


  /* ── The primary split, and it is chosen BEFORE the state ───────────────
     Promotions and subscriptions are two different businesses sharing one
     table: one is advertising a showroom chose to buy, the other is the rent on
     their dashboard. An admin chasing unpaid rent and an admin reconciling ad
     revenue are doing unrelated jobs, and one merged list served neither.
     `boost` is the default because it is the larger ledger. Nothing defaults to
     the mixed view — that was the confusing part.
     Validated against the fixed keys rather than the SECTIONS array, because
     that array cannot be built until the data it describes has been read. */
  /* ── One page, four jobs, and they were all on screen at once ─────────
     Payment accounts, the headline position, the per-showroom list and the
     charge table were stacked down a single scroll, with two separate rows of
     filters inside them. Everything was reachable and nothing was findable.

     The SECTION is now the first and only top-level choice. The ledger follows
     from it rather than being a second dimension the reader has to combine
     with the first: Promotions IS kind=boost, there is no such thing as
     Promotions-and-Subscriptions-at-once except on Overview. */
  const SECTION_KEYS = ['overview', 'promotions', 'subscriptions', 'other', 'accounts'];
  const section = SECTION_KEYS.includes(sp.section) ? sp.section : 'overview';

  const kind =
    section === 'promotions' ? 'boost'
      : section === 'subscriptions' ? 'subscription'
        : section === 'other' ? 'other'
          : 'all';

  const isLedger = section === 'promotions' || section === 'subscriptions' || section === 'other';

  const [overview, list, site, proofs] = await Promise.all([
    getBillingOverview({ days: 30, kind }),
    /* The whole ledger, because the table filters, searches and pages in the
       browser now — a `?state=` round trip per tab press was a request to
       answer a question about rows already on the screen.

       LEDGER_MAX is the honest edge of that choice: past it the list is
       truncated and the filtering below would be over part of the data, which is
       the point at which this belongs back in PostgREST. It is far above what a
       platform's charges run to, and it is a ceiling rather than a page. */
    listCharges({ kind, limit: LEDGER_MAX }),
    getSiteSettings().catch(() => null),
    /* The receipts waiting for an answer. It never throws — a database
       without the PAYMENT PROOFS section shows no queue and the rest of
       Finance is unaffected. */
    listPendingProofs().catch(() => ({ ready: false, items: [] })),
  ]);

  /* The table has never been created on this database. Said plainly, with the
     section to run — an empty Finance screen looks like "nobody owes anything",
     which is the most misleading thing this page could say. */
  if (!overview.ready || !list.ready) {
    return (
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {t('المستحقات غير مفعّلة بعد', 'Billing is not set up yet')}
          </p>
          <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
            {t(
              'شغّل قسم VENDOR BILLING من src/marketplace/db/schema.sql على قاعدة البيانات. سيُنشئ مستحقاً لكل تمييز تمت الموافقة عليه سابقاً.',
              'Run the VENDOR BILLING section of src/marketplace/db/schema.sql on this database. It raises a charge for every boost that was already approved.'
            )}
          </p>
        </div>
      </div>
    );
  }

  const hasOther = Boolean(overview.split.other.dueCount || overview.split.other.paidCount);

  const SECTIONS = [
    { key: 'overview', label: t('نظرة عامة', 'Overview'), icon: Wallet },
    { key: 'promotions', label: kindLabel('boost', locale), icon: Megaphone },
    { key: 'subscriptions', label: kindLabel('subscription', locale), icon: RefreshCw },
    /* Only when it holds something. A permanently empty tab is noise, but a
       hidden one that quietly swallows hand-entered charges is worse — so it
       appears the moment one exists. */
    ...(hasOther ? [{ key: 'other', label: kindLabel('other', locale), icon: Wallet }] : []),
    { key: 'accounts', label: t('طرق الدفع', 'Payment methods'), icon: Landmark },
  ];

  /* Which of THIS ledger's charges have a receipt waiting for an answer. Keyed
     on the charge ids, so it runs after them, and it never throws — a database
     without the PAYMENT PROOFS section simply shows no waiting badge and the
     rest of Finance is unaffected.

     The queue above already lists every pending receipt platform-wide; this is
     the same fact attached to the rows, so an admin who filters to one ledger
     still sees which of its charges is the urgent one. */
  const { byCharge: openProofs } = await openProofsByCharge(
    (list.items ?? []).map((c) => c.id)
  ).catch(() => ({ byCharge: new Map() }));

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);

  /* Said out loud on the figures themselves: a screenshot of this page should
     never leave anybody guessing which of the two ledgers it is. */
  /* "both" was right when there were two ledgers and is wrong now there can be
     three. On Overview these figures are the whole platform. */
  const kindName = kind === 'all' ? t('الكل', 'everything') : kindLabel(kind, locale).toLowerCase();

  /* Only the SECTION now. The state filter and the page number used to ride
     along here; both moved into the table, where they cost no round trip — and
     with them went the bug this comment used to guard against, a stale
     `state=void` silently filtering the next ledger somebody opened.

     The section stays in the URL deliberately: promotions and subscriptions are
     different businesses, and a link somebody pastes to a colleague has to open
     the one they meant. */
  const href = (next) => {
    const sec = next.section ?? section;
    const query = sec && sec !== 'overview' ? `?section=${sec}` : '';
    return `/${locale}/marketplace/admin/finance${query}`;
  };

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  return (
    <>
      {/* ── First, because somebody is waiting on it ────────────────────
          A showroom that sent a receipt this morning may be locked out right
          now. Everything else on this page is a figure to read; this is the
          only part with a person at the other end of it, so it sits above the
          tabs rather than inside one of them — a queue nobody scrolls to is a
          queue that grows. Renders nothing when it is empty. */}
      {proofs.items.length ? (
        <div className="px-4 lg:px-6">
          <PaymentProofQueue
            locale={locale}
            items={proofs.items}
            accounts={details.accounts ?? []}
            currency={site?.currency}
          />
        </div>
      ) : null}

      {/* ── The tab bar ──────────────────────────────────────────────────
          The only top-level control on the page. Each tab carries the number
          that makes it worth opening, so choosing one is not a guess.
          --------------------------------------------------------------- */}
      <div className="px-4 lg:px-6">
        <nav className="flex flex-wrap gap-2">
          {SECTIONS.map((x) => {
            const on = x.key === section;

            const owed =
              x.key === 'overview'
                ? Object.values(overview.split).reduce((sum, f) => sum + f.outstanding, 0)
                : x.key === 'promotions' ? overview.split.boost.outstanding
                  : x.key === 'subscriptions' ? overview.split.subscription.outstanding
                    : x.key === 'other' ? overview.split.other.outstanding
                      : null;

            return (
              <Link
                key={x.key}
                href={href({ section: x.key })}
                aria-current={on ? 'page' : undefined}
                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors ${
                  on
                    ? 'border-brand-primary bg-brand-primary/10 font-semibold text-brand-primary'
                    : 'border-gray-200 text-muted-foreground hover:border-brand-primary dark:border-white/10'
                }`}
              >
                <x.icon className="h-4 w-4" />
                {x.label}

                {/* Accounts has no figure — it is a setting, not a ledger. */}
                {owed ? (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {money(owed)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Payment methods ──────────────────────────────────────────────
          Its own tab now. It used to sit at the top of the working screen, so
          the first thing between an admin and "who owes us money" was a bank
          form they set up once a year.
          --------------------------------------------------------------- */}
      {section === 'accounts' ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
              <Landmark className="h-4 w-4" />
              {t('طرق الدفع', 'How showrooms pay')}
            </h2>
            <p className="mt-1 mb-3 text-xs text-muted-foreground">
              {t(
                'أي بنك وأي دولة، أو نقداً. تظهر هذه الطرق لكل معرض في صفحة مستحقاته.',
                'Any bank, any country — or cash. Every showroom sees these on their billing page.'
              )}
            </p>

            <PaymentAccountsManager locale={locale} details={details} />
          </Card>
        </div>
      ) : null}

      {/* ── Overview: the whole position, one card per ledger ────────────
          These used to be the page's filter — a second row of tabs above a
          third row of tabs. They are a SUMMARY now: each one says what that
          ledger is owed and opens it.
          --------------------------------------------------------------- */}
      {section === 'overview' ? (
      <div className="px-4 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {SECTIONS.filter((x) => x.key !== 'overview' && x.key !== 'accounts').map((x) => {
            const ledger =
              x.key === 'promotions' ? 'boost' : x.key === 'subscriptions' ? 'subscription' : 'other';
            /* Summed over the whole split rather than over two named kinds, so
               a charge of a kind this screen does not have a tab for still
               shows up in the combined figure instead of vanishing. */
            const figures = overview.split[ledger];

            return (
              <Link
                key={x.key}
                href={href({ section: x.key })}
                className="raised-card rounded-xl p-4 transition-colors hover:ring-2 hover:ring-brand-primary"
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
                  <x.icon className="h-4 w-4" />
                  {x.label}
                </p>
                <p className="mt-2 text-lg font-bold tabular-nums text-brand-primary">
                  {money(figures.outstanding)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {figures.overdue > 0
                    ? t(`منها ${money(figures.overdue)} متأخرة`, `${money(figures.overdue)} of it overdue`)
                    : t('لا متأخرات', 'nothing overdue')}
                </p>
              </Link>
            );
          })}
        </div>
      </div>
      ) : null}

      {/* ── The position ────────────────────────────────────────────────
          On Overview it is the whole platform; inside a ledger it is that
          ledger alone, which is what `kindName` says on the labels. Not shown
          on Payment methods, where a revenue figure is beside the point.
          --------------------------------------------------------------- */}
      {section !== 'accounts' ? (
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
        <Kpi
          icon={Wallet}
          label={t(`مستحق — ${kindName}`, `Outstanding — ${kindName}`)}
          value={money(overview.totals.outstanding)}
          note={t(`${overview.totals.dueCount} مستحق`, `${overview.totals.dueCount} charge${overview.totals.dueCount === 1 ? '' : 's'}`)}
        />
        <Kpi
          icon={AlertTriangle}
          label={t('متأخر', 'Overdue')}
          value={money(overview.totals.overdue)}
          note={t(`${overview.totals.overdueCount} متأخر`, `${overview.totals.overdueCount} past its due date`)}
          tone={overview.totals.overdue > 0 ? 'text-amber-700 dark:text-amber-400' : null}
        />
        <Kpi
          icon={BanknoteIcon}
          label={t('تم تحصيله (٣٠ يوماً)', 'Collected (30 days)')}
          value={money(overview.collectedInPeriod)}
          note={t('حسب تاريخ الدفع', 'by payment date')}
        />
        <Kpi
          icon={Landmark}
          label={t('إجمالي التحصيل', 'Collected, all time')}
          value={money(overview.totals.collected)}
          note={t(`${overview.totals.paidCount} دفعة`, `${overview.totals.paidCount} payment${overview.totals.paidCount === 1 ? '' : 's'}`)}
        />
      </div>

      ) : null}

      {/* ── Per showroom ────────────────────────────────────────────────
          Who owes what. Not on Payment methods, for the same reason. */}
      {section !== 'accounts' && overview.byVendor.length ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-brand-primary">
              {kind === 'all'
                ? t('حسب المعرض', 'By showroom')
                : t(`حسب المعرض — ${kindLabel(kind, locale)}`, `By showroom — ${kindLabel(kind, locale)}`)}
            </h2>
            <div className="mt-3 space-y-2">
              {overview.byVendor.map((row) => (
                <div
                  key={row.vendorId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-0 last:pb-0 dark:border-white/10"
                >
                  <Store className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {row.vendor ? (
                    <Link
                      href={`/${locale}/marketplace/vendors/${row.vendor.slug}`}
                      className="font-medium text-brand-primary hover:underline"
                    >
                      {localized(row.vendor.name, locale)}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground">{t('معرض محذوف', 'Deleted showroom')}</span>
                  )}

                  {row.vendor?.contact_phone ? (
                    <a
                      href={`tel:${row.vendor.contact_phone}`}
                      dir="ltr"
                      className="text-xs text-muted-foreground hover:text-brand-primary"
                    >
                      {row.vendor.contact_phone}
                    </a>
                  ) : null}

                  <span className="ms-auto flex items-center gap-4 text-xs tabular-nums">
                    {row.overdue > 0 ? (
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {t('متأخر ', 'overdue ')}
                        {money(row.overdue)}
                      </span>
                    ) : null}
                    <span className={row.outstanding > 0 ? 'font-semibold text-brand-primary' : 'text-muted-foreground'}>
                      {t('مستحق ', 'due ')}
                      {money(row.outstanding)}
                    </span>
                    <span className="text-muted-foreground">
                      {t('مدفوع ', 'paid ')}
                      {money(row.collected)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {/* ── The charges, for this ledger only ────────────────────────────
          Only inside a ledger. On Overview a table of every charge of every
          kind is the mixed-up list this whole split exists to undo, and on
          Payment methods it is simply unrelated. */}
      {/* ── The charges, for this ledger only ───────────────────────
          Only inside a ledger. On Overview a table of every charge of every kind
          is the mixed-up list the section split exists to undo, and on Payment
          methods it is simply unrelated.

          A TABLE now, not a grid of cards — see ChargesTable for why. The state
          tabs, the count per tab, the search, the pager and both empty states
          went inside it with everything else, which is why four blocks of markup
          here became one line. */}
      {isLedger ? (
        <div className="px-4 lg:px-6">
          <h2 className="mb-2 text-sm font-semibold text-brand-primary">
            {kind === 'all'
              ? t('كل المستحقات', 'All charges')
              : t(`مستحقات ${kindLabel(kind, locale)}`, `${kindLabel(kind, locale)} charges`)}
          </h2>

          <ChargesTable
            locale={locale}
            items={list.items}
            accounts={details.accounts ?? []}
            currency={site?.currency}
            awaitingReview={[...openProofs.keys()]}
            requireProof={details.requireProof}
          />
        </div>
      ) : null}

      {/* Overview's way into the work, so the summary is not a dead end. */}
      {section === 'overview' ? (
        <p className="px-4 text-xs text-muted-foreground lg:px-6">
          {t(
            'اختر دفتراً من الأعلى لعرض المستحقات وتسجيل الدفعات.',
            'Pick a ledger above to see its charges and record payments.'
          )}
        </p>
      ) : null}
    </>
  );
}

function Kpi({ icon: Icon, label, value, note, tone = null }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? 'text-brand-primary'}`}>{value}</p>
      {note ? <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{note}</p> : null}
    </Card>
  );
}

function FinanceSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
        {Array.from({ length: 4 }, (_, i) => (
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
            <Skeleton className="mt-1.5 h-3 w-1/2" />
          </div>
        ))}
      </div>
    </>
  );
}
