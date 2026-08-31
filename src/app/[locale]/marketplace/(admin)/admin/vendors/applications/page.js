import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Vendor Applications',
  robots: { index: false, follow: false },
};

export default async function AdminVendorsApplicationsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="طلبات الانضمام"
      titleEn="Vendor Applications"
      route="/marketplace/admin/vendors/applications"
    />
  );
}
