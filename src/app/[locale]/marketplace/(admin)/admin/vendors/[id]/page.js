import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Vendor Profile',
  robots: { index: false, follow: false },
};

export default async function AdminVendorsIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="ملف البائع"
      titleEn="Vendor Profile"
      route="/marketplace/admin/vendors/[id]"
    />
  );
}
