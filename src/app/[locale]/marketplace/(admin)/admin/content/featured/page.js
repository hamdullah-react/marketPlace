import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Featured',
  robots: { index: false, follow: false },
};

export default async function AdminContentFeaturedPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="المميزة"
      titleEn="Featured"
      route="/marketplace/admin/content/featured"
    />
  );
}
