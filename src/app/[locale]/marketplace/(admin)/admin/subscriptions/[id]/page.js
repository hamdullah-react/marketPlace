import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import {
  ArrowLeft, ArrowRight, CalendarClock, CalendarMinus, ExternalLink, Lock, Store,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireStaff } from '@/marketplace/auth/session';
import { getVendorAccessDetail, getVendorPlans } from '@/marketplace/db/queries/access';
import { getVendorCharges, getVendorChargeTotals } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { accessLabel, accessTone } from '@/marketplace/lib/access';
import { kindLabel, stateLabel, stateTone } from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import VendorAccessActions from '../../../_components/VendorAccessActions';

export const instant = false;

export const metadata = {
  title: 'Showroom subscription',
  robots: { index: false, follow: false },
};

/**
 * One showroom's subscription — what the table's row opens into.
 *
 * ── What a row cannot carry ─────────────────────────────────────────────────
 *
 * The table answers "who needs chasing" down forty rows. It cannot also answer
 * "what has this showroom actually paid us", because that is a ledger: every
 * subscription charge, what each one bought, and whether the current date is the
 * result of a payment or of an admin's correction. All of that is the context an
 * admin wants before pressing Block, and none of it fits in a cell.
 *
 * ── The reduction's reason is shown HERE too ────────────────────────────────
 *
 * The seller sees it on their own dashboard for a fortnight. The admin has to be
 * able to read it whenever — "who shortened this and why" is the question a
 * showroom rings about, and the answer should not require opening the audit log.
 */
export default async function AdminVendorSubscriptionPage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <Suspense fallback={<VendorSkeleton />}>
          <Body id={id} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ id, locale, t }) {
  await requireStaff();

  const [vendor, charges, totals, plans, site] = await Promise.all([
    getVendorAccessDetail(id),
    getVendorCharges(id, { limit: 100 }).catch(() => ({ items: [] })),
    getVendorChargeTotals(id).catch(() => null),
    getVendorPlans().catch(() => []),
    getSiteSettings().catch(() => null),
  ]);

  if (!vendor) notFound();

  const money = (n) => formatPrice(n, locale, site?.currency);
  const name = localized(vendor.name, locale) || vendor.slug;

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'Asia/Riyadh',
        })
      : '—';

  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;

  /* The subscription ledger only. A promotion charge is a different debt with a
     different consequence, and mixing the two is what made the seller's own
     billing page confusing enough to rebuild. */
  const subscriptions = (charges.items ?? []).filter((c) => c.kind === 'subscription');

  return (
    <>
      <div className="px-4 lg:px-6">
        <Link
          href={`/${locale}/marketplace/admin/subscriptions`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-primary"
        >
          <Back className="h-3.5 w-3.5" />
          {t('الاشتراكات', 'Subscriptions')}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-brand-primary">{name}</h1>

          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${accessTone(vendor.access.state)}`}>
            {accessLabel(vendor.access.state, locale)}
          </span>

          {vendor.access.daysLeft != null && vendor.access.allowed ? (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium tabular-nums ${
                vendor.access.state === 'ending'
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-muted-foreground'
              }`}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {t(`بقي ${vendor.access.daysLeft} يوم`, `${vendor.access.daysLeft} days left`)}
            </span>
          ) : null}
        </div>
      </div>

      {/* ── The actions, at the top ───────────────────────────────────────
          The BUTTON face, not the menu one: on a page about one showroom the
          actions are why somebody opened it. Same component and the same four
          dialogs as the table's menu — see VendorAccessActions. */}
      <div className="px-4 lg:px-6">
        <Card className="p-4">
          <VendorAccessActions
            locale={locale}
            vendorId={vendor.id}
            vendorName={name}
            blocked={vendor.access.state === 'blocked'}
            accessUntil={vendor.access.until}
            plans={plans.filter((p) => p.active !== false)}
          />
        </Card>
      </div>

      {/* ── Why they are switched off, if they are ────────────────────────── */}
      {vendor.access.state === 'blocked' && vendor.access.reason ? (
        <div className="px-4 lg:px-6">
          <Card className="border-red-200 p-4 dark:border-red-900/60">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-400">
              <Lock className="h-4 w-4" />
              {t('موقوف بقرار من الإدارة', 'Switched off by the platform')}
            </p>
            <p className="mt-1 text-sm">{vendor.access.reason}</p>
            {vendor.access_blocked_at ? (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {when(vendor.access_blocked_at)}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* ── Why the date moved back, if it did ────────────────────────────
          Cleared by an extension, so its presence means the reduction still
          stands. The seller is shown the same sentence for a fortnight; this has
          no window, because the question "who shortened this" outlives it. */}
      {vendor.access_reduced_reason ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <CalendarMinus className="h-4 w-4" />
              {Number(vendor.access_reduced_days) > 0
                ? t(
                    `تم تقليص المدة بـ ${Number(vendor.access_reduced_days)} يوم`,
                    `${Number(vendor.access_reduced_days)} days were taken off`
                  )
                : t('تم تقليص المدة', 'The period was shortened')}
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

      {/* ── Where they stand, and who they are ────────────────────────────── */}
      <div className="grid gap-3 px-4 lg:grid-cols-2 lg:px-6">
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <CalendarClock className="h-4 w-4" />
            {t('الوصول', 'Access')}
          </h2>

          <dl className="grid gap-2 text-sm">
            <Row label={t('ينتهي', 'Ends')} value={when(vendor.access_until)} />
            <Row label={t('الحالة', 'State')} value={accessLabel(vendor.access.state, locale)} />
            {/* Inferred from whether a subscription charge was ever PAID, not
                from the date — the same honest source listVendorAccess uses. */}
            <Row
              label={t('النوع', 'Type')}
              value={
                subscriptions.some((c) => c.state === 'paid')
                  ? t('مشترك', 'Paying')
                  : t('فترة مجانية', 'On trial')
              }
            />
            {totals ? (
              <>
                <Row label={t('إجمالي المدفوع', 'Paid to date')} value={money(totals.collected)} />
                <Row label={t('المستحق عليه', 'Outstanding')} value={money(totals.outstanding)} />
              </>
            ) : null}
            {vendor.approved_at ? (
              <Row label={t('تاريخ الاعتماد', 'Approved')} value={when(vendor.approved_at)} />
            ) : null}
          </dl>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <Store className="h-4 w-4" />
            {t('المعرض', 'Showroom')}
          </h2>

          <dl className="grid gap-2 text-sm">
            {vendor.city ? <Row label={t('المدينة', 'City')} value={vendor.city} /> : null}
            {vendor.contact_phone ? (
              <Row label={t('الجوال', 'Phone')} value={vendor.contact_phone} mono />
            ) : null}
            {vendor.contact_email ? (
              <Row label={t('البريد', 'Email')} value={vendor.contact_email} />
            ) : null}
          </dl>

          <Link
            href={`/${locale}/marketplace/vendors/${vendor.slug}`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            {t('صفحة المعرض', 'Storefront')}
          </Link>
        </Card>
      </div>

      {/* ── What they have been billed for the dashboard ──────────────────
          Newest first, because the current position is what an admin is checking
          against. Each row links to the charge, where the receipts are. */}
      <div className="px-4 lg:px-6">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-primary">
            {t('مستحقات الاشتراك', 'Subscription charges')}
            <span className="ms-2 text-xs font-normal text-muted-foreground tabular-nums">
              {subscriptions.length}
            </span>
          </h2>

          {subscriptions.length ? (
            <ul className="grid gap-2">
              {subscriptions.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b pb-2 text-sm last:border-0 last:pb-0 dark:border-white/10"
                >
                  <Link
                    href={`/${locale}/marketplace/admin/finance/${c.id}`}
                    className="font-mono text-xs text-muted-foreground hover:text-brand-primary"
                    dir="ltr"
                  >
                    {c.ref}
                  </Link>

                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateTone(c.state)}`}>
                    {stateLabel(c.state, locale)}
                  </span>

                  {c.access_days ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t(`${c.access_days} يوم`, `${c.access_days} days`)}
                    </span>
                  ) : null}

                  <span className="text-xs text-muted-foreground tabular-nums">
                    {when(c.state === 'paid' ? c.paid_at : c.issued_at)}
                  </span>

                  <span className="ms-auto font-semibold tabular-nums text-brand-primary">
                    {money(c.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                'لم يُصدر لهذا المعرض أي مستحق اشتراك بعد — ما زال في فترته المجانية.',
                'No subscription charge has been raised for this showroom yet — it is still on its free period.'
              )}
            </p>
          )}
        </Card>
      </div>

      {/* The promotions are a different business, and the link says so rather
          than this page quietly becoming a second Finance screen. */}
      {(charges.items ?? []).some((c) => c.kind === 'boost') ? (
        <p className="px-4 text-xs text-muted-foreground lg:px-6">
          <Link
            href={`/${locale}/marketplace/admin/finance?section=promotions`}
            className="font-medium text-brand-primary hover:underline"
          >
            {t('مستحقات الترويج لهذا المعرض', 'This showroom’s promotion charges')}
          </Link>
          {t(' — دفتر مختلف، لأن التأخّر فيه لا يغلق اللوحة.', ' — a different ledger, because falling behind on it does not close the dashboard.')}
        </p>
      ) : null}
    </>
  );
}

function Row({ label, value, mono = false }) {
  if (value == null || value === '') return null;

  return (
    <div className="flex flex-wrap gap-2 border-b pb-2 last:border-0 last:pb-0 dark:border-white/10">
      <dt className="min-w-28 text-xs text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 flex-1 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

function VendorSkeleton() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2 h-8 w-64" />
      </div>
      <div className="grid gap-3 px-4 lg:grid-cols-2 lg:px-6">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border p-4 dark:border-white/10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </>
  );
}
