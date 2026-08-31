import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Customer Profile',
  robots: { index: false, follow: false },
};

export default async function AdminCustomersIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="ملف العميل"
      titleEn="Customer Profile"
      route="/marketplace/admin/customers/[id]"
    />
  );
}
