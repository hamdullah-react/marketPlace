import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Reports',
  robots: { index: false, follow: false },
};

export default async function AdminListingsReportsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="البلاغات"
      titleEn="Reports"
      route="/marketplace/admin/listings/reports"
    />
  );
}
