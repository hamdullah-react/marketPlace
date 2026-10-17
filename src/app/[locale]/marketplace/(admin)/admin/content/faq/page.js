import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { readSiteFaqs, readSiteSettings } from '@/marketplace/db/queries/site';
import SiteFaqManager from '../../../_components/SiteFaqManager';
import SiteSetupNote from '../../../_components/SiteSetupNote';

export const instant = false;

export const metadata = {
  title: 'FAQ',
  robots: { index: false, follow: false },
};

export default async function AdminFaqPage({ params }) {
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
            {t('الأسئلة الشائعة', 'FAQ')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {t(
              'أسئلة المشترين عن السوق نفسه — الدفع، الضمان، كيف يعمل الموقع. تختلف عن مركز المساعدة، فذاك شرح للبائعين عن لوحة التحكم.',
              'What buyers ask about the marketplace itself — paying, guarantees, how it works. Different from the Help centre, which explains the dashboard to sellers.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={3} cols={2} />}>
            <FaqSectionAdmin locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function FaqSectionAdmin({ locale }) {
  /* Before the reads, like every other admin screen: without it the fetch is
     attempted during the prerender, which rejects once the prerender has
     completed and logs "fetch() rejects when the prerender is complete". */
  await connection();

  const [{ ready, faqs }, settings] = await Promise.all([readSiteFaqs(), readSiteSettings()]);

  /* `ready: false` means the FAQ section of schema.sql has not been run. The
     same note every other site-content screen shows, rather than an empty
     editor that silently fails on save. */
  if (!ready) return <SiteSetupNote locale={locale} />;

  return (
    <SiteFaqManager
      locale={locale}
      faqs={faqs}
      /* The authoring language, from the same setting the rest of the
         dashboard reads: one box per field in 'ar' or 'en', the pair in a
         popup under 'both'. */
      mode={settings.row?.default_locale ?? locale}
    />
  );
}
