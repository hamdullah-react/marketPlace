import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Accessories',
  robots: { index: false, follow: false },
};

export default async function AccessoriesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="الإكسسوارات"
      titleEn="Accessories"
      route="/marketplace/accessories"
    />
  );
}
