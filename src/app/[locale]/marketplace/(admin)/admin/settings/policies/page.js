import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Platform Policies',
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPoliciesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="سياسات المنصة"
      titleEn="Platform Policies"
      route="/marketplace/admin/settings/policies"
    />
  );
}
