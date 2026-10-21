import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { buildSitemap, summarise } from '@/marketplace/seo/sitemapData';
import SitemapViewer from '../../../_components/SitemapViewer';

/**
 * Admin → Website content → Sitemap.
 *
 * Reads the SAME builder /sitemap.xml is made from, so the screen cannot
 * describe a file other than the one being served. See sitemapData.js for why
 * that mattered enough to move the build out of app/sitemap.js.
 */
export const instant = false;

export const metadata = {
  title: 'Sitemap',
  robots: { index: false, follow: false },
};

export default async function AdminSitemapPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
            {t('محتوى الموقع', 'Website content')}
          </p>
          <h1 className="text-2xl font-bold text-brand-primary">
            {t('خريطة الموقع', 'Sitemap')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              'كل رابط تُرسله إلى محركات البحث، مجمّعاً حسب النوع، مع التكرار والأولوية وتاريخ آخر تعديل وعدد الصور — وما استُبعد ولماذا. تُبنى من قاعدة البيانات، فلا شيء هنا يُكتب يدوياً.',
              'Every URL you submit to search engines, grouped by type, with frequency, priority, last modified and image counts — and what was left out, with the reason. It is built from the database; nothing here is written by hand.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={8} cols={5} />}>
            <SitemapSection locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function SitemapSection({ locale }) {
  /* The build reads live tables, so the shell streams and this part waits —
     the same shape every other admin table on this dashboard uses. */
  await connection();

  const report = await buildSitemap();
  const summary = summarise(report);

  /**
   * Dates are serialised on the way to the client component.
   *
   * buildSitemap returns real Date objects because that is what Next's sitemap
   * expects, and a Date crossing the server/client boundary is fine — but
   * `lastModified` is then rendered by code that also has to cope with the
   * `undefined` entries (brands and help have no date of their own). Passing
   * ISO strings makes both cases one case.
   */
  const plain = {
    ...report,
    groups: Object.fromEntries(
      Object.entries(report.groups).map(([key, entries]) => [
        key,
        entries.map((e) => ({
          ...e,
          lastModified: e.lastModified ? new Date(e.lastModified).toISOString() : null,
        })),
      ])
    ),
  };

  return (
    <SitemapViewer
      report={plain}
      summary={{ ...summary, lastModified: summary.lastModified ? new Date(summary.lastModified).toISOString() : null }}
      locale={locale}
    />
  );
}
