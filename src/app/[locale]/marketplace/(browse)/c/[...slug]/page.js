import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Categories',
  robots: { index: false, follow: false },
};

export default async function CSlugPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="التصنيفات"
      titleEn="Categories"
      route="/marketplace/c/[...slug]"
    />
  );
}
