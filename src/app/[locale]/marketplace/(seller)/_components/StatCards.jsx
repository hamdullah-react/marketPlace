/**
 * KPI cards — dashboard-01's section-cards, fed by real seller data.
 *
 * Keeps the block's exact shell: container-query grid, gradient card fill,
 * absolutely-positioned trend badge, footer with a headline line and a muted
 * sub-line.
 *
 * What it does NOT keep is a badge on every card. The block shows
 * "+12.5% this month" on all four; nothing here records a view or a listing
 * count with a timestamp, so three of the four have no period to compare
 * against. Cards without a real delta show a factual sub-line instead — a
 * fabricated trend on a seller's own numbers is worse than no trend.
 */

import Link from 'next/link';
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function StatCards({ locale = 'ar', stats = {}, listings = [], vendorId = null }) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const nf = (n) => Number(n ?? 0).toLocaleString(isAr ? 'ar-SA' : 'en');
  const money = (n) =>
    new Intl.NumberFormat(isAr ? 'ar-SA' : 'en-SA', {
      style: 'currency', currency: 'SAR', maximumFractionDigits: 0,
    }).format(n);

  const total = listings.length;
  const live = stats.live ?? 0;
  const views = stats.totalViews ?? 0;
  const pending = stats.pending ?? 0;
  const open = stats.openLeads ?? 0;

  const livePct = total ? Math.round((live / total) * 100) : 0;
  const inventoryValue = listings.reduce((sum, l) => sum + Number(l.price ?? 0), 0);
  const avgViews = total ? Math.round(views / total) : 0;

  const href = (path) =>
    vendorId ? `/${locale}${path}${path.includes('?') ? '&' : '?'}vendor=${vendorId}` : `/${locale}${path}`;

  const CARDS = [
    {
      label: t('قيمة المعروض', 'Inventory value'),
      value: money(inventoryValue),
      badge: null,
      headline: t('بسعر الطلب', 'At asking price'),
      note: t(`عبر ${nf(total)} إعلان`, `Across ${nf(total)} listings`),
      to: '/marketplace/seller/listings',
    },
    {
      label: t('إعلانات منشورة', 'Live listings'),
      value: nf(live),
      // The one honest delta: share of inventory visible, from current state.
      badge: total ? { up: livePct >= 50, text: `${livePct}%` } : null,
      headline: livePct >= 50
        ? t('أغلب المعروض ظاهر', 'Most of your stock is visible')
        : t('أغلب المعروض مخفي', 'Most of your stock is hidden'),
      note: pending
        ? t(`${nf(pending)} بانتظار المراجعة`, `${nf(pending)} awaiting review`)
        : t(`من إجمالي ${nf(total)}`, `of ${nf(total)} total`),
      to: '/marketplace/seller/listings?state=live',
    },
    {
      label: t('إجمالي المشاهدات', 'Total views'),
      value: nf(views),
      badge: null,
      headline: t('منذ النشر', 'Since publishing'),
      note: t(`${nf(avgViews)} لكل إعلان`, `${nf(avgViews)} per listing`),
      to: '/marketplace/seller/analytics',
    },
    {
      label: t('عملاء مفتوحون', 'Open leads'),
      value: nf(open),
      badge: open > 0 ? { up: false, text: t('تحتاج متابعة', 'Needs follow-up') } : null,
      headline: open > 0
        ? t('عملاء بانتظارك', 'Buyers are waiting')
        : t('لا شيء معلّق', 'Nothing pending'),
      note: t('من صفحات الإعلانات', 'From your listing pages'),
      to: '/marketplace/seller/leads',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6 dark:*:data-[slot=card]:bg-card">
      {CARDS.map(({ label, value, badge, headline, note, to }) => (
        <Link key={label} href={href(to)} data-slot="card-link">
          <Card className="@container/card raised-card h-full border-0 transition-transform duration-300 hover:-translate-y-0.5">
            <CardHeader className="relative">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {value}
              </CardTitle>
              {badge ? (
                <div className="absolute end-4 top-4">
                  <Badge variant="outline" className="flex gap-1 rounded-lg text-xs">
                    {badge.up ? <TrendingUpIcon className="size-3" /> : <TrendingDownIcon className="size-3" />}
                    {badge.text}
                  </Badge>
                </div>
              ) : null}
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium">{headline}</div>
              <div className="text-muted-foreground">{note}</div>
            </CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  );
}
