import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { readBlogPost } from '@/marketplace/db/queries/blog';
import { readSiteSettings } from '@/marketplace/db/queries/site';
import { localized } from '@/marketplace/lib/listing';
import BlogPostForm from '../../../../_components/BlogPostForm';

export const instant = false;

/**
 * Writing one article.
 *
 * The slug `new` is the blank form rather than a separate route: one form, one
 * set of fields, one place a change has to be made. The form moves the URL to
 * the real slug after the first save, so the second save is an update.
 */
export default async function AdminBlogEditPage({ params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const creating = slug === 'new';

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Link
              href={`/${locale}/marketplace/admin/content/blog`}
              className="hover:text-brand-primary"
            >
              {t('المدونة', 'Blog')}
            </Link>
            <span>›</span>
            <span className="text-gray-700 dark:text-gray-300">
              {creating ? t('مقال جديد', 'New article') : t('تحرير', 'Edit')}
            </span>
          </nav>
          <h1 className="text-2xl font-bold text-brand-primary">
            {creating ? t('مقال جديد', 'New article') : t('تحرير المقال', 'Edit article')}
          </h1>
        </div>

        <div className="max-w-5xl px-4 lg:px-6">
          <Suspense fallback={<Skeleton className="h-[560px] w-full rounded-xl" />}>
            <FormSection locale={locale} slug={slug} creating={creating} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function FormSection({ locale, slug, creating }) {
  await connection();

  const [post, settings] = await Promise.all([
    creating ? Promise.resolve(null) : readBlogPost(slug),
    readSiteSettings(),
  ]);

  // An article that was deleted in another tab, or a slug typed by hand.
  if (!creating && !post) notFound();

  return (
    <BlogPostForm
      locale={locale}
      post={post}
      /* Which language fields to show follows the site's own setting, exactly
         as every other admin form does — 'both' only when the platform really
         is bilingual. */
      mode={settings.row?.default_locale ?? locale}
      key={post?.id ?? 'new'}
    />
  );
}

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  if (slug === 'new') return { title: 'New article', robots: { index: false, follow: false } };

  const post = await readBlogPost(slug);
  return {
    title: post ? localized(post.title, locale) || slug : 'Edit article',
    robots: { index: false, follow: false },
  };
}
