import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { readSitePage, readSiteSettings } from '@/marketplace/db/queries/site';
import { CONTENT_PAGE_BY_SLUG, SEO_PAGE_BY_KEY } from '@/marketplace/lib/sitePages';
import SitePageForm from '../../../../_components/SitePageForm';
import SiteSetupNote from '../../../../_components/SiteSetupNote';
import LanguageSqlNote from '../../../../_components/LanguageSqlNote';

export const instant = false;

export const metadata = {
  title: 'Edit page',
  robots: { index: false, follow: false },
};

export default async function AdminContentPageEditPage({ params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const content = CONTENT_PAGE_BY_SLUG[slug];
  if (!content) notFound();

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const page = SEO_PAGE_BY_KEY[content.seoKey];

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Link href={`/${locale}/marketplace/admin/content/pages`} className="hover:text-brand-primary">
              {t('صفحات المحتوى', 'Content pages')}
            </Link>
            <span>›</span>
            <span className="text-gray-700 dark:text-gray-300">{t(content.label.ar, content.label.en)}</span>
          </nav>
          <h1 className="text-2xl font-bold text-brand-primary">{t(content.label.ar, content.label.en)}</h1>
        </div>

        <div className="max-w-5xl px-4 lg:px-6">
          <Suspense fallback={<Skeleton className="h-[520px] w-full rounded-xl" />}>
            <FormSection locale={locale} content={content} path={page.path} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function FormSection({ locale, content, path }) {
  await connection();
  const [{ ready, row }, settings] = await Promise.all([readSitePage(content.slug), readSiteSettings()]);
  if (!ready) return <SiteSetupNote locale={locale} />;

  return (
    <>
    {settings.row && !('default_locale' in settings.row) ? <LanguageSqlNote locale={locale} /> : null}
    <SitePageForm
      locale={locale}
      mode={settings.row?.default_locale ?? locale}
      slug={content.slug}
      row={row}
      viewHref={`/${locale}/marketplace${path}`}
      seoHref={`/${locale}/marketplace/admin/content/seo/${content.seoKey}`}
    />
    </>
  );
}
