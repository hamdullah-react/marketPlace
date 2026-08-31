import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Listing Media',
  robots: { index: false, follow: false },
};

export default async function SellerListingsIdMediaPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الصور والوسائط"
      titleEn="Listing Media"
      route="/marketplace/seller/listings/[id]/media"
    />
  );
}
