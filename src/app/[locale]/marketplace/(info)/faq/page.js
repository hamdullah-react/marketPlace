import { setRequestLocale } from 'next-intl/server';
import { getSiteFaqs } from '@/marketplace/db/queries/site';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';
import FaqSection from '@/marketplace/ui/FaqSection';
import { SITE_FAQ_FALLBACK, faqsOrFallback } from '@/marketplace/lib/faq';

/** Managed on Admin → Website content → Pages SEO. */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('faq', locale);
}

/**
 * The marketplace's own FAQ — written by an admin, read by buyers.
 *
 * Distinct from /help, which is the SELLER documentation that ships with the
 * code (src/marketplace/lib/help-articles.ts) and describes the dashboard.
 * This answers what somebody asks before they trust a marketplace with a car
 * purchase, and it changes without a deploy.
 *
 * The FAQPage structured data is emitted by FaqSection, from the same array it
 * renders — see that file for why the two must never be built separately.
 */
export default async function FaqPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  /* The admin's list, or the five fallbacks while it is empty — a public FAQ
     page that renders a heading and nothing else is worse than one answering
     the obvious questions. The markup follows the same rule: a real list is
     marked up as FAQPage, the fallback is not (see lib/faq.js). */
  const { faqs: rows } = await getSiteFaqs();
  const { faqs, isFallback } = faqsOrFallback(rows, SITE_FAQ_FALLBACK);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-8 sm:py-14">
      <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">
        {t('الأسئلة الشائعة', 'Frequently asked questions')}
      </h1>

      <p className="mt-2 text-sm text-muted-foreground">
        {t('إجابات عن أكثر ما يسأل عنه المشترون.', 'Answers to what buyers most often ask.')}
      </p>

      <FaqSection faqs={faqs} locale={locale} className="mt-6" structured={!isFallback} />
    </main>
  );
}
