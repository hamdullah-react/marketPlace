import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { BadgeDollarSign } from 'lucide-react';
import { listBoosts } from '@/marketplace/db/queries/boosts';
import { sweepExpiredBoosts } from '@/marketplace/db/queries/engagement';
import { localized, formatPrice } from '@/marketplace/lib/listing';
import SafeThumb from '../../../../_components/SafeThumb';
import BoostRowActions from '../../../_components/BoostRowActions';

export const instant = false;

export const metadata = {
  title: 'Boost requests',
  robots: { index: false, follow: false },
};

const TABS = [
  { value: 'pending', ar: 'بانتظار المراجعة', en: 'Waiting' },
  { value: 'active', ar: 'مميزة الآن', en: 'Running' },
  { value: 'history', ar: 'السجل', en: 'History' },
];

const STATE_STYLES = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  approved: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

export default async function AdminBoostsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">{t('طلبات التمييز', 'Boost requests')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                'السيارات المميزة تظهر أولاً في صفحة كل السيارات وفي قسم المميزة بالصفحة الرئيسية، مع شارة "مميز". تنتهي تلقائياً بعد المدة.',
                'Featured cars show first on All Cars and in the home page Featured row, with a "Featured" label. They end on their own when the time is up.'
              )}
            </p>
          </div>
          <Link
            href={`/${locale}/marketplace/admin/content/boost-plans`}
            className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-primary"
          >
            <BadgeDollarSign className="h-4 w-4 text-brand-gold" />
            {t('الخطط والأسعار', 'Plans and prices')}
          </Link>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={5} cols={6} />}>
            <BoostsSection searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function BoostsSection({ searchParams, locale }) {
  const sp = await searchParams;
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const date = (iso) =>
    iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // A plain number in the reader's own digits — no currency is fixed in code.
  const money = (n) =>
    n == null ? null : new Intl.NumberFormat(isAr ? 'ar-SA' : 'en', { maximumFractionDigits: 2 }).format(Number(n));

  const tab = TABS.some((x) => x.value === sp?.tab) ? sp.tab : 'pending';

  // Opening this page retires anything that has run out, so "Running" is true.
  await sweepExpiredBoosts({ force: true }).catch(() => {});
  const { ready, items } = await listBoosts({ tab });

  const stateLabel = (s) =>
    ({
      pending: t('بانتظار المراجعة', 'Waiting'),
      approved: t('موافق عليه', 'Approved'),
      rejected: t('مرفوض', 'Rejected'),
      cancelled: t('ملغى', 'Cancelled'),
      expired: t('منتهي', 'Expired'),
    })[s] ?? s;

  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        {TABS.map((x) => (
          <Link
            key={x.value}
            href={`/${locale}/marketplace/admin/content/featured${x.value === 'pending' ? '' : `?tab=${x.value}`}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === x.value ? 'raised-solid bg-brand-primary text-white' : 'raised-hover text-gray-600 dark:text-gray-400'
            }`}
          >
            {t(x.ar, x.en)}
          </Link>
        ))}
      </div>

      {!ready ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-800 dark:text-amber-300">{t('التمييز غير مفعّل بعد', 'Boosts are not set up yet')}</p>
          <p className="mt-2 text-amber-700 dark:text-amber-400">
            {t(
              'افتح Supabase ← SQL Editor وشغّل القسم الأخير من src/marketplace/db/schema.sql (BOOSTS, THE VIEW COUNTER). ثم حدّث الصفحة.',
              'Open Supabase → SQL Editor and run the last section of src/marketplace/db/schema.sql (BOOSTS, THE VIEW COUNTER). Then refresh this page.'
            )}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="font-semibold text-brand-primary">
            {tab === 'pending' ? t('لا توجد طلبات بانتظارك', 'No requests waiting') : t('لا شيء هنا', 'Nothing here')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 dark:bg-[#141414]">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="w-16 px-4 py-3"><span className="sr-only">{t('صورة', 'Photo')}</span></th>
                <th className="px-4 py-3 text-start font-medium">{t('السيارة', 'Car')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('المعرض', 'Showroom')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('المدة', 'Length')}</th>
                <th className="px-4 py-3 text-start font-medium">
                  {tab === 'pending' ? t('تاريخ الطلب', 'Requested') : t('ينتهي', 'Ends')}
                </th>
                <th className="px-4 py-3 text-start font-medium">{t('الحالة', 'Status')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((b) => {
                const media = Array.isArray(b.listings?.media) ? b.listings.media : [];
                const image = (media.find((m) => m?.primary) ?? media[0])?.url ?? null;
                return (
                  <tr key={b.id} className="bg-white align-top dark:bg-[#1a1a1a]">
                    <td className="px-4 py-3">
                      <SafeThumb src={image} className="h-11 w-14 rounded-md border object-cover" />
                    </td>
                    <td className="px-4 py-3">
                      {b.listings ? (
                        <Link
                          href={`/${locale}/marketplace/listing/${b.listings.slug}`}
                          className="font-medium text-brand-primary hover:underline"
                        >
                          {localized(b.listings.name, locale)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t('إعلان محذوف', 'Deleted listing')}</span>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {b.listings ? formatPrice(b.listings.price, locale) : ''}
                        {b.listings ? ` · ${Number(b.listings.views ?? 0).toLocaleString(isAr ? 'ar-SA' : 'en')} ${t('مشاهدة', 'views')}` : ''}
                      </p>
                      {b.note ? (
                        <p className="mt-1 max-w-xs text-xs italic text-gray-600 dark:text-gray-400">“{b.note}”</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {b.vendors ? (
                        <Link href={`/${locale}/marketplace/vendors/${b.vendors.slug}`} className="hover:text-brand-primary">
                          {localized(b.vendors.name, locale)}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {t(`${b.days} يوم`, `${b.days} days`)}
                      {money(b.price) ? (
                        <span className="mt-0.5 block font-semibold text-brand-primary">
                          {money(b.price)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-600 dark:text-gray-400">
                      {tab === 'pending' ? date(b.created_at) : date(b.ends_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATE_STYLES[b.state] ?? STATE_STYLES.cancelled}`}>
                        {stateLabel(b.state)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <BoostRowActions locale={locale} boostId={b.id} tab={tab} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
