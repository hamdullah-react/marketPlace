import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Team',
  robots: { index: false, follow: false },
};

export default async function SellerSettingsTeamPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الفريق"
      titleEn="Team"
      route="/marketplace/seller/settings/team"
    />
  );
}
