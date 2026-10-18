import '@/marketplace/styles/marketplace.css';
import { setRequestLocale } from 'next-intl/server';
import NavProgress from './_components/NavProgress';
import ThemeStyle from './_components/ThemeStyle';
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
  /* §32 first, the tagline second. The tagline is hero copy and was the only
     thing here before there was a meta description to write. */
  const pick = (v) => (isEn ? v?.en || v?.ar : v?.ar || v?.en) || '';
  const description = pick(site.seo?.description) || pick(site.tagline);
  const siteTitle = pick(site.seo?.title) || siteName;
  const handle = site.twitterHandle ? `@${site.twitterHandle.replace(/^@/, '')}` : undefined;
  const shareImage = site.defaultOgImageUrl ? [absoluteUrl(site.defaultOgImageUrl)] : undefined;

  /* All four services (§32). This layout REPLACES the root’s verification
     block rather than merging with it — a field a child sets wins outright —
     so listing only Bing here would have dropped the other three from every
     page under /marketplace, which is every page there is. */
  const otherVerification = {
    ...(site.bingSiteVerification ? { 'msvalidate.01': site.bingSiteVerification } : {}),
    ...(site.pinterestSiteVerification ? { 'p:domain_verify': site.pinterestSiteVerification } : {}),
    ...(site.facebookDomainVerification
      ? { 'facebook-domain-verification': site.facebookDomainVerification }
      : {}),
  };
  const verificationOther = Object.keys(otherVerification).length ? otherVerification : undefined;

  return {
    metadataBase: new URL(SITE_URL),
    /* The site’s own search title and template (§32), not the company name
       and a format string in the source. */
    title: { default: siteTitle, template: pick(site.seo?.titleTemplate) || `%s | ${siteName}` },
    applicationName: siteName,
    description,
    /* Was `null`, which existed to CLEAR the parent repo’s long Arabic
       keyword list from every English page. There is a site-wide list now
       (§32) and a page with none of its own should inherit it, so the clear
       becomes a value — still replacing whatever is above, never appending. */
    keywords: Array.isArray(site.seo?.keywords?.[isEn ? 'en' : 'ar'])
      && site.seo.keywords[isEn ? 'en' : 'ar'].length
      ? site.seo.keywords[isEn ? 'en' : 'ar']
      : null,
    openGraph: {
      title: siteTitle,
      description,
      siteName,
      type: site.seo?.ogType || 'website',
      locale: isEn ? 'en_US' : 'ar_SA',
      images: shareImage,
    },
    twitter: {
      card: site.seo?.twitterCard || 'summary_large_image',
      title: siteTitle,
      description,
      site: handle,
      images: shareImage,
    },

    icons: site.faviconUrl
      ? { icon: site.faviconUrl, shortcut: site.faviconUrl, apple: site.faviconUrl }
      : undefined,

    verification:
      site.googleSiteVerification || site.yandexSiteVerification || verificationOther
        ? {
            google: site.googleSiteVerification ?? undefined,
            yandex: site.yandexSiteVerification ?? undefined,
            other: verificationOther,
          }
        : undefined,

    /* The publisher is the SITE's name, read from Settings like everything
       else on this page. These three were literals — "Sauda" and "سوق الرميح",
       a name this marketplace is no longer called — written into the <head> of
       every page, where renaming the company on Settings could not reach them. */
    authors: [{ name: siteName }],
    creator: siteName,
    publisher: siteName,

    // Pages opt in from Admin → Website content → Pages SEO.
    robots: { index: false, follow: false },
  };
}

export default async function MarketplaceLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  /**
   * A FRAGMENT, not a wrapper — see the note above: a <div> here collapses the
   * dashboard's flex chain. NavProgress renders a `fixed` element that takes
   * part in no layout, so it is safe as a sibling and covers every marketplace
   * page at once: browse, account, seller and admin.
   */
  return (
    <>
      {/* The admin's colours, radius and shadow strength (Settings →
          Appearance), as CSS variables over the ones globals.css defines.
          Renders nothing while the theme is the built-in one. */}
      <ThemeStyle />
      <NavProgress />
      {children}
    </>
  );
}
