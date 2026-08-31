import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Track Order',
  robots: { index: false, follow: false },
};

export default async function TrackOrderPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تتبع الطلب"
      titleEn="Track Order"
      route="/marketplace/track-order"
    />
  );
}
