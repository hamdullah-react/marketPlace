import '@/marketplace/styles/marketplace.css';
import { setRequestLocale } from 'next-intl/server';

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
 * The site name follows the locale.
 *
 * This was a static `metadata` export with the name baked in as
 * '%s | سوق الرميح', so every English page — including the whole dashboard —
 * carried an Arabic browser tab and an Arabic share title. A static export
 * cannot see `params`, so reading the locale means generateMetadata.
 */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  const isEn = locale === 'en';

  const siteName = isEn ? 'Alromaih Marketplace' : 'سوق الرميح';
  const description = isEn
    ? 'New and used cars from verified showrooms — clear pricing, and a direct line to the seller.'
    : 'سيارات جديدة ومستعملة من معارض موثوقة، بأسعار واضحة وتواصل مباشر مع البائع.';

  return {
    title: { default: siteName, template: `%s | ${siteName}` },

    // description / keywords / openGraph / twitter are all set explicitly.
    // Per the metadata docs, a field the child does not set is INHERITED from
    // the parent — and the root layout's copy is the Arabic dealership blurb
    // plus a long Arabic keyword list, which was landing on every English
    // marketplace page. Setting a field replaces it outright.
    description,
    keywords: null,
    openGraph: { title: siteName, description, siteName, locale: isEn ? 'en_US' : 'ar_SA' },
    twitter: { title: siteName, description },

    // The company name is a proper noun, but it has an English form — the
    // inherited value was the Arabic one on every page.
    authors: [{ name: isEn ? 'Alromaih Cars' : 'الرميح للسيارات' }],
    creator: isEn ? 'Alromaih Cars' : 'الرميح للسيارات',
    publisher: isEn ? 'Alromaih Cars' : 'الرميح للسيارات',

    robots: { index: false, follow: false },
  };
}

export default async function MarketplaceLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return children;
}
