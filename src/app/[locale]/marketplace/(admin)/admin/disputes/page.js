import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Disputes',
  robots: { index: false, follow: false },
};

export default async function AdminDisputesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="النزاعات"
      titleEn="Disputes"
      route="/marketplace/admin/disputes"
    />
  );
}
