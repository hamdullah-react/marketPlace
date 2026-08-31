import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'All Orders',
  robots: { index: false, follow: false },
};

export default async function AdminOrdersPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الطلبات"
      titleEn="All Orders"
      route="/marketplace/admin/orders"
    />
  );
}
