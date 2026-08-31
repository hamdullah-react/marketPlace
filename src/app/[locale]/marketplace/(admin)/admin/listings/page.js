import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'All Listings',
  robots: { index: false, follow: false },
};

export default async function AdminListingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الإعلانات"
      titleEn="All Listings"
      route="/marketplace/admin/listings"
    />
  );
}
