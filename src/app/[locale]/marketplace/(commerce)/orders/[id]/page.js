import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Order Details',
  robots: { index: false, follow: false },
};

export default async function OrdersIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تفاصيل الطلب"
      titleEn="Order Details"
      route="/marketplace/orders/[id]"
    />
  );
}
