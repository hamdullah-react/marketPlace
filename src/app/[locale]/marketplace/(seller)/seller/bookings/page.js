import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Bookings Calendar',
  robots: { index: false, follow: false },
};

export default async function SellerBookingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تقويم الحجوزات"
      titleEn="Bookings Calendar"
      route="/marketplace/seller/bookings"
    />
  );
}
