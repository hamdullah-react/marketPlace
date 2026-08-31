import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Review Moderation',
  robots: { index: false, follow: false },
};

export default async function AdminReviewsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="إدارة التقييمات"
      titleEn="Review Moderation"
      route="/marketplace/admin/reviews"
    />
  );
}
