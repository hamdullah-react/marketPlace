import '../globals.css';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { Almarai, Noto_Sans_Arabic } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { ThemeProvider } from '@/components/theme-provider';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { normalizeHex } from '@/marketplace/lib/theme';
import { SITE_URL, BRAND_FALLBACK } from '@/marketplace/lib/sitePages';

/**
 * THE root layout — and it sits under [locale] on purpose.
 *
 * next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md:
 * "The root layout can be under a dynamic segment, for example when
 * implementing internationalization with app/[lang]/layout.js", and omitting
 * app/layout.js makes the layouts below it root layouts.
 *
 * That placement is the whole reason this file can do something the parent
 * repo's root layout cannot. There, <html> is above [locale] and so cannot see
 * it — src/app/layout.js hardcodes `lang="ar" dir="rtl"` with the comment
 * "Default to Arabic (RTL)", which means every ENGLISH page on the site ships
 * as Arabic RTL to a screen reader and to Google. Here the locale is a param,
 * so lang and dir are simply correct in both languages.
 */

/**
 * Two fonts, not five.
 *
 * The parent's root layout loads Almarai, IBM Plex Sans Arabic, DM Sans,
 * Lalezar and Noto Sans Arabic, and the marketplace inherited all of them for
 * the two it actually uses: the tailwind `sans` family resolves to
 * --font-almarai, and exactly two components ask for `font-noto`. The other
 * three were pure download weight on every marketplace page.
 */
const almarai = Almarai({
  subsets: ['arabic'],
  weight: ['300', '400', '700', '800'],
  display: 'swap',
  variable: '--font-almarai',
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  display: 'swap',
  variable: '--font-noto-sans-arabic',
  preload: false,
});

/**
 * themeColor is the browser's own chrome — the address bar on Android, the
 * status bar of an installed app, the task switcher card. It was the green
 * this project shipped with, written here as a literal, so an admin who
 * changed the brand colour on Settings → Appearance changed every surface of
 * the site EXCEPT the one frame around it.
 *
 * It is a function now because that colour lives in the database, and
 * generateViewport is the only place Next lets a <meta name="theme-color">
 * be computed. The read is the same cached one every page already makes.
 */
export async function generateViewport() {
  const site = await getSiteSettings().catch(() => null);

  return {
    width: 'device-width',
    initialScale: 1,
    /**
     * maximumScale 1 is what lets form controls be smaller than 16px on a phone.
     *
     * iOS Safari zooms into any input whose text is under 16px the moment it is
     * focused, and stays zoomed. With the page scale capped it does not, and since
     * iOS 10 a pinch still zooms anyway — Apple ignores the cap for gestures. Some
     * Android browsers DO honour it for pinch; that is the trade for a phone layout
     * whose search box matches the rest of the page instead of towering over it.
     */
    maximumScale: 1,
    themeColor: normalizeHex(site?.theme?.primary, '#0B6B3A'),
  };
}

/**
 * The manifest is what makes the app INSTALLABLE, and on an iPhone that is not
 * a nicety: Safari exposes no PushManager at all in an ordinary tab. A seller
 * on iOS has to add the site to their Home Screen before web push exists for
 * them, and a site with no manifest cannot be added in a way that counts.
 *
 * On Android and desktop it is optional and still worth having — it is what
 * gives the installed app its name, its icon and its colour.
 */
/**
 * ── Everything on this page comes from Admin → Settings ────────────────────
 *
 * The name, the sentence under it, the share image, the favicon, the X handle
 * and the two search-console verification strings. None of them was here: the
 * root layout shipped the literal "Sauda" and a hardcoded icon list, and the
 * marketplace layout below it set the rest — which meant the root of the site
 * described a product whose name could no longer be changed from the admin.
 *
 * The child layout still sets its own copy of these. That is not waste: per
 * the metadata docs a field a child does not set is INHERITED, so the one that
 * is closest to the page has to be complete, and this one is what anything
 * outside /marketplace falls back to.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const site = await getSiteSettings().catch(() => null);

  const isEn = locale === 'en';
  const lang = isEn ? 'en' : 'ar';
  const pick = (value) => (value?.[lang] || value?.en || value?.ar || '').trim();

  const name = pick(site?.name) || BRAND_FALLBACK.name[lang];

  /* §32: the site's OWN search-result copy, then the tagline, then nothing.
     The tagline is hero marketing and was standing in for a meta description
     because there was no meta description — it still stands in when nobody has
     written one. */
  const description = pick(site?.seo?.description) || pick(site?.tagline) || undefined;

  /* The title a page with no title of its own gets, which is not the same as
     the company name — "Sauda" tells a searcher nothing. */
  const defaultTitle = pick(site?.seo?.title) || name;

  /* "%s | SAUDA" unless an admin wrote their own. The %s is the page's title;
     the action refuses a template without one, so a stored value always has it
     and the fallback below is only for a blank field. */
  const template = pick(site?.seo?.titleTemplate) || `%s | ${name}`;

  const keywords = Array.isArray(site?.seo?.keywords?.[lang]) && site.seo.keywords[lang].length
    ? site.seo.keywords[lang]
    : null;

  const handle = site?.twitterHandle ? `@${site.twitterHandle.replace(/^@/, '')}` : undefined;
  const shareImage = site?.defaultOgImageUrl ? [site.defaultOgImageUrl] : undefined;

  /* Four services now, and three of them arrive as `other` because Next's
     metadata only names google and yandex explicitly. */
  const other = {
    ...(site?.bingSiteVerification ? { 'msvalidate.01': site.bingSiteVerification } : {}),
    ...(site?.pinterestSiteVerification ? { 'p:domain_verify': site.pinterestSiteVerification } : {}),
    ...(site?.facebookDomainVerification
      ? { 'facebook-domain-verification': site.facebookDomainVerification }
      : {}),
  };
  const hasOther = Object.keys(other).length > 0;

  return {
  /**
   * metadataBase at the ROOT, not only on the marketplace layout.
   *
   * Every relative canonical, hreflang and og:image below resolves against it,
   * and a page that forgets to set it gets Next's localhost guess — which ends
   * up in the HTML of a production build as http://localhost:3000, telling a
   * crawler the real page lives on a machine it cannot reach.
   */
  metadataBase: new URL(SITE_URL),

  /* The site's own name, and the frame every child title sits in. A page that
     sets `title: 'Cars for sale'` renders "Cars for sale | <name>" because of
     this line, and renaming the marketplace renames all of them at once. */
  title: { default: defaultTitle, template },
  applicationName: name,
  description,
  keywords,

  openGraph: {
    title: defaultTitle,
    description,
    siteName: name,
    type: site?.seo?.ogType || 'website',
    locale: isEn ? 'en_US' : 'ar_SA',
    images: shareImage,
  },
  twitter: {
    card: site?.seo?.twitterCard || 'summary_large_image',
    title: defaultTitle,
    description,
    site: handle,
    creator: handle,
    images: shareImage,
  },

  /* Google Search Console and Bing Webmaster Tools, from the fields on
     Settings → SEO. Both are "prove you own this domain" strings, and both are
     useless as literals in a repo: they belong to whoever verified the site,
     which is not necessarily whoever deployed it. */
  verification:
    site?.googleSiteVerification || site?.yandexSiteVerification || hasOther
      ? {
          google: site?.googleSiteVerification ?? undefined,
          yandex: site?.yandexSiteVerification ?? undefined,
          other: hasOther ? other : undefined,
        }
      : undefined,

  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    // The installed app's name on the Home Screen, from Settings → the same
    // place the header's wordmark comes from, in the page's own language.
    title: name,
    statusBarStyle: 'default',
  },
  /* iOS does NOT read the manifest's icons for the Home Screen — it reads
     apple-touch-icon. Without one the icon becomes a screenshot of whatever page
     was open when the site was added, which is how an installed app ends up
     looking like a mistake and gets deleted. On an iPhone, deleting the
     installed app deletes the only place push can exist. */
  icons: {
    /* The admin's favicon first when they uploaded one — it is the mark in the
       browser tab, and it was the one piece of branding on this page that
       Settings could not reach. The PNGs stay behind it: a 32px favicon is the
       wrong file for an installed app's tile, so these are not alternatives to
       each other. */
    icon: [
      ...(site?.faviconUrl ? [{ url: site.faviconUrl }] : []),
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: site?.faviconUrl || undefined,
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params;

  // A URL like /de/marketplace must 404 rather than render an Arabic page
  // under a German lang attribute.
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const isAr = locale === 'ar';

  return (
    <html lang={locale} dir={isAr ? 'rtl' : 'ltr'} suppressHydrationWarning>
      <body
        className={`${almarai.variable} ${notoSansArabic.variable} font-almarai`}
        suppressHydrationWarning
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
