import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Vendor Reviews',
  robots: { index: false, follow: false },
};

export default async function VendorsSlugReviewsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تقييمات البائع"
      titleEn="Vendor Reviews"
      route="/marketplace/vendors/[slug]/reviews"
    />
  );
}
