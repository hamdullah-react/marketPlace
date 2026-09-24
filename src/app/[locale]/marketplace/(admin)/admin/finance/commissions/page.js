import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { ArrowRight, ArrowLeft, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const metadata = {
  title: 'Commissions',
  robots: { index: false, follow: false },
};

/**
 * Commission — and why there is nothing to set.
 *
 * Same reasoning as the payouts page beside it. A commission is a cut of a
 * transaction the platform processed, and this platform processes none: the sale
 * happens between the buyer and the showroom, off the site. `commission_rules`
 * holds the one default row schema.sql seeds and nothing reads it, because there
 * are no orders for a rate to apply to.
 *
 * Kept as a real page rather than a ComingSoon stub so nobody sets a rate here
 * believing it will be charged on anything. What the platform actually bills for
 * is promotions, and the price of those is set per plan on Boost plans & prices.
 */
export default async function AdminFinanceCommissionsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const Arrow = locale === 'ar' ? ArrowLeft : ArrowRight;

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('العمولات', 'Commissions')}</h1>
        </div>

        <div className="px-4 lg:px-6">
          <Card className="max-w-2xl p-5">
            <p className="flex items-center gap-2 font-semibold text-brand-primary">
              <Info className="h-4 w-4" />
              {t('لا عمولة تُخصم على المنصة', 'No commission is charged here')}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(
                'العمولة نسبة من عملية بيع تمرّ عبر المنصة، والبيع هنا يتم بين المشتري والمعرض مباشرة خارج الموقع. لا توجد طلبات لتُطبَّق عليها نسبة، فتعيين نسبة في هذه الصفحة لن يُحصّل شيئاً.',
                'A commission is a share of a sale the platform processed, and here the sale happens directly between the buyer and the showroom, off the site. There are no orders for a rate to apply to, so setting one on this page would collect nothing.'
              )}
            </p>

            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {t(
                'ما تحصّله المنصة فعلاً هو مقابل تمييز السيارات، وسعره يُحدَّد لكل خطة في «خطط التمييز والأسعار»، ويظهر ما هو مستحق ومدفوع في صفحة المالية.',
                'What the platform does charge for is featuring cars. The price is set per plan on Boost plans & prices, and what is owed and paid shows on Finance.'
              )}
            </p>

            <div className="mt-4 flex flex-wrap gap-4">
              <Link
                href={`/${locale}/marketplace/admin/content/boost-plans`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
              >
                {t('خطط التمييز والأسعار', 'Boost plans & prices')}
                <Arrow className="h-4 w-4" />
              </Link>
              <Link
                href={`/${locale}/marketplace/admin/finance`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
              >
                {t('المالية', 'Finance')}
                <Arrow className="h-4 w-4" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
