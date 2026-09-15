import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('seller-terms', locale);
}

export default async function SellerTermsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SeoJsonLd pageKey="seller-terms" locale={locale} />
      <ComingSoon
        locale={locale}
        titleAr="شروط البائع"
        titleEn="Seller Terms"
        route="/marketplace/seller-terms"
      />
    </>
  );
}
