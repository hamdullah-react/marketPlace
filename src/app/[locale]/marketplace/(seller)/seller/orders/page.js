import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Seller Orders',
  robots: { index: false, follow: false },
};

export default async function SellerOrdersPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الطلبات"
      titleEn="Seller Orders"
      route="/marketplace/seller/orders"
    />
  );
}
