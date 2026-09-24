import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { AlertTriangle, BanknoteIcon, Clock, Landmark, Megaphone, RefreshCw, Store, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';
import { getBillingOverview, listCharges } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { billingDetails, stateLabel, stateTone, methodLabel, isOverdue, overdueLabel, kindLabel } from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import ChargeRowActions from '../../_components/ChargeRowActions';
import PaymentAccountsManager from '../../_components/PaymentAccountsManager';

export const instant = false;

export const metadata = {
  title: 'Finance',
  robots: { index: false, follow: false },
};

const PER_PAGE = 50;

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

  const TABS = [
    { key: 'due', label: t('مستحقة', 'Due') },
    { key: 'overdue', label: t('متأخرة', 'Overdue') },
    { key: 'paid', label: t('مدفوعة', 'Paid') },
    { key: 'void', label: t('ملغاة', 'Cancelled') },
    { key: 'all', label: t('الكل', 'All') },
  ];


  /* ── The primary split, and it is chosen BEFORE the state ───────────────
     Promotions and subscriptions are two different businesses sharing one
     table: one is advertising a showroom chose to buy, the other is the rent on
     their dashboard. An admin chasing unpaid rent and an admin reconciling ad
     revenue are doing unrelated jobs, and one merged list served neither.
     `boost` is the default because it is the larger ledger. Nothing defaults to
     the mixed view — that was the confusing part.
     Validated against the fixed keys rather than the KINDS array, because that
     array cannot be built until the data it describes has been read. */
  const KIND_KEYS = ['boost', 'subscription', 'other', 'all'];
  const kind = KIND_KEYS.includes(sp.kind) ? sp.kind : 'boost';
  const state = TABS.some((x) => x.key === sp.state) ? sp.state : 'due';
  const page = Math.max(1, Number(sp.page) || 1);

  const [overview, list, site] = await Promise.all([
    getBillingOverview({ days: 30, kind }),
    listCharges({ state, kind, limit: PER_PAGE, offset: (page - 1) * PER_PAGE }),
    getSiteSettings().catch(() => null),
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

  const KINDS = [
    { key: 'boost', label: kindLabel('boost', locale), icon: Megaphone },
    { key: 'subscription', label: kindLabel('subscription', locale), icon: RefreshCw },
    /* Only when it holds something. A permanently empty tab is noise, but a
       hidden one that quietly swallows hand-entered charges is worse — so it
       appears the moment one exists. */
    ...(overview.split.other.dueCount || overview.split.other.paidCount
      ? [{ key: 'other', label: kindLabel('other', locale), icon: Wallet }]
      : []),
    { key: 'all', label: t('الكل معاً', 'Everything together'), icon: Wallet },
  ];

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);

  /* Said out loud on the figures themselves: a screenshot of this page should
     never leave anybody guessing which of the two ledgers it is. */
  const kindName = kind === 'all' ? t('الكل', 'both') : kindLabel(kind, locale).toLowerCase();

  /* Every link carries BOTH dimensions. A state tab that dropped the kind would
     quietly throw the admin back into the merged list they were trying to get
     out of, and changing the kind resets the page because row 3 of promotions
     has nothing to do with row 3 of subscriptions. */
  const href = (next) => {
    const q = new URLSearchParams();
    const k = next.kind ?? kind;
    const st = next.state ?? state;
    if (k && k !== 'boost') q.set('kind', k);
    if (st && st !== 'due') q.set('state', st);
    if (next.page && next.page > 1) q.set('page', String(next.page));
    const query = q.toString();
    return `/${locale}/marketplace/admin/finance${query ? `?${query}` : ''}`;
  };

  const pages = Math.ceil(list.total / PER_PAGE);
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
      {/* ── Where the money is sent ──────────────────────────────────────
          At the TOP, behind a button rather than as a form at the bottom: it is
          set up once and then read by every showroom, and nine bank fields open
          on a working screen are nine fields in the way of the work.
          --------------------------------------------------------------- */}
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

      {/* ── Which ledger ─────────────────────────────────────────────────
          The first choice on the screen, because every figure below it means a
          different thing depending on the answer. Each tab carries its own
          outstanding total, so the one NOT being looked at cannot go unnoticed.
          --------------------------------------------------------------- */}
      <div className="px-4 lg:px-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {KINDS.map((x) => {
            const on = x.key === kind;
            /* Summed over the whole split rather than over two named kinds, so
               a charge of a kind this screen does not have a tab for still
               shows up in the combined figure instead of vanishing. */
            const figures =
              x.key === 'all'
                ? Object.values(overview.split).reduce(
                    (sum, f) => ({
                      outstanding: sum.outstanding + f.outstanding,
                      overdue: sum.overdue + f.overdue,
                    }),
                    { outstanding: 0, overdue: 0 }
                  )
                : overview.split[x.key];

            return (
              <Link
                key={x.key}
                href={href({ kind: x.key, state, page: 1 })}
                aria-current={on ? 'page' : undefined}
                className={`raised-card rounded-xl p-4 transition-colors ${
                  on ? 'ring-2 ring-brand-primary' : ''
                }`}
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

      {/* ── The position, for the ledger being looked at ────────────────── */}
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

      {/* ── Per showroom ──────────────────────────────────────────────── */}
      {overview.byVendor.length ? (
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

      {/* ── The charges, for this ledger only ──────────────────────────── */}
      <div className="px-4 lg:px-6">
        <h2 className="mb-2 text-sm font-semibold text-brand-primary">
          {kind === 'all'
            ? t('كل المستحقات', 'All charges')
            : t(`مستحقات ${kindLabel(kind, locale)}`, `${kindLabel(kind, locale)} charges`)}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((x) => (
            <Link
              key={x.key}
              href={href({ state: x.key })}
              aria-current={x.key === state ? 'page' : undefined}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                x.key === state
                  ? 'border-brand-primary bg-brand-primary/10 text-brand-primary'
                  : 'border-gray-200 text-muted-foreground hover:border-brand-primary dark:border-white/10'
              }`}
            >
              {x.label}
            </Link>
          ))}
          <span className="ms-auto text-xs text-muted-foreground tabular-nums">
            {list.total} {t('سجل', list.total === 1 ? 'record' : 'records')}
          </span>
        </div>

        {/* A GRID, not a column. Every charge is the same handful of facts, so
            they read as a set of comparable cards — and on a wide screen a
            single column of twenty wastes two-thirds of the width and turns
            "who owes us" into a scroll instead of a glance.

            The comment sits OUTSIDE the ternary below, because a branch holds
            ONE expression and a comment beside the div is two children in a
            place that allows one — a parse error, not a style nit. */}
        {list.items.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {list.items.map((charge) => {
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

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {charge.vendors ? (
                      <Link
                        href={`/${locale}/marketplace/vendors/${charge.vendors.slug}`}
                        className="flex items-center gap-1.5 font-medium text-brand-primary hover:underline"
                      >
                        <Store className="h-3.5 w-3.5" />
                        {localized(charge.vendors.name, locale)}
                      </Link>
                    ) : null}

                    <span>{localized(charge.description, locale)}</span>

                    {/* The consequence of pressing Record payment on THIS row.
                        An admin about to confirm money should know it also
                        reopens a dashboard. */}
                    {charge.kind === 'subscription' && charge.access_days ? (
                      <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] font-medium text-brand-primary tabular-nums">
                        {t(
                          `الدفع يمنح ${charge.access_days} يوم وصول`,
                          `paying grants ${charge.access_days} days of access`
                        )}
                      </span>
                    ) : null}

                    {charge.listings ? (
                      <Link
                        href={`/${locale}/marketplace/listing/${charge.listings.slug}`}
                        className="hover:text-brand-primary"
                      >
                        {localized(charge.listings.name, locale)}
                      </Link>
                    ) : null}
                  </div>

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
                        {charge.payment_ref ? (
                          <span dir="ltr" className="font-mono">
                            {charge.payment_ref}
                          </span>
                        ) : null}
                      </>
                    ) : null}
                  </div>

                  {charge.state === 'void' && charge.void_reason ? (
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-muted-foreground dark:bg-white/5">
                      {t('سبب الإلغاء: ', 'Cancelled because: ')}
                      {charge.void_reason}
                    </p>
                  ) : null}

                  {charge.state === 'paid' && charge.paid_into ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('وصل إلى: ', 'Received into: ')}
                      <span className="font-medium text-brand-primary">{charge.paid_into}</span>
                    </p>
                  ) : null}

                  {charge.note ? (
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs text-muted-foreground dark:bg-white/5">
                      {charge.note}
                    </p>
                  ) : null}

                  <div className="mt-auto border-t pt-3 dark:border-white/10">
                    <ChargeRowActions
                      locale={locale}
                      charge={charge}
                      accounts={details.accounts}
                      vendorName={charge.vendors ? localized(charge.vendors.name, locale) : ''}
                      carName={charge.listings ? localized(charge.listings.name, locale) : ''}
                      descriptionLabel={localized(charge.description, locale)}
                      amountLabel={money(charge.amount)}
                      dueLabel={charge.due_at ? when(charge.due_at) : ''}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
            <Wallet className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-600" />
            <p className="mt-3 font-semibold text-brand-primary">
              {state === 'due'
                ? t('لا مستحقات قائمة', 'Nothing outstanding')
                : state === 'overdue'
                  ? t('لا مستحقات متأخرة', 'Nothing overdue')
                  : t('لا شيء في هذه القائمة', 'Nothing in this list')}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {t(
                'يُنشأ مستحق تلقائياً عند الموافقة على طلب تمييز.',
                'A charge is raised automatically when a boost request is approved.'
              )}
            </p>
          </div>
        )}

        {pages > 1 ? (
          <nav className="mt-6 flex items-center justify-center gap-2">
            {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={href({ state, page: n })}
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
      </div>

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
