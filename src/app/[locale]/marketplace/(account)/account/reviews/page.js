import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'My Reviews',
  robots: { index: false, follow: false },
};

export default async function AccountReviewsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تقييماتي"
      titleEn="My Reviews"
      route="/marketplace/account/reviews"
    />
  );
}
