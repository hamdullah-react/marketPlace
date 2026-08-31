import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'My Orders',
  robots: { index: false, follow: false },
};

export default async function OrdersPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="طلباتي"
      titleEn="My Orders"
      route="/marketplace/orders"
    />
  );
}
