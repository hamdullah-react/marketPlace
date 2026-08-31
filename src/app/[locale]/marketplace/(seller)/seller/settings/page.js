import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { resolveSettingsVendor, getSettingsPageData } from './_apicalls/settingsPageApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SettingsFormSkeleton } from '../../../_components/Skeletons';
import SettingsForm from '../../_components/SettingsForm';
import { getViewer } from '@/marketplace/auth/session';
import { getAccountCounts } from '@/marketplace/db/queries/account';
import { localized as localizedName } from '@/marketplace/lib/listing';

export const metadata = {
  title: 'Store Settings',
  robots: { index: false, follow: false },
};

/**
 * The page heading is fixed text, so it renders immediately; only the form
 * itself waits on the vendor read, behind a skeleton shaped like the three
 * cards it will become.
 */
export default async function SellerSettingsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('إعدادات المتجر', 'Store settings')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'بيانات متجرك كما يراها المشتري، وتفضيلاتك، ونسخك الاحتياطية.',
              'How your store appears to buyers, your preferences, and your backups.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<SettingsFormSkeleton />}>
            <Settings searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ── Streaming section ───────────────────────────────────────────────────── */

async function Settings({ searchParams, locale, t }) {
  const sp = await searchParams;
  // Resolves suspended and soft-deleted vendors too — see the note in
  // _apicalls/settingsPageApi.js.
  const found = await resolveSettingsVendor(sp?.vendor);

  const { vendor, backups, counts, assets, error } = found
    ? await getSettingsPageData(found.id)
    : { vendor: null, backups: [], counts: {}, assets: [], error: null };

  // For the "delete my account" block, which is about the PERSON rather than
  // the showroom and so needs a different set of numbers than `counts` above.
  const viewer = await getViewer();
  const accountCounts = viewer
    ? await getAccountCounts(viewer.userId).catch(() => ({}))
    : {};

  /* Sellers are not developers. The technical cause goes to the server log,
     where whoever can act on it will see it; the screen gets a plain sentence
     and something to do next. */
  if (!vendor || error) {
    if (error) console.error('[seller/settings] load failed:', error);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {error
              ? t('الإعدادات غير متاحة حالياً', 'Settings are unavailable right now')
              : t('لا يوجد متجر بعد', 'No store yet')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {error ? (
            <p>{t('حاول تحديث الصفحة بعد قليل.', 'Try refreshing in a moment.')}</p>
          ) : (
            <p>
              {t(
                'لم يُربط متجر بهذا الحساب بعد. تواصل مع الدعم للبدء.',
                'No store is linked to this account yet. Contact support to get started.'
              )}
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  /* A deleted store keeps the WHOLE settings page. It used to be replaced by a
     notice, which left the seller with no way to import a backup or bring the
     store back — the one screen that offers those is this one. The deleted
     state is passed down as a banner instead. */
  return (
    <SettingsForm
      locale={locale}
      vendor={vendor}
      backups={backups}
      counts={counts}
      assets={assets}
      deletedAt={found?.deleted_at ?? null}
      /* Everything the "delete my account" block needs. Read here rather than
         inside the form: it is a client component and cannot ask who is signed
         in. Only showrooms this person OWNS — a manager leaving does not take
         the showroom with them. */
      account={{
        email: viewer?.email ?? '',
        /**
         * The signed-in person's OWN number and city, for prefilling the
         * showroom's contact details when the showroom has none of its own.
         *
         * Not the same thing as the showroom's — a dealership publishes a
         * landline and a manager has a mobile — which is why it only ever fills
         * a blank and never replaces a saved value.
         */
        phone: viewer?.phone ?? '',
        city: viewer?.city ?? '',
        counts: accountCounts,
        showrooms: (viewer?.vendors ?? [])
          .filter((v) => v.role === 'owner')
          .map((v) => ({ id: v.id, name: localizedName(v.name, locale) })),
      }}
    />
  );
}
