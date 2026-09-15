import '@/marketplace/styles/marketplace.css';
import { setRequestLocale } from 'next-intl/server';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { SITE_URL } from '@/marketplace/lib/sitePages';
import { absoluteUrl } from '@/marketplace/seo/pageMetadata';

/**
 * Marketplace segment layout — styles and metadata only. No DOM.
 *
 * It deliberately renders `children` bare. Two reasons:
 *
 *  1. Chrome belongs to the groups, not here. A header in this layout also
 *     lands on the seller and admin dashboards, which have their own shells.
 *
 *  2. A wrapper <div> here breaks the dashboard. shadcn's SidebarProvider must
 *     be the top-level flex container — it renders `flex min-h-svh w-full` and
 *     the fixed sidebar plus SidebarInset position against it. Nesting that
 *     inside a plain div collapses the chain and the content slides under the
 *     sidebar.
 *
 * Each group therefore sets its own `dir` and background.
 */
/**
 * The site-wide defaults every page inherits: name, tagline, favicon, share
 * image, X handle and search-console verification — all from Admin → Settings
 * (a cached read), in the page's language.
 *
 * Every field is set explicitly. Per the metadata docs, a field the child does
 * not set is INHERITED from the parent — and the root layout's copy is the
 * Arabic dealership blurb plus a long Arabic keyword list, which was landing on
 * every English marketplace page. Setting a field replaces it outright.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const isEn = locale === 'en';

  const site = await getSiteSettings();
  const siteName = isEn ? site.name.en : site.name.ar;
  const description = isEn ? site.tagline.en : site.tagline.ar;
  const handle = site.twitterHandle ? `@${site.twitterHandle.replace(/^@/, '')}` : undefined;
  const shareImage = site.defaultOgImageUrl ? [absoluteUrl(site.defaultOgImageUrl)] : undefined;

  const verificationOther = site.bingSiteVerification ? { 'msvalidate.01': site.bingSiteVerification } : undefined;

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: siteName, template: `%s | ${siteName}` },
    applicationName: siteName,
    description,
    keywords: null,
    openGraph: {
      title: siteName,
      description,
      siteName,
      locale: isEn ? 'en_US' : 'ar_SA',
      images: shareImage,
    },
    twitter: { title: siteName, description, site: handle, images: shareImage },

    icons: site.faviconUrl
      ? { icon: site.faviconUrl, shortcut: site.faviconUrl, apple: site.faviconUrl }
      : undefined,

    verification:
      site.googleSiteVerification || verificationOther
        ? { google: site.googleSiteVerification ?? undefined, other: verificationOther }
        : undefined,

    // The company name is a proper noun, but it has an English form — the
    // inherited value was the Arabic one on every page.
    authors: [{ name: isEn ? 'Alromaih Cars' : 'الرميح للسيارات' }],
    creator: isEn ? 'Alromaih Cars' : 'الرميح للسيارات',
    publisher: isEn ? 'Alromaih Cars' : 'الرميح للسيارات',

    // Pages opt in from Admin → Website content → Pages SEO.
    robots: { index: false, follow: false },
  };
}

export default async function MarketplaceLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
