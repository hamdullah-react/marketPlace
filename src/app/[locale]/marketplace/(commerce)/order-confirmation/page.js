import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Order Confirmation',
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تأكيد الطلب"
      titleEn="Order Confirmation"
      route="/marketplace/order-confirmation"
    />
  );
}
