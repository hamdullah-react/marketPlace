import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { ENTITIES, ENTITY_KEYS } from '@/marketplace/lib/catalog-entities';
import TemplateManager from '../../_components/TemplateManager';
import { getTemplates } from '../../_actions/catalog-templates';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CatalogTableSkeleton } from '../../../_components/Skeletons';
import {
  getCatalogPageData, getCatalogVendors, resolveEntity, TEMPLATES_TAB,
} from './_apicalls/catalogPageApi';
import CatalogManager from '../../_components/CatalogManager';

export const metadata = {
  title: 'Catalog',
  robots: { index: false, follow: false },
};

/**
 * Title and the seven entity tabs are static — they come from the ENTITIES
 * registry, not the database — so they render in the first chunk and the page
 * never blanks.
 *
 * The table skeleton shows on a fresh load of the route. On a tab or page
 * switch React deliberately keeps the previous table on screen until the new
 * rows arrive rather than flashing back to a skeleton; the pending feedback
 * for those belongs on the control the user clicked, which is why
 * CatalogManager drives its own transition state.
 */
export default async function CatalogPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);


  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('الكتالوج', 'Catalog')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {/* Was "shared reference data — an edit here is visible to every
                seller", which described the catalog before it became
                per-seller. A seller reading that while looking at their own
                empty tab has no idea which of the two is true. */}
            {t(
              'الماركات والموديلات والمواصفات التي تبيعها. ثبّت قالباً لتعبئتها، أو أضف ما تحتاجه يدوياً.',
              'The brands, models and specifications you sell. Install a template to fill it, or add just what you need.'
            )}
          </p>
        </div>

        {/* ONE loading step. These sections had a boundary each and finished at
            different moments, so the page filled in piece by piece and read as
            loading more than once. One boundary swaps every skeleton for the
            finished page together. */}
        <Suspense
          fallback={
            <>
        {/* ── Entity tabs ────────────────────────────────────────────────── */}
        <div className="px-4 lg:px-6">
          <TabsRow locale={locale} t={t} />
        </div>

        <div className="px-4 lg:px-6">
          <CatalogTableSkeleton rows={8} />
        </div>
            </>
          }
        >
        {/* ── Entity tabs ────────────────────────────────────────────────── */}
        <div className="px-4 lg:px-6">
          <Tabs searchParams={searchParams} locale={locale} t={t} />
        </div>

        <div className="px-4 lg:px-6">
          <Manager searchParams={searchParams} locale={locale} t={t} />
        </div>
        </Suspense>
      </div>
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────────────────────
   Rendered twice: once as the fallback with nothing selected, once for real
   with the active tab underlined. The entity list is static either way, so the
   row never changes height.
   ------------------------------------------------------------------------ */

function TabsRow({ locale, t, active = null, vendorId = null }) {
  const tabHref = (key) => {
    const p = new URLSearchParams();
    p.set('entity', key);
    if (vendorId) p.set('vendor', vendorId);
    return `/${locale}/marketplace/seller/catalog?${p.toString()}`;
  };

  return (
    <div className="flex flex-wrap gap-1 border-b">
      {ENTITY_KEYS.map((key) => (
        <Link
          key={key}
          href={tabHref(key)}
          className={`border-b-2 px-3 py-2 text-sm transition-colors ${
            active === key
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-muted-foreground hover:text-brand-primary'
          }`}
        >
          {t(ENTITIES[key].ar, ENTITIES[key].en)}
        </Link>
      ))}

      {/* Last, and separated: everything to its left edits rows, this one
          brings rows in. A vendor looking at an empty Brands tab should find
          the way to fill it at the end of the same row. */}
      <Link
        href={tabHref(TEMPLATES_TAB)}
        className={`ms-auto border-b-2 px-3 py-2 text-sm transition-colors ${
          active === TEMPLATES_TAB
            ? 'border-brand-primary text-brand-primary'
            : 'border-transparent text-muted-foreground hover:text-brand-primary'
        }`}
      >
        {t('القوالب', 'Templates')}
      </Link>
    </div>
  );
}

async function Tabs({ searchParams, locale, t }) {
  const sp = await searchParams;
  const vendors = await getCatalogVendors();
  // Matched against the caller's own list, never taken verbatim: `?vendor=`
  // arrives from the URL, and reading it straight through handed any seller
  // another seller's data by editing one query parameter. An id that is not
  // theirs falls back to their first showroom rather than erroring — a stale
  // link should degrade to their own data, not to a refusal.
  const vendorId = vendors.find((v) => v.id === sp?.vendor)?.id ?? vendors[0]?.id ?? null;

  return <TabsRow locale={locale} t={t} active={resolveEntity(sp?.entity)} vendorId={vendorId} />;
}

/* ── Streaming table ─────────────────────────────────────────────────────── */

async function Manager({ searchParams, locale, t }) {
  const sp = await searchParams;
  const vendors = await getCatalogVendors();
  const vendorId = vendors.find((v) => v.id === sp?.vendor)?.id ?? vendors[0]?.id ?? null;

  // Templates read from disk, not from the database — no vendor, no paging,
  // no entity config.
  if (resolveEntity(sp?.entity) === TEMPLATES_TAB) {
    // Scoped to the showroom being viewed: "Installed" has to mean installed
    // HERE, or every new seller opens the tab to six templates they never
    // chose and a Remove button for a catalog they cannot see.
    const templates = await getTemplates(vendorId);
    return <TemplateManager locale={locale} templates={templates} vendorId={vendorId} />;
  }

  // The Kinds tab used to sit here. Option kinds are gone — specifications
  // carry what they described — so the branch, its loader and KindManager have
  // nothing left to show.
  let data = null;
  let loadError = null;

  try {
    data = await getCatalogPageData(sp ?? {}, { vendorId });
  } catch (err) {
    loadError = err.message;
  }

  if (loadError || !data) {
    // The cause belongs in the log, not on a seller's screen.
    console.error('[seller/catalog] load failed:', loadError);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('الكتالوج غير متاح حالياً', 'The catalog is unavailable right now')}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>{t('حاول تحديث الصفحة بعد قليل.', 'Try refreshing in a moment.')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <CatalogManager
      locale={locale}
      entity={data.entityKey}
      items={data.items}
      total={data.total}
      page={data.page}
      pageSize={data.pageSize}
      pageCount={data.pageCount}
      parents={data.parents}
      kinds={data.kinds}
      categories={data.categories}
      vendorId={vendorId}
      assets={data.assets}
      fieldMode={data.fieldMode}
    />
  );
}
