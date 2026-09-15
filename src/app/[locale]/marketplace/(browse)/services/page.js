import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('services', locale);
}

export default async function ServicesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SeoJsonLd pageKey="services" locale={locale} />
      <ComingSoon
        locale={locale}
        titleAr="الخدمات"
        titleEn="Services"
        route="/marketplace/services"
      />
    </>
  );
}
