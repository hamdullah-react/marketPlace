import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Analytics',
  robots: { index: false, follow: false },
};

export default async function AdminAnalyticsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="التحليلات"
      titleEn="Analytics"
      route="/marketplace/admin/analytics"
    />
  );
}
