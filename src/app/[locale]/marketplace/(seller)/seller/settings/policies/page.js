import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Policies',
  robots: { index: false, follow: false },
};

export default async function SellerSettingsPoliciesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="السياسات"
      titleEn="Policies"
      route="/marketplace/seller/settings/policies"
    />
  );
}
