import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Banners',
  robots: { index: false, follow: false },
};

export default async function AdminContentBannersPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="البانرات"
      titleEn="Banners"
      route="/marketplace/admin/content/banners"
    />
  );
}
