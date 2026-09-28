import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { CalendarClock, CheckCircle2, Clock, Lock, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listVendorAccess, getVendorPlans, listOpenRenewals } from '@/marketplace/db/queries/access';
import { getSiteSettings, readSiteSettings } from '@/marketplace/db/queries/site';
import { openProofsByCharge } from '@/marketplace/db/queries/proofs';
import { billingDetails, isPresented } from '@/marketplace/lib/billing';
import { WARN_DAYS } from '@/marketplace/lib/access';
import { localized, formatPrice } from '@/marketplace/lib/listing';
import PaymentProofPolicySwitch from '../../_components/PaymentProofPolicySwitch';
import SubscriptionsTable from '../../_components/SubscriptionsTable';
import SubscriptionSettings from '../../_components/SubscriptionSettings';
import DeleteChargeButton from '../../_components/DeleteChargeButton';

export const instant = false;

export const metadata = {
  title: 'Subscriptions',
  robots: { index: false, follow: false },
};

/**
 * Who is still inside, who runs out when, and the two buttons that change it.
 *
 * ── Ordered by WHEN, not by name ────────────────────────────────────────────
 *
 * The screen's job is "who needs chasing", so the list is sorted by the date
 * their access ends, with the ones already switched off at the top. An
 * alphabetical list of showrooms would answer a question nobody opens this page
 * with.
 *
 * ── The state is computed, never stored ─────────────────────────────────────
 *
 * Nothing runs at midnight to mark anybody expired: `access_until` is compared
 * with now() at the moment this page renders (lib/access.js). So the list cannot
 * be stale, and a showroom that lapsed thirty seconds ago appears as expired
 * without a job having had to notice.
 */
export default async function AdminSubscriptionsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('الاشتراكات', 'Subscriptions')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'كل معرض وحتى متى يستمر وصوله إلى لوحة التحكم. الإيقاف والتمديد يصلان المعرض فوراً.',
              'Every showroom and how long its dashboard stays open. Blocking and extending reach the seller instantly.'
            )}
          </p>
        </div>

        <Suspense fallback={<SubscriptionsSkeleton />}>
          <Body searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ searchParams, locale, t }) {
  const sp = (await searchParams) ?? {};

  const [{ ready, items }, plans, renewals, site, settings] = await Promise.all([
    listVendorAccess(),
    getVendorPlans({ activeOnly: false }),
    listOpenRenewals().catch(() => []),
    getSiteSettings().catch(() => null),
    /* The RAW row, for one column. getSiteSettings() is the cached public
       shape and its `authoringLocale` answers 'ar' both when an admin chose
       Arabic and when nobody has ever saved the setting — which would put an
       Arabic box in front of an English admin on a database where the language
       was never configured. The row keeps those two apart, and every other
       bilingual admin screen reads it the same way. */
    readSiteSettings().catch(() => null),
  ]);

  if (!ready) {
    return (
      <div className="px-4 lg:px-6">
        <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-sm dark:border-amber-900 dark:bg-amber-950/20">
          <p className="font-semibold text-amber-800 dark:text-amber-300">
            {t('الاشتراكات غير مفعّلة بعد', 'Subscriptions are not set up yet')}
          </p>
          <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
            {t(
              'شغّل قسم VENDOR ACCESS من src/marketplace/db/schema.sql. سيمنح كل معرض قائم فترة مجانية محسوبة من تاريخ اعتماده.',
              'Run the VENDOR ACCESS section of src/marketplace/db/schema.sql. It gives every existing showroom a free period counted from its approval date.'
            )}
          </p>
        </div>
      </div>
    );
  }

  /* ── Which renewal requests have actually REACHED us ──────────────
     With the receipt rule on, a showroom pressing "Request renewal" raises a
     charge and nothing more: it is not an admin's to act on until the transfer
     is attached. So the panel below lists the PRESENTED ones, and the count
     beside its heading counts those — a queue that includes rows nobody here
     can move is a queue that stops being worked.

     The unpresented ones are not lost: they are in the Finance ledger under
     "Awaiting receipt", which is where somebody goes when a showroom rings to
     ask what happened to its request.

     One read, and it never throws — a database without the PAYMENT PROOFS
     section presents everything, which is exactly the behaviour before this
     setting existed. */
  const requireProof = billingDetails(site?.billing).requireProof;

  const { byCharge: renewalProofs } = requireProof
    ? await openProofsByCharge((renewals ?? []).map((r) => r.id)).catch(() => ({
        byCharge: new Map(),
      }))
    : { byCharge: new Map() };

  /* listOpenRenewals only ever returns UNPAID subscription charges, so `state`
     is 'due' by construction — named here anyway, because isPresented reads it
     and a row that arrived without one must not be silently presented. */
  const presentedRenewals = (renewals ?? []).filter((r) =>
    isPresented({ ...r, state: 'due' }, renewalProofs.has(r.id), requireProof)
  );

  const trialDays = Number(site?.trialDays ?? 30);

  /* ── The KPIs count the PLATFORM, never the search ──────────────
     They are computed from `items`, and the table below filters the same
     list without touching them. A headline that moves when you type is a
     headline that cannot be read — "3 approved showrooms" is not true of the
     platform, only of the box.

     The search itself moved into DataTable, which folds Arabic letter forms
     and Arabic-Indic digits the way lib/search.js did, and filters without a
     round trip per keystroke. */


  const counts = items.reduce(
    (acc, v) => {
      acc[v.access.state] = (acc[v.access.state] ?? 0) + 1;
      if (!v.access.allowed) acc.out += 1;
      return acc;
    },
    { out: 0 }
  );

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';

  const activePlans = plans.filter((p) => p.active !== false);

  return (
    <>
      {/* ── The position ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
        <Kpi icon={Store} label={t('معارض معتمدة', 'Approved showrooms')} value={items.length} />
        <Kpi
          icon={CheckCircle2}
          label={t('وصول مفتوح', 'Dashboard open')}
          value={items.length - counts.out}
        />
        <Kpi
          icon={CalendarClock}
          label={t(`ينتهي خلال ${WARN_DAYS} أيام`, `Ending within ${WARN_DAYS} days`)}
          value={counts.ending ?? 0}
          tone={(counts.ending ?? 0) > 0 ? 'text-amber-700 dark:text-amber-400' : null}
        />
        <Kpi
          icon={Lock}
          label={t('موقوف أو منتهٍ', 'Out')}
          value={counts.out}
          tone={counts.out > 0 ? 'text-red-700 dark:text-red-400' : null}
        />
      </div>

      {/* ── Waiting to be confirmed ──────────────────────────────────────
          The most time-critical list on the screen: every row is a showroom that
          believes it has paid and is sitting in front of a locked dashboard.
          Oldest first, and the fix is one press on Finance — recording the
          payment moves their date by itself. */}
      {presentedRenewals.length ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4 ring-1 ring-amber-300 dark:ring-amber-900/60">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              {t('طلبات تجديد بانتظار التأكيد', 'Renewals waiting to be confirmed')}
              <span className="tabular-nums">({presentedRenewals.length})</span>
            </h2>

            <ul className="mt-3 space-y-2">
              {presentedRenewals.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-0 last:pb-0 dark:border-white/10"
                >
                  <span className="font-mono text-xs text-muted-foreground" dir="ltr">
                    {row.ref}
                  </span>
                  <span className="font-medium text-brand-primary">
                    {row.vendors ? localized(row.vendors.name, locale) : t('معرض محذوف', 'Deleted showroom')}
                  </span>
                  {row.vendors?.contact_phone ? (
                    <a
                      href={`tel:${row.vendors.contact_phone}`}
                      dir="ltr"
                      className="text-xs text-muted-foreground hover:text-brand-primary"
                    >
                      {row.vendors.contact_phone}
                    </a>
                  ) : null}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t(`${row.access_days} يوم`, `${row.access_days} days`)}
                  </span>
                  <span className="ms-auto font-semibold tabular-nums text-brand-primary">
                    {formatPrice(row.amount, locale, site?.currency)}
                  </span>
                  <Link
                    href={`/${locale}/marketplace/admin/finance?section=subscriptions&state=due`}
                    className="text-xs font-medium text-brand-primary hover:underline"
                  >
                    {t('تسجيل الدفعة', 'Record payment')}
                  </Link>

                  {/* A request raised by mistake — the wrong plan, a duplicate,
                      a showroom that rang to say never mind — can go from here
                      rather than sending the admin to Finance to hunt for it.
                      Only an UNPAID one reaches this list at all, and the action
                      refuses a paid charge whatever this page believes. */}
                  <DeleteChargeButton locale={locale} chargeId={row.id} label={row.ref} />
                </li>
              ))}
            </ul>

            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                'تسجيل الدفعة في صفحة المالية يمدّد الاشتراك تلقائياً بعدد أيام الخطة ويرفع الإيقاف.',
                'Recording the payment on Finance extends the subscription by the plan’s days and lifts any block, automatically.'
              )}
            </p>
          </Card>
        </div>
      ) : null}

      {/* ── Settings ───────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <Card className="p-4">
          <h2 className="text-sm font-semibold text-brand-primary">
            {t('الفترة المجانية والأسعار', 'Free period and pricing')}
          </h2>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            {t(
              'كل معرض جديد يبدأ بفترة مجانية، ثم يحتاج تمديداً. لا شيء من هذا مكتوب في الكود.',
              'Every new showroom starts with a free period and then needs extending. None of it is fixed in code.'
            )}
          </p>

          {/* The admin's chosen writing language (Admin → Settings → Language).
              Falls back to the DASHBOARD language, not to Arabic, so an English
              admin on a database where the setting was never saved gets English
              boxes rather than being asked to write Arabic. */}
          {/* ── How a renewal reaches you ─────────────────────────
              The same switch as Finance → Payment methods, which is where it is
              filed by subject and is not where anybody looks for it: somebody
              deciding how renewals should work opens THIS page. One setting,
              one action, one stored value — shown in both places rather than
              hidden in the one that reads more tidily. */}
          <div className="mb-4">
            <PaymentProofPolicySwitch locale={locale} requireProof={requireProof} />
          </div>

          <SubscriptionSettings
            locale={locale}
            trialDays={trialDays}
            plans={plans}
            currency={site?.currency}
            mode={settings?.row?.default_locale ?? locale}
          />
        </Card>
      </div>

      {/* ── The showrooms ───────────────────────────────────
          A TABLE, not a grid of cards. The question this screen answers is "who
          needs chasing", which is one column read down forty rows — and in a
          three-across grid that column does not exist. See SubscriptionsTable.

          The search box, the filters, the counts, the pager and the empty states
          all moved inside it, which is why this is now one line: they were four
          separate pieces of markup here saying what DataTable says once.

          The ?q= filter that used to narrow this server-side is gone with them.
          It could not coexist with the table's own search without there being
          two boxes meaning the same thing, and the table's is the one that
          filters without a round trip per keystroke. */}
      <div className="px-4 lg:px-6">
        <SubscriptionsTable
          locale={locale}
          items={items}
          plans={activePlans}
          /* The showrooms that have asked to renew and are still waiting. The
             same list the panel above prints, handed to the table so the tab
             can count it — one read, two readers. */
          awaitingRenewal={presentedRenewals.map((r) => r.vendor_id).filter(Boolean)}
        />
      </div>
    </>
  );
}

function Kpi({ icon: Icon, label, value, tone = null }) {
  return (
    <Card className="p-4">
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone ?? 'text-brand-primary'}`}>{value}</p>
    </Card>
  );
}

function SubscriptionsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3 px-4 lg:grid-cols-4 lg:px-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl border p-4 dark:border-white/10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-2 h-6 w-12" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 px-4 sm:grid-cols-2 xl:grid-cols-3 lg:px-6">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-xl border p-4 dark:border-white/10">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-4 h-8 w-40" />
          </div>
        ))}
      </div>
    </>
  );
}
