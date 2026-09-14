import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';

/**
 * This route's params are not known at build time, so under cacheComponents
 * the shell cannot be prerendered without blocking. Same reason, same fix as
 * listing/[slug]: route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Order Details',
  robots: { index: false, follow: false },
};

export default async function OrdersIdPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="تفاصيل الطلب"
      titleEn="Order Details"
      route="/marketplace/orders/[id]"
    />
  );
}
