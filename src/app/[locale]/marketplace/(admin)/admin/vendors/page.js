import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Vendors',
  robots: { index: false, follow: false },
};

export default async function AdminVendorsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="البائعون"
      titleEn="Vendors"
      route="/marketplace/admin/vendors"
    />
  );
}
