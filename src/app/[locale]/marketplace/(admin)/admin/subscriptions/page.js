import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { CalendarClock, CheckCircle2, Clock, Lock, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listVendorAccess, getVendorPlans, listOpenRenewals } from '@/marketplace/db/queries/access';
import { getSiteSettings, readSiteSettings } from '@/marketplace/db/queries/site';
import { accessLabel, accessTone, WARN_DAYS } from '@/marketplace/lib/access';
import { localized, formatPrice } from '@/marketplace/lib/listing';
import { matches } from '@/marketplace/lib/search';
import SearchBox from '../../../_components/SearchBox';
import VendorAccessActions from '../../_components/VendorAccessActions';
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
  const term = typeof sp.q === 'string' ? sp.q.slice(0, 80) : '';

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

  const trialDays = Number(site?.trialDays ?? 30);

  /* ── Searched here, over the whole list ────────────────────────────────
     listVendorAccess() reads every approved showroom — one platform's worth,
     not a paged table — so the term is applied in memory and the match can be
     the good one: both languages of the name, the slug, the city and the phone,
     with Arabic letter forms and Arabic-Indic digits folded (lib/search.js).
     Doing it in PostgREST would mean an `ilike` per field and no folding, so
     "الاحمدي" would not find "الأحمدي".

     `filtered` is what the grid renders. The KPIs above it deliberately keep
     counting `items`: a headline that moves when you search is a headline that
     cannot be read — "3 approved showrooms" is not true of the platform, only
     of the box. */
  const filtered = term
    ? items.filter((v) =>
        matches(term, [v.name, v.slug, v.city, v.contact_phone, v.contact_email])
      )
    : items;

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
      {renewals.length ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4 ring-1 ring-amber-300 dark:ring-amber-900/60">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <Clock className="h-4 w-4" />
              {t('طلبات تجديد بانتظار التأكيد', 'Renewals waiting to be confirmed')}
              <span className="tabular-nums">({renewals.length})</span>
            </h2>

            <ul className="mt-3 space-y-2">
              {renewals.map((row) => (
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
          <SubscriptionSettings
            locale={locale}
            trialDays={trialDays}
            plans={plans}
            currency={site?.currency}
            mode={settings?.row?.default_locale ?? locale}
          />
        </Card>
      </div>

      {/* ── The showrooms ──────────────────────────────────────────────── */}
      {items.length ? (
        <div className="flex flex-wrap items-center gap-3 px-4 lg:px-6">
          <h2 className="text-sm font-semibold text-brand-primary">
            {t('المعارض', 'Showrooms')}
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {term
              ? t(`${filtered.length} من ${items.length}`, `${filtered.length} of ${items.length}`)
              : t(`${items.length} معرض`, `${items.length} showroom${items.length === 1 ? '' : 's'}`)}
          </span>
          <SearchBox
            locale={locale}
            className="ms-auto w-full sm:w-64"
            placeholder={t('ابحث باسم المعرض أو المدينة أو الجوال', 'Search name, city or phone')}
          />
        </div>
      ) : null}

      {filtered.length ? (
        <div className="grid gap-3 px-4 sm:grid-cols-2 xl:grid-cols-3 lg:px-6">
          {filtered.map((vendor) => {
            const out = !vendor.access.allowed;

            return (
              <Card
                key={vendor.id}
                className={`flex flex-col p-4 ${out ? 'ring-1 ring-red-200 dark:ring-red-900/60' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/${locale}/marketplace/vendors/${vendor.slug}`}
                    className="truncate font-medium text-brand-primary hover:underline"
                  >
                    {localized(vendor.name, locale)}
                  </Link>

                  <span
                    className={`ms-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${accessTone(
                      vendor.access.state
                    )}`}
                  >
                    {accessLabel(vendor.access.state, locale)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground tabular-nums">
                  <span>
                    {t('حتى: ', 'Until: ')}
                    {when(vendor.access_until)}
                  </span>

                  {vendor.access.daysLeft != null && vendor.access.allowed ? (
                    <span className={vendor.access.state === 'ending' ? 'text-amber-700 dark:text-amber-400' : ''}>
                      {t(`بقي ${vendor.access.daysLeft} يوم`, `${vendor.access.daysLeft} days left`)}
                    </span>
                  ) : null}

                  {/* Inferred from the charges, not from the date — see
                      listVendorAccess. */}
                  <span>
                    {vendor.paidBefore ? t('مشترك', 'Paying') : t('فترة مجانية', 'On trial')}
                  </span>
                </div>

                {vendor.access.state === 'blocked' && vendor.access.reason ? (
                  <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                    {vendor.access.reason}
                  </p>
                ) : null}

                {vendor.contact_phone ? (
                  <a
                    href={`tel:${vendor.contact_phone}`}
                    dir="ltr"
                    className="mt-2 block text-xs text-muted-foreground hover:text-brand-primary"
                  >
                    {vendor.contact_phone}
                  </a>
                ) : null}

                <div className="mt-auto border-t pt-3 dark:border-white/10">
                  <VendorAccessActions
                    locale={locale}
                    vendorId={vendor.id}
                    vendorName={localized(vendor.name, locale)}
                    blocked={vendor.access.state === 'blocked'}
                    plans={activePlans}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="px-4 lg:px-6">
          <div className="rounded-xl border border-dashed border-gray-300 py-14 text-center dark:border-gray-700">
            <Store className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-600" />
            {/* Two different nothings. "No approved showrooms" on a platform
                with forty of them, because somebody mistyped a name, is the
                kind of empty state that gets reported as data loss. */}
            <p className="mt-3 font-semibold text-brand-primary">
              {term
                ? t('لا معرض يطابق البحث', 'No showroom matches that search')
                : t('لا توجد معارض معتمدة', 'No approved showrooms')}
            </p>
            {term ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {t(
                  'جرّب اسماً أو مدينة أو رقماً آخر.',
                  'Try another name, city or number.'
                )}
              </p>
            ) : null}
          </div>
        </div>
      )}
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
