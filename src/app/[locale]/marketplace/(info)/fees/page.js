import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('fees', locale);
}

export default async function FeesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SeoJsonLd pageKey="fees" locale={locale} />
      <ComingSoon
        locale={locale}
        titleAr="الرسوم"
        titleEn="Fees"
        route="/marketplace/fees"
      />
    </>
  );
}
