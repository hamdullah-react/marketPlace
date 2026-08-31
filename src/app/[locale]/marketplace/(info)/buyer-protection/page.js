import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Buyer Protection',
  robots: { index: false, follow: false },
};

export default async function BuyerProtectionPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="حماية المشتري"
      titleEn="Buyer Protection"
      route="/marketplace/buyer-protection"
    />
  );
}
