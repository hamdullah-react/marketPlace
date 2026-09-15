import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { readPageSeoRows } from '@/marketplace/db/queries/site';
import { SEO_PAGES } from '@/marketplace/lib/sitePages';
import PageSeoTable from '../../../_components/PageSeoTable';
import SiteSetupNote from '../../../_components/SiteSetupNote';

export const instant = false;

export const metadata = {
  title: 'Pages SEO',
  robots: { index: false, follow: false },
};

export default async function AdminPagesSeoPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
          <div>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{t('محتوى الموقع', 'Website content')}</p>
            <h1 className="text-2xl font-bold text-brand-primary">{t('تحسين محركات البحث', 'Pages SEO')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                'ما تراه محركات البحث ووسائل التواصل لكل صفحة عامة: العنوان والوصف والكلمات المفتاحية وبطاقة المشاركة والفهرسة وخريطة الموقع والبيانات المنظمة. صفحات السيارات والمعارض تُدار من نموذج كل إعلان ومعرض.',
                'What search engines and social apps see for every public page: title, description, keywords, share card, indexing, sitemap and structured data. Car and showroom pages are managed from each listing and storefront.'
              )}
            </p>
          </div>
          <a
            href="/sitemap.xml"
            target="_blank"
            rel="noopener noreferrer"
            className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-primary"
          >
            <ExternalLink className="h-4 w-4" />
            sitemap.xml
          </a>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={8} cols={7} />}>
            <SeoSection locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function SeoSection({ locale }) {
  await connection();
  const { ready, rows } = await readPageSeoRows();
  if (!ready) return <SiteSetupNote locale={locale} />;

  const byKey = new Map(rows.map((r) => [r.page_key, r]));
  const items = SEO_PAGES.map((page) => {
    const row = byKey.get(page.key);
    return {
      key: page.key,
      group: page.group,
      label: page.label,
      path: page.path,
      title: {
        ar: row?.meta_title?.ar || page.title.ar,
        en: row?.meta_title?.en || page.title.en,
      },
      index: row ? row.seo_index !== false : page.index,
      customised: Boolean(row),
      updatedAt: row?.updated_at ?? null,
    };
  });

  return <PageSeoTable locale={locale} items={items} />;
}
