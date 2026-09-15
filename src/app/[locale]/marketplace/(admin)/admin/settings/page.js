import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { SettingsFormSkeleton } from '../../../_components/Skeletons';
import { readSiteLanguages, readSiteSettings } from '@/marketplace/db/queries/site';
import SiteSettingsForm from '../../_components/SiteSettingsForm';
import SiteSetupNote from '../../_components/SiteSetupNote';

export const instant = false;

export const metadata = {
  title: 'Settings',
  robots: { index: false, follow: false },
};

/**
 * Same shape as the seller's Store settings: the heading renders immediately,
 * and the tabbed form streams in behind the same skeleton.
 */
export default async function AdminSettingsPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('إعدادات المنصة', 'Platform settings')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'اسم التطبيق وشعاره، ولغات الموقع، وبيانات التواصل، وإعدادات SEO العامة.',
              'The app name and logo, the site’s languages, contact details and the site-wide SEO defaults.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<SettingsFormSkeleton />}>
            <Settings locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Settings({ locale }) {
  await connection();
  const [settings, langs] = await Promise.all([readSiteSettings(), readSiteLanguages()]);
  if (!settings.ready || !langs.ready) return <SiteSetupNote locale={locale} />;

  return <SiteSettingsForm locale={locale} row={settings.row} languages={langs.languages} />;
}
