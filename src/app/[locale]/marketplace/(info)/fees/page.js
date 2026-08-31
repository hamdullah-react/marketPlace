import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Fees',
  robots: { index: false, follow: false },
};

export default async function FeesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الرسوم"
      titleEn="Fees"
      route="/marketplace/fees"
    />
  );
}
