import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Platform Settings',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="إعدادات المنصة"
      titleEn="Platform Settings"
      route="/marketplace/admin/settings"
    />
  );
}
