import Link from 'next/link';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Info, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  HELP_ARTICLES, HELP_CATEGORIES, findArticle, articlesIn,
} from '@/marketplace/lib/help-articles';

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
  return {
    title: isAr ? article.titleAr : article.titleEn,
    description: isAr ? article.summaryAr : article.summaryEn,
    robots: { index: false, follow: false },
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

  return (
    <main className="mx-auto w-full max-w-[760px] px-4 py-10 sm:px-8">
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
