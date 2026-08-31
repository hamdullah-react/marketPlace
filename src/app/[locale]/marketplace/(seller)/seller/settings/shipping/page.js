import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Shipping',
  robots: { index: false, follow: false },
};

export default async function SellerSettingsShippingPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الشحن"
      titleEn="Shipping"
      route="/marketplace/seller/settings/shipping"
    />
  );
}
