import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Cart',
  robots: { index: false, follow: false },
};

export default async function CartPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="السلة"
      titleEn="Cart"
      route="/marketplace/cart"
    />
  );
}
