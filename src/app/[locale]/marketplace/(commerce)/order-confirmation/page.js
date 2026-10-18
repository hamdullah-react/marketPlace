import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

/**
 * Bilingual, and generated rather than declared.
 *
 * It was a static English string, so an Arabic visitor read an English word
 * in their browser tab and in their history. These pages are noindex and
 * behind a login, so this is not search engine work — it is the same rule
 * the rest of the site follows: nothing user-visible is written in one
 * language in the source.
 *
 * No settings read: the site’s name is appended by the title TEMPLATE in the
 * marketplace layout, which is where that belongs. A cart page has no reason
 * to query anything to name itself.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    title: locale === 'ar' ? 'تأكيد الطلب' : 'Order confirmation',
    robots: { index: false, follow: false },
  };
}

export default async function OrderConfirmationPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تأكيد الطلب"
      titleEn="Order Confirmation"
      route="/marketplace/order-confirmation"
    />
  );
}
