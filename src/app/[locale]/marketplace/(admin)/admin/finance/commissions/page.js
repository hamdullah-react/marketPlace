import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Commissions',
  robots: { index: false, follow: false },
};

export default async function AdminFinanceCommissionsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="العمولات"
      titleEn="Commissions"
      route="/marketplace/admin/finance/commissions"
    />
  );
}
