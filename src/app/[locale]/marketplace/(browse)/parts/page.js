import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Spare Parts',
  robots: { index: false, follow: false },
};

export default async function PartsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="قطع الغيار"
      titleEn="Spare Parts"
      route="/marketplace/parts"
    />
  );
}
