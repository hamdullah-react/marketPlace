import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { getBoostPlans } from '@/marketplace/db/queries/boosts';
import BoostPricesForm from '../../../_components/BoostPricesForm';

export const instant = false;

export const metadata = {
  title: 'Boost plans and prices',
  robots: { index: false, follow: false },
};

/**
 * Boost plans — its own tab, apart from the request queue, so managing prices
 * and deciding requests do not compete for the same page.
 */
export default async function AdminBoostPlansPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Link href={`/${locale}/marketplace/admin/content/featured`} className="hover:text-brand-primary">
              {t('طلبات التمييز', 'Boost requests')}
            </Link>
            <span>›</span>
            <span className="text-gray-700 dark:text-gray-300">{t('الخطط والأسعار', 'Plans and prices')}</span>
          </nav>
          <h1 className="text-2xl font-bold text-brand-primary">{t('خطط التمييز والأسعار', 'Boost plans and prices')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              'أنشئ الخطط التي يمكن للبائعين طلبها: عدد الأيام والسعر. الخطط المتاحة فقط تظهر للبائعين، ويحتفظ كل طلب بالسعر الذي أُرسل به.',
              'Create the plans sellers can request — how many days and the price. Only plans offered to sellers are shown to them, and each request keeps the price it was sent at.'
            )}
          </p>
        </div>

        <div className="max-w-4xl px-4 lg:px-6">
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
            <PlansSection locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function PlansSection({ locale }) {
  await connection();
  const { ready, plans } = await getBoostPlans();
  return <BoostPricesForm locale={locale} plans={plans} ready={ready} />;
}
