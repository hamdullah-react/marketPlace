import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Info, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  HELP_ARTICLES, HELP_CATEGORIES, findArticle, articlesIn,
} from '@/marketplace/lib/help-articles';
import JsonLd from '../../../_components/JsonLd';
import { SITE_URL } from '@/marketplace/lib/sitePages';

/**
 * One help article.
 *
 * The content is static, so the whole set is prerendered — a help page that has
 * to hit a database to tell someone how to upload a photo is a help page that
 * is down exactly when the database is.
 */
export function generateStaticParams() {
  return HELP_ARTICLES.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const article = findArticle(slug);
  if (!article) return { title: 'Not found', robots: { index: false, follow: false } };

  const isAr = locale === 'ar';
  const path = `/${locale}/marketplace/help/${slug}`;

  return {
    title: isAr ? article.titleAr : article.titleEn,
    description: isAr ? article.summaryAr : article.summaryEn,

    /* A help article is the one kind of page here that can rank before anybody
       is shopping: "how do I transfer ownership in Saudi Arabia" is typed by
       people who have not heard of this marketplace. It had no canonical at
       all, which for a page that exists at two URLs — one per language — is
       how the two end up competing as duplicates of each other. */
    alternates: {
      canonical: path,
      languages: {
        ar: `/ar/marketplace/help/${slug}`,
        en: `/en/marketplace/help/${slug}`,
      },
    },

    openGraph: {
      type: 'article',
      title: isAr ? article.titleAr : article.titleEn,
      description: isAr ? article.summaryAr : article.summaryEn,
      url: path,
      locale: isAr ? 'ar_SA' : 'en_US',
    },

    // Indexable: the text is ours, written by us, and true whenever it is read
    // — it does not depend on the catalogue being real.
    robots: { index: true, follow: true },
  };
}

export default async function HelpArticlePage({ params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const article = findArticle(slug);
  // Before any Suspense boundary, so this is a real 404 and not a streamed 200.
  if (!article) notFound();

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const Arrow = isAr ? ChevronLeft : ChevronRight;

  const category = HELP_CATEGORIES.find((c) => c.id === article.category);
  const siblings = articlesIn(article.category).filter((a) => a.slug !== article.slug);

  const url = `${SITE_URL}/${locale}/marketplace/help/${slug}`;

  /**
   * TechArticle rather than Article: this is instructions for using a thing,
   * which is the distinction schema.org draws, and it is what lets a how-to
   * answer appear as one.
   *
   * No datePublished — the articles are a constant in the source, with no date
   * to tell the truth about. A made-up one is worse than none: it would claim
   * freshness this page has not earned, and go stale on its own.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': url,
        url,
        headline: t(article.titleAr, article.titleEn),
        description: t(article.summaryAr, article.summaryEn),
        inLanguage: locale,
        articleSection: t(category?.ar, category?.en) || undefined,
        isPartOf: { '@type': 'WebSite', url: `${SITE_URL}/${locale}/marketplace` },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: t('السوق', 'Marketplace'), item: `${SITE_URL}/${locale}/marketplace` },
          { '@type': 'ListItem', position: 2, name: t('مركز المساعدة', 'Help centre'), item: `${SITE_URL}/${locale}/marketplace/help` },
          { '@type': 'ListItem', position: 3, name: t(article.titleAr, article.titleEn), item: url },
        ],
      },
    ],
  };

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-8">
      <JsonLd data={jsonLd} />
      <nav className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <Link href={`/${locale}/marketplace/help`} className="hover:text-brand-primary">
          {t('مركز المساعدة', 'Help centre')}
        </Link>
        <span>›</span>
        <span className="text-foreground">{t(category?.ar, category?.en)}</span>
      </nav>

      <h1 className="text-2xl font-bold text-brand-primary">{t(article.titleAr, article.titleEn)}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t(article.summaryAr, article.summaryEn)}</p>

      <article className="mt-8 space-y-5">
        {article.body.map((block, i) => {
          if (block.p) {
            return (
              <p key={i} className="text-sm leading-relaxed text-foreground/90">
                {t(block.p.ar, block.p.en)}
              </p>
            );
          }

          if (block.steps) {
            return (
              <ol key={i} className="space-y-3">
                {block.steps.map((step, n) => (
                  <li key={n} className="flex gap-3 text-sm leading-relaxed">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                      {n + 1}
                    </span>
                    <span className="pt-0.5">{t(step.ar, step.en)}</span>
                  </li>
                ))}
              </ol>
            );
          }

          if (block.list) {
            return (
              <ul key={i} className="space-y-2">
                {block.list.map((item, n) => (
                  <li key={n} className="flex gap-2.5 text-sm leading-relaxed">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary" />
                    <span>{t(item.ar, item.en)}</span>
                  </li>
                ))}
              </ul>
            );
          }

          // A note is where a real limitation gets said out loud, so it is
          // styled to be read rather than skimmed past.
          return (
            <div
              key={i}
              className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30"
            >
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500" />
              <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
                {t(block.note.ar, block.note.en)}
              </p>
            </div>
          );
        })}
      </article>

      {siblings.length ? (
        <section className="mt-12 border-t pt-6">
          <h2 className="mb-3 text-sm font-bold text-muted-foreground">
            {t('في نفس القسم', 'More in this section')}
          </h2>
          <ul className="space-y-2">
            {siblings.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/${locale}/marketplace/help/${a.slug}`}
                  className="group flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:border-brand-primary"
                >
                  <span className="text-sm font-medium text-brand-primary">
                    {t(a.titleAr, a.titleEn)}
                  </span>
                  <Arrow className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand-primary" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
