import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { localized } from '@/marketplace/lib/listing';
import LanguageSwitcher from '../_components/LanguageSwitcher';

/**
 * The chrome for the pricing page, and for anything else that sells the
 * platform to a showroom rather than a car to a buyer.
 *
 * ── Why this is not (info) ──────────────────────────────────────────────────
 *
 * Every other public page hangs off the marketplace header: a search box, the
 * browse menus, a cart, eight footer columns. All of that is built for somebody
 * shopping for a car, and on this page it works against the one thing the page
 * is for — a dealer deciding whether to pay us. The search box invites them to
 * go and look at cars instead, and the footer offers forty ways out.
 *
 * So this group has its own layout: one bar, one language switcher, one way
 * back, and a page with room to breathe.
 *
 * ── Public, and it sets no robots rule of its own ───────────────────────────
 *
 * The other stripped-back group in this app, (blocked), forces noindex because
 * it is a private message to one showroom. This is the opposite kind of page —
 * "what does it cost to sell here" is a question people type into a
 * search box — so it takes its metadata from Admin → Website content → Pages
 * SEO like every other public page, and follows whatever the marketplace's own
 * indexing decision is. (Every page in lib/sitePages.js is noindex today, which
 * is a launch decision, not something this group should override.)
 *
 * ── The hero wash lives HERE ────────────────────────────────────────────────
 *
 * On the layout rather than the page so the colour runs behind the bar as well,
 * and the bar reads as part of the page instead of a strip stuck on top of it.
 */
export default async function PricingLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const site = await getSiteSettings().catch(() => null);
  const brand = site ? localized(site.name, locale) : '';
  const logo = site?.logoUrl || null;

  // The arrow points the way the language reads, so "back" is back.
  const Back = isAr ? ArrowRight : ArrowLeft;

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="marketplace-root flex min-h-screen flex-col bg-[var(--app-bg)] text-neutral-900 dark:bg-[var(--app-bg-dark)] dark:text-neutral-100"
    >
      {/* The wash. Fixed and behind everything (-z-10), so it cannot intercept
          a press and does not scroll away from a long page. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-brand-primary/10 via-brand-primary/5 to-transparent dark:from-brand-primary/20 dark:via-brand-primary/5"
      />

      <header className="flex items-center gap-3 px-4 py-4 lg:px-6">
        <Link href={`/${locale}/marketplace`} className="flex items-center gap-2">
          {logo ? (
            /* A plain <img>: a 32px-tall brand mark gains nothing from the
               optimiser, and a logo must not depend on it to appear. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={logo} alt={brand} className="h-8 w-auto" />
          ) : (
            <span className="text-lg font-bold text-brand-primary">{brand}</span>
          )}
        </Link>

        <div className="ms-auto flex items-center gap-3">
          <Link
            href={`/${locale}/marketplace`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-brand-primary"
          >
            <Back className="h-3.5 w-3.5" />
            {t('السوق', 'Marketplace')}
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="flex-1 pb-16">{children}</main>

      <footer className="border-t px-4 py-6 text-center text-xs text-muted-foreground dark:border-white/10 lg:px-6">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          <Link href={`/${locale}/marketplace/sell`} className="hover:text-brand-primary">
            {t('البيع على المنصة', 'Selling on the platform')}
          </Link>
          <Link href={`/${locale}/marketplace/seller-terms`} className="hover:text-brand-primary">
            {t('شروط البائع', 'Seller terms')}
          </Link>
          <Link href={`/${locale}/marketplace/help`} className="hover:text-brand-primary">
            {t('المساعدة', 'Help')}
          </Link>
          {site?.contactEmail ? (
            <a href={`mailto:${site.contactEmail}`} dir="ltr" className="hover:text-brand-primary">
              {site.contactEmail}
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
