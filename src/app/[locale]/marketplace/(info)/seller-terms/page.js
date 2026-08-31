import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Seller Terms',
  robots: { index: false, follow: false },
};

export default async function SellerTermsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="شروط البائع"
      titleEn="Seller Terms"
      route="/marketplace/seller-terms"
    />
  );
}
