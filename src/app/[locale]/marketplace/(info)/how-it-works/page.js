import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

export const metadata = {
  title: 'How It Works',
  robots: { index: false, follow: false },
};

export default async function HowItWorksPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="كيف يعمل"
      titleEn="How It Works"
      route="/marketplace/how-it-works"
    />
  );
}
