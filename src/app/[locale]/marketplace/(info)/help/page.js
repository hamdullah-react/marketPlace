import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { BookOpen, ChevronLeft, ChevronRight, LifeBuoy, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HELP_CATEGORIES, HELP_ARTICLES, articlesIn } from '@/marketplace/lib/help-articles';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/** Managed on Admin → Website content → Pages SEO (defaults in lib/sitePages.js). */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('help', locale);
}

/**
 * Help centre index.
 *
 * Static content, so no data fetching and no Suspense — this page is one of the
 * few in the marketplace that can render entirely from the shell.
 */
export default async function HelpPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const Arrow = isAr ? ChevronLeft : ChevronRight;

  return (
    <main className="mx-auto w-full max-w-[1100px] px-4 py-10 sm:px-8">
      <SeoJsonLd pageKey="help" locale={locale} />
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-brand-primary">{t('مركز المساعدة', 'Help centre')}</h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'كل ما تحتاجه لإدارة إعلاناتك ومتجرك.',
              'Everything you need to run your listings and your store.'
            )}
          </p>
        </div>
      </div>

      {/* ── Categories ───────────────────────────────────────────────────── */}
      <div className="mt-8 space-y-8">
        {HELP_CATEGORIES.map((cat) => {
          const articles = articlesIn(cat.id);
          if (!articles.length) return null;

          return (
            <section key={cat.id}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                {t(cat.ar, cat.en)}
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {articles.map((a) => (
                  <Link
                    key={a.slug}
                    href={`/${locale}/marketplace/help/${a.slug}`}
                    className="group rounded-xl border p-4 transition-colors hover:border-brand-primary"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-brand-primary">{t(a.titleAr, a.titleEn)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {t(a.summaryAr, a.summaryEn)}
                        </p>
                      </div>
                      <Arrow className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:text-brand-primary" />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Still stuck ──────────────────────────────────────────────────── */}
      <Card className="mt-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4" />
            {t('لم تجد ما تبحث عنه؟', 'Not finding what you need?')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            {t(
              'تواصل معنا وسنساعدك — اذكر رابط الإعلان إن كان السؤال عنه.',
              'Get in touch and we will help. Include the listing link if your question is about one.'
            )}
          </p>
          <Link
            href={`/${locale}/contact-us`}
            className="raised-solid mt-4 inline-block rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white"
          >
            {t('تواصل معنا', 'Contact us')}
          </Link>
        </CardContent>
      </Card>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t(`${HELP_ARTICLES.length} مقالة`, `${HELP_ARTICLES.length} articles`)}
      </p>
    </main>
  );
}
