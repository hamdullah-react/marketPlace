import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { ExternalLink } from 'lucide-react';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { readHeroSlides, readSiteSettings } from '@/marketplace/db/queries/site';
import HeroSlidesManager from '../../../_components/HeroSlidesManager';
import SiteSetupNote from '../../../_components/SiteSetupNote';
import LanguageSqlNote from '../../../_components/LanguageSqlNote';

export const instant = false;

export const metadata = {
  title: 'Home carousel',
  robots: { index: false, follow: false },
};

export default async function AdminHomeCarouselPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
          <div>
            <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">{t('محتوى الموقع', 'Website content')}</p>
            <h1 className="text-2xl font-bold text-brand-primary">{t('شرائح الصفحة الرئيسية', 'Home carousel')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                'الصور المتحركة في أعلى الصفحة الرئيسية، بعنوان ووصف لكل لغة. رتّبها وأخفِها أو احذفها من قائمة الإجراءات.',
                'The rotating photos at the top of the home page, with a title and description in each language. Reorder, hide or delete them from the actions menu.'
              )}
            </p>
          </div>
          <a
            href={`/${locale}/marketplace`}
            target="_blank"
            rel="noopener noreferrer"
            className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-primary"
          >
            <ExternalLink className="h-4 w-4" />
            {t('عرض الصفحة الرئيسية', 'View home page')}
          </a>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={4} cols={6} />}>
            <SlidesSection locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function SlidesSection({ locale }) {
  await connection();
  const [{ ready, slides }, settings] = await Promise.all([readHeroSlides(), readSiteSettings()]);
  if (!ready) return <SiteSetupNote locale={locale} />;

  return (
    <>
    {settings.row && !('default_locale' in settings.row) ? <LanguageSqlNote locale={locale} /> : null}
    <HeroSlidesManager
      locale={locale}
      slides={slides}
      intervalSeconds={Math.round((settings.row?.hero_interval_ms ?? 6000) / 1000)}
      mode={settings.row?.default_locale ?? locale}
    />
    </>
  );
}
