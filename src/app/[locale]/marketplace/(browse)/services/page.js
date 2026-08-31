import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Services',
  robots: { index: false, follow: false },
};

export default async function ServicesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الخدمات"
      titleEn="Services"
      route="/marketplace/services"
    />
  );
}
