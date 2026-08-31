import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Listing Detail',
  robots: { index: false, follow: false },
};

export default async function AdminListingsIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تفاصيل الإعلان"
      titleEn="Listing Detail"
      route="/marketplace/admin/listings/[id]"
    />
  );
}
