import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Finance',
  robots: { index: false, follow: false },
};

export default async function AdminFinancePage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="المالية"
      titleEn="Finance"
      route="/marketplace/admin/finance"
    />
  );
}
