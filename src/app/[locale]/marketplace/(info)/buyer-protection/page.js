import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('buyer-protection', locale);
}

export default async function BuyerProtectionPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SeoJsonLd pageKey="buyer-protection" locale={locale} />
      <ComingSoon
        locale={locale}
        titleAr="حماية المشتري"
        titleEn="Buyer Protection"
        route="/marketplace/buyer-protection"
      />
    </>
  );
}
