import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { localized } from '@/marketplace/lib/listing';

export const metadata = { robots: { index: false, follow: false } };

/**
 * The chrome for a showroom that cannot get in.
 *
 * ── Why this group exists at all ────────────────────────────────────────────
 *
 * The blocked screen used to sit under (account), which gave it the full
 * marketplace header and footer — a search box, browse menus, a sign-in state,
 * eight footer columns. All of it was noise around the only two things that
 * matter on this page: what happened, and how to fix it. Worse, the header
 * invited a seller who had just been locked out to wander off into the
 * catalogue instead of renewing.
 *
 * So this is its own route group with its own layout. The URL does not change —
 * a group is invisible in the path — and /marketplace/subscription still
 * resolves exactly where requireVendor() sends it.
 *
 * ── What is deliberately kept ───────────────────────────────────────────────
 *
 * The brand mark, because a page with no identity reads as an error screen
 * rather than a message from the platform, and the way back to the marketplace,
 * because this is not a punishment — their storefront and their cars are still
 * live for buyers, and they should be able to go and look at them.
 *
 * ── What is deliberately dropped ────────────────────────────────────────────
 *
 * Search, navigation, the footer's link columns. Nothing on this screen should
 * compete with "renew" or "call us".
 */
export default async function BlockedLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const site = await getSiteSettings().catch(() => null);

  const brand = site ? localized(site.name, locale) : '';
  const logo = site?.logoUrl || null;

  return (
    <div
      dir={locale === 'ar' ? 'rtl' : 'ltr'}
      className="marketplace-root flex min-h-screen flex-col bg-[var(--app-bg)] text-neutral-900 dark:bg-[var(--app-bg-dark)] dark:text-neutral-100"
    >
      {/* A bar, not a header. One mark, one link, nothing to explore. */}
      <header className="flex items-center gap-3 px-4 py-4 lg:px-6">
        <Link href={`/${locale}/marketplace`} className="flex items-center gap-2">
          {logo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt={brand} className="h-8 w-auto" />
          ) : (
            <span className="text-lg font-bold text-brand-primary">{brand}</span>
          )}
        </Link>
      </header>

      <main className="flex-1 pb-10">{children}</main>

      <footer className="px-4 pb-8 text-center text-xs text-muted-foreground lg:px-6">
        <Link href={`/${locale}/marketplace`} className="hover:text-brand-primary">
          {t('العودة إلى السوق', 'Back to the marketplace')}
        </Link>
      </footer>
    </div>
  );
}
