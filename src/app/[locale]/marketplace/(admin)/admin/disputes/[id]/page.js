import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'Dispute Detail',
  robots: { index: false, follow: false },
};

export default async function AdminDisputesIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تفاصيل النزاع"
      titleEn="Dispute Detail"
      route="/marketplace/admin/disputes/[id]"
    />
  );
}
