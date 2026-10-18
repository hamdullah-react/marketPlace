import { setRequestLocale } from 'next-intl/server';
import ComingSoon from '@/marketplace/ui/ComingSoon';
import { getSiteSettings } from '@/marketplace/db/queries/site';

/**
 * This route's params are not known at build time, so under cacheComponents
 * the shell cannot be prerendered without blocking. Same reason, same fix as
 * listing/[slug]: route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

/**
 * Dynamic, like every other public route — it was three static lines, so a
 * category page carried the same English <title> in both languages whatever
 * the marketplace was called.
 *
 * It stays NOINDEX, and that is about CONTENT rather than about being
 * static: this route renders <ComingSoon/>. A canonical and an hreflang pair
 * are still worth emitting — the URL is shareable today, and the day the
 * section ships the only thing to change is the switch.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const site = await getSiteSettings().catch(() => null);
  const isAr = locale === 'ar';
  const name = (isAr ? site?.name?.ar : site?.name?.en) || site?.name?.en || '';

  return {
    title: isAr ? 'التصنيفات' : 'Categories',
    description: isAr
      ? `تصفّح السيارات حسب التصنيف في ${name}.`
      : `Browse cars by category on ${name}.`,
    alternates: {
      canonical: `/${locale}/marketplace/c`,
      languages: { ar: '/ar/marketplace/c', en: '/en/marketplace/c' },
    },
    robots: { index: false, follow: true },
  };
}
export default async function CSlugPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <ComingSoon
      locale={locale}
      titleAr="التصنيفات"
      titleEn="Categories"
      route="/marketplace/c/[...slug]"
    />
  );
}
