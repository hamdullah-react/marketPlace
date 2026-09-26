import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ExternalLink, Plus } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { readBlogBanner, readBlogPosts } from '@/marketplace/db/queries/blog';
import { readSiteSettings } from '@/marketplace/db/queries/site';
import BlogBannerForm from '../../../_components/BlogBannerForm';
import BlogPostsTable from '../../../_components/BlogPostsTable';

export const instant = false;

export const metadata = {
  title: 'Blog',
  robots: { index: false, follow: false },
};

/**
 * Every article, drafts included.
 *
 * Laid out like Pages SEO next door — counts, filters, one table, a 3-dot menu
 * per row — because they are the same job on different content, and an admin
 * should not have to learn two screens to do it.
 */
export default async function AdminBlogPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
          <div>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
              {t('محتوى الموقع', 'Website content')}
            </p>
            <h1 className="text-2xl font-bold text-brand-primary">{t('المدونة', 'Blog')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                'مقالات تجيب على أسئلة المشترين — أدلة الشراء والمقارنات. هي المحتوى الوحيد هنا الذي يظهر في البحث قبل أن يبحث أحد عن سيارة بعينها. لكل مقال إعدادات SEO كاملة داخل صفحة تحريره.',
                'Articles that answer a buyer’s questions — guides and comparisons. They are the only content here that can be found months before somebody searches for a particular car. Each article carries its own full SEO settings, on its edit page.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/${locale}/marketplace/blog`}
              target="_blank"
              rel="noopener noreferrer"
              className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-primary"
            >
              <ExternalLink className="h-4 w-4" />
              {t('عرض المدونة', 'View blog')}
            </a>

            <Link
              href={`/${locale}/marketplace/admin/content/blog/new`}
              className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-3 py-2 text-sm font-medium text-white"
            >
              <Plus className="h-4 w-4" />
              {t('مقال جديد', 'New article')}
            </Link>
          </div>
        </div>

        {/* The banner first, because it is the top of the page it controls. Its
            own boundary, so one row's read never delays the table. */}
        <div className="px-4 lg:px-6">
          <Suspense fallback={<Skeleton className="h-16 w-full rounded-xl" />}>
            <Banner locale={locale} />
          </Suspense>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
            <Body locale={locale} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Banner({ locale }) {
  await connection();

  const [{ ready, row }, settings] = await Promise.all([readBlogBanner(), readSiteSettings()]);
  // Nothing to edit until the BLOG section has been run; Body says so already.
  if (!ready) return null;

  return (
    <BlogBannerForm
      locale={locale}
      row={row}
      /* Which language boxes to show follows the site's own setting, exactly as
         every other admin form does. */
      mode={settings.row?.default_locale ?? locale}
    />
  );
}

async function Body({ locale, t }) {
  // Uncached on purpose: an admin edits the row as it is now, not as a cached
  // public read left it.
  await connection();
  const { ready, items } = await readBlogPosts();

  if (!ready) {
    return (
      <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-6 text-sm dark:border-amber-900 dark:bg-amber-950/20">
        <p className="font-semibold text-amber-800 dark:text-amber-300">
          {t('المدونة غير مفعّلة بعد', 'The blog is not set up yet')}
        </p>
        <p className="mt-1 text-amber-800/80 dark:text-amber-300/80">
          {t(
            'شغّل قسم THE BLOG من src/marketplace/db/schema.sql على قاعدة البيانات.',
            'Run the THE BLOG section of src/marketplace/db/schema.sql on this database.'
          )}
        </p>
      </div>
    );
  }

  return <BlogPostsTable locale={locale} items={items} />;
}
