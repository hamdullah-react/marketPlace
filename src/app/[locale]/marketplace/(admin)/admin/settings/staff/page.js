import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Staff',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsStaffPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الموظفون"
      titleEn="Staff"
      route="/marketplace/admin/settings/staff"
    />
  );
}
