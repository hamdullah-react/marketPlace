import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { readSitePages } from '@/marketplace/db/queries/site';
import { CONTENT_PAGES, SEO_PAGE_BY_KEY } from '@/marketplace/lib/sitePages';
import SitePagesTable from '../../../_components/SitePagesTable';
import SiteSetupNote from '../../../_components/SiteSetupNote';

export const instant = false;

export const metadata = {
  title: 'Content pages',
  robots: { index: false, follow: false },
};

/** A document with at least one node — an empty editor still posts {type:'doc'}. */
const written = (doc) => Array.isArray(doc?.content) && doc.content.some((n) => n?.content?.length || n?.type === 'image');

export default async function AdminContentPagesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{t('محتوى الموقع', 'Website content')}</p>
          <h1 className="text-2xl font-bold text-brand-primary">{t('صفحة من نحن', 'About us')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              'اكتب محتوى صفحة «من نحن» بمحرر نصوص غني بالعربية والإنجليزية، ثم انشرها. تظهر في تذييل الموقع.',
              'Write the About us page with a rich text editor in Arabic and English, then publish it. It is linked from the site footer.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={2} cols={6} />}>
            <PagesSection locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function PagesSection({ locale }) {
  await connection();
  const { ready, rows } = await readSitePages();
  if (!ready) return <SiteSetupNote locale={locale} />;

  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  const items = CONTENT_PAGES.map((content) => {
    const row = bySlug.get(content.slug);
    return {
      slug: content.slug,
      seoKey: content.seoKey,
      path: SEO_PAGE_BY_KEY[content.seoKey].path,
      label: content.label,
      title: { ar: row?.title?.ar ?? '', en: row?.title?.en ?? '' },
      written: { ar: written(row?.body?.ar), en: written(row?.body?.en) },
      published: row?.published === true,
      updatedAt: row?.updated_at ?? null,
    };
  });

  return <SitePagesTable locale={locale} rows={items} />;
}
