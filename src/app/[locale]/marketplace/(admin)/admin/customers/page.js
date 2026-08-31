import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Customers',
  robots: { index: false, follow: false },
};

export default async function AdminCustomersPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="العملاء"
      titleEn="Customers"
      route="/marketplace/admin/customers"
    />
  );
}
