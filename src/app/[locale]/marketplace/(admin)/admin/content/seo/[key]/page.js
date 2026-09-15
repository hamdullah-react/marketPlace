import Link from 'next/link';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { Skeleton } from '@/components/ui/skeleton';
import { readPageSeo, readSiteSettings } from '@/marketplace/db/queries/site';
import { BRAND_FALLBACK, SEO_PAGE_BY_KEY, SITE_URL } from '@/marketplace/lib/sitePages';
import PageSeoForm from '../../../../_components/PageSeoForm';
import SiteSetupNote from '../../../../_components/SiteSetupNote';
import LanguageSqlNote from '../../../../_components/LanguageSqlNote';

export const instant = false;

export const metadata = {
  title: 'Edit page SEO',
  robots: { index: false, follow: false },
};

export default async function AdminPageSeoEditPage({ params }) {
  const { locale, key } = await params;
  setRequestLocale(locale);

  const page = SEO_PAGE_BY_KEY[key];
  if (!page) notFound();

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Link href={`/${locale}/marketplace/admin/content/seo`} className="hover:text-brand-primary">
              {t('تحسين محركات البحث', 'Pages SEO')}
            </Link>
            <span>›</span>
            <span className="text-gray-700 dark:text-gray-300">{t(page.label.ar, page.label.en)}</span>
          </nav>
          <h1 className="text-2xl font-bold text-brand-primary">
            {t(`SEO — ${page.label.ar}`, `SEO — ${page.label.en}`)}
          </h1>
          <p dir="ltr" className="mt-1 font-mono text-xs text-muted-foreground rtl:text-end">
            {SITE_URL}/{locale}/marketplace{page.path}
          </p>
        </div>

        <div className="max-w-5xl px-4 lg:px-6">
          <Suspense fallback={<Skeleton className="h-[600px] w-full rounded-xl" />}>
            <FormSection locale={locale} page={page} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function FormSection({ locale, page }) {
  await connection();
  const [{ ready, row }, settings] = await Promise.all([readPageSeo(page.key), readSiteSettings()]);
  if (!ready) return <SiteSetupNote locale={locale} />;

  const site = settings.row;
  return (
    <>
    {site && !('default_locale' in site) ? <LanguageSqlNote locale={locale} /> : null}
    <PageSeoForm
      locale={locale}
      page={page}
      row={row}
      siteUrl={SITE_URL}
      siteName={{
        ar: site?.name?.ar || BRAND_FALLBACK.name.ar,
        en: site?.name?.en || BRAND_FALLBACK.name.en,
      }}
      defaultOgImage={site?.default_og_image_url ?? ''}
      mode={site?.default_locale ?? locale}
    />
    </>
  );
}
