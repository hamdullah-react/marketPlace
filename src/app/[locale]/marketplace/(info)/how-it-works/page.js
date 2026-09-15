import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('how-it-works', locale);
}

export default async function HowItWorksPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SeoJsonLd pageKey="how-it-works" locale={locale} />
      <ComingSoon
        locale={locale}
        titleAr="كيف يعمل"
        titleEn="How It Works"
        route="/marketplace/how-it-works"
      />
    </>
  );
}
