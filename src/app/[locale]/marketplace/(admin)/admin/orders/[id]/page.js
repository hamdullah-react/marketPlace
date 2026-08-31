import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Order Detail',
  robots: { index: false, follow: false },
};

export default async function AdminOrdersIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تفاصيل الطلب"
      titleEn="Order Detail"
      route="/marketplace/admin/orders/[id]"
    />
  );
}
