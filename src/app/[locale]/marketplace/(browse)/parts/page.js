import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('parts', locale);
}

export default async function PartsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SeoJsonLd pageKey="parts" locale={locale} />
      <ComingSoon
        locale={locale}
        titleAr="قطع الغيار"
        titleEn="Spare Parts"
        route="/marketplace/parts"
      />
    </>
  );
}
