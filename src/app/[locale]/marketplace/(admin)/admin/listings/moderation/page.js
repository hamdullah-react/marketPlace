import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Listing Moderation',
  robots: { index: false, follow: false },
};

export default async function AdminListingsModerationPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="مراجعة الإعلانات"
      titleEn="Listing Moderation"
      route="/marketplace/admin/listings/moderation"
    />
  );
}
