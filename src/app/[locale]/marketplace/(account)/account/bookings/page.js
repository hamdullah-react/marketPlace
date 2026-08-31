import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Bookings',
  robots: { index: false, follow: false },
};

export default async function AccountBookingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الحجوزات"
      titleEn="Bookings"
      route="/marketplace/account/bookings"
    />
  );
}
