import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCardsSkeleton, ChartSkeleton } from '../../../_components/Skeletons';
import { getAnalyticsVendors, getAnalyticsPageData } from './_apicalls/analyticsPageApi';
import AnalyticsCharts from './_components/AnalyticsCharts';

export const metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false },
};

/** Windows offered by the range switcher. */
const RANGES = [7, 30, 90];

/**
 * Seller analytics.
 *
 * The sidebar has linked here since the dashboard was built; the route did not
 * exist, so it 404'd. Everything on it is derived from real columns — see the
 * note at the top of queries/analytics.js for what is deliberately NOT shown.
 *
 * searchParams is not awaited at the top: the heading and range switcher are
 * static, so only the data section falls back to a skeleton when the range
 * changes.
 */
export default async function AnalyticsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('التحليلات', 'Analytics')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'أداء إعلاناتك: ما يُشاهَد، وما ينتظر، وأين يتركّز مخزونك.',
              'How your listings perform — what gets seen, what is waiting, and where your stock sits.'
            )}
          </p>
        </div>

        <Suspense fallback={<AnalyticsSkeleton />}>
          <Analytics searchParams={searchParams} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <StatCardsSkeleton />
      <div className="px-4 lg:px-6">
        <ChartSkeleton />
      </div>
    </div>
  );
}

/* ── Streaming section ───────────────────────────────────────────────────── */

async function Analytics({ searchParams, locale, t }) {
  const sp = await searchParams;
  const vendors = await getAnalyticsVendors();
  // Matched against the caller's own list, never taken verbatim: `?vendor=`
  // arrives from the URL, and reading it straight through handed any seller
  // another seller's data by editing one query parameter. An id that is not
  // theirs falls back to their first showroom rather than erroring — a stale
  // link should degrade to their own data, not to a refusal.
  const vendorId = vendors.find((v) => v.id === sp?.vendor)?.id ?? vendors[0]?.id ?? null;
  const days = RANGES.includes(Number(sp?.days)) ? Number(sp.days) : 30;

  const { data, error } = await getAnalyticsPageData(vendorId, days);

  if (!vendorId) {
    return (
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('لا يوجد متجر بعد', 'No store yet')}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t(
              'لم يُربط متجر بهذا الحساب بعد. تواصل مع الدعم للبدء.',
              'No store is linked to this account yet. Contact support to get started.'
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !data) {
    // The cause belongs in the log, not on a seller's screen.
    console.error('[seller/analytics] load failed:', error);
    return (
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t('التحليلات غير متاحة حالياً', 'Analytics are unavailable right now')}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t('حاول تحديث الصفحة بعد قليل.', 'Try refreshing in a moment.')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const nf = (n) => Number(n ?? 0).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US');
  const money = (n) =>
    `${Number(n ?? 0).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')} ${t('ر.س', 'SAR')}`;

  const cards = [
    {
      ar: 'إجمالي الإعلانات', en: 'Total listings',
      value: nf(data.totals.listings),
      noteAr: `${nf(data.totals.live)} منشور`, noteEn: `${nf(data.totals.live)} live`,
    },
    {
      ar: 'إجمالي المشاهدات', en: 'Total views',
      value: nf(data.totals.views),
      // Named as lifetime, because there is no history to trend it against.
      noteAr: 'منذ النشر — لا يوجد سجل يومي',
      noteEn: 'Lifetime — no daily history recorded',
    },
    {
      ar: 'مشاهدات لكل إعلان منشور', en: 'Views per live listing',
      value: nf(data.totals.viewsPerLive),
      noteAr: 'متوسط على المنشور فقط', noteEn: 'Averaged over live listings only',
    },
    {
      ar: 'استفسارات مفتوحة', en: 'Open enquiries',
      value: nf(data.totals.openLeads),
      noteAr: `${nf(data.totals.leads)} إجمالاً`, noteEn: `${nf(data.totals.leads)} all time`,
    },
  ];

  const rangeHref = (n) => {
    const p = new URLSearchParams();
    p.set('days', String(n));
    if (sp?.vendor) p.set('vendor', sp.vendor);
    return `/${locale}/marketplace/seller/analytics?${p.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* ── KPI cards. Same grid as the dashboard's StatCards. ───────────── */}
      <div className="grid grid-cols-1 gap-4 px-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6">
        {cards.map((c) => (
          <Card key={c.en} className="@container/card h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t(c.ar, c.en)}
              </CardTitle>
              <p className="mt-1 text-3xl font-bold tabular-nums text-brand-primary">{c.value}</p>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-xs text-muted-foreground">{t(c.noteAr, c.noteEn)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Inventory value + range switcher ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 lg:px-6">
        <p className="text-sm text-muted-foreground">
          {t('قيمة المخزون', 'Inventory value')}{' '}
          <span className="font-semibold tabular-nums text-brand-primary">
            {money(data.totals.inventoryValue)}
          </span>
          <span className="mx-2 opacity-40">·</span>
          {t('متوسط السعر', 'Average price')}{' '}
          <span className="font-semibold tabular-nums text-brand-primary">
            {money(data.totals.avgPrice)}
          </span>
        </p>

        <nav className="flex gap-1 rounded-lg border p-1"raised-solid aria-label={t('المدة', 'Range')}>
          {RANGES.map((n) => (
            <Link
              key={n}
              href={rangeHref(n)}
              aria-current={n === days ? 'page' : undefined}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                n === days ? 'bg-brand-primary text-white' : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {t(`${n} يوم`, `${n} days`)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="px-4 lg:px-6">
        <AnalyticsCharts locale={locale} data={data} />
      </div>
    </div>
  );
}
