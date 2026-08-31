import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Fulfil Order',
  robots: { index: false, follow: false },
};

export default async function SellerOrdersIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تنفيذ الطلب"
      titleEn="Fulfil Order"
      route="/marketplace/seller/orders/[id]"
    />
  );
}
