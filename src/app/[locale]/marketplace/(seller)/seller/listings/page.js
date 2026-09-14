import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Plus } from 'lucide-react';
import { formatPrice } from '@/marketplace/lib/listing';
import { thumbUrl, THUMB } from '@/marketplace/lib/image';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '../../../_components/Skeletons';
import {
  resolveListingsVendor, getListingsPageData,
} from './_apicalls/listingsPageApi';
import ListingsTable from '../../_components/ListingsTable';
import ListingRowActions from '../../_components/ListingRowActions';

export const metadata = {
  title: 'My Listings',
  robots: { index: false, follow: false },
};

const STATES = [
  { value: '', ar: 'الكل', en: 'All' },
  { value: 'live', ar: 'منشور', en: 'Live' },
  { value: 'pending_review', ar: 'قيد المراجعة', en: 'In review' },
  { value: 'draft', ar: 'مسودة', en: 'Draft' },
  { value: 'rejected', ar: 'مرفوض', en: 'Rejected' },
  { value: 'sold_out', ar: 'مباع', en: 'Sold' },
];

const STATE_STYLES = {
  live: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  draft: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pending_review: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  sold_out: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-400',
};

/**
 * Header, "Add a car" and the state tabs are static markup — switching tabs
 * keeps them on screen and only swaps the table for its skeleton, instead of
 * blanking the page and rebuilding it.
 *
 * The @container/main wrapper with px-4 lg:px-6 is the seller dashboard's own
 * shell, shared with the overview, catalog, analytics, enquiries and settings
 * pages. This page used to carry its own `max-w-[1600px] … lg:px-20 xl:px-28`
 * main, so it sat visibly narrower than every page either side of it in the
 * sidebar.
 */
export default async function SellerListingsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-wrap items-end justify-between gap-4 px-4 lg:px-6">
          <div>
            <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Link href={`/${locale}/marketplace/seller`} className="hover:text-brand-primary">
                {t('لوحة البائع', 'Seller')}
              </Link>
              <span>›</span>
              <span className="text-gray-700 dark:text-gray-300">{t('الإعلانات', 'Listings')}</span>
            </nav>
            <h1 className="text-2xl font-bold text-brand-primary">{t('إعلاناتي', 'My listings')}</h1>
          </div>

          <Link
            href={`/${locale}/marketplace/seller/listings/new`}
            className="raised-solid flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white"
          >
            <Plus className="h-4 w-4" />
            {t('إضافة سيارة', 'Add a car')}
          </Link>
        </div>

        {/* ── State tabs ─────────────────────────────────────────────────── */}
        <div className="px-4 lg:px-6">
          <Suspense fallback={<StateTabsSkeleton />}>
            <StateTabs searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>

        {/* ── Table ──────────────────────────────────────────────────────── */}
        <div className="px-4 lg:px-6">
          <Suspense fallback={<ListingsSkeleton />}>
            <ListingsSection searchParams={searchParams} locale={locale} isAr={isAr} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/* ── Loading shapes ──────────────────────────────────────────────────────── */

/* Widths roughly track the six tab labels, so the row does not resize when the
   real tabs land. */
function StateTabsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
      {['w-12', 'w-16', 'w-24', 'w-16', 'w-16', 'w-14'].map((w, i) => (
        <Skeleton key={i} className={`h-8 rounded-lg ${w}`} />
      ))}
    </div>
  );
}

function ListingsSkeleton() {
  return (
    <>
      {/* Mirrors the toolbar: the search box and the count line. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-full rounded-lg sm:max-w-xs" />
        <Skeleton className="h-4 w-20" />
      </div>
      {/* Seven columns now: selection, photo, car, price, status, views, actions. */}
      <TableSkeleton rows={8} cols={7} />
    </>
  );
}

/* ── Streaming sections ──────────────────────────────────────────────────── */

/* Tabs need the vendor id to keep the ?vendor selection across a tab change —
   dropping it would silently bounce the user back to the first vendor. The
   search term rides along too, so switching to "Draft" keeps what was typed. */
async function StateTabs({ searchParams, locale, t }) {
  const sp = await searchParams;
  const vendor = await resolveListingsVendor(sp?.vendor);
  const activeState = sp?.state || '';
  const q = sp?.q || '';

  const tabHref = (state) => {
    const params_ = new URLSearchParams();
    if (vendor) params_.set('vendor', vendor.id);
    if (state) params_.set('state', state);
    if (q) params_.set('q', q);
    const qs = params_.toString();
    return `/${locale}/marketplace/seller/listings${qs ? `?${qs}` : ''}`;
  };

  return (
    <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700"raised-solid >
      {STATES.map((s) => (
        <Link
          key={s.value || 'all'}
          href={tabHref(s.value)}
          className={`rounded-lg px-3 py-1.5 text-sm ${
            activeState === s.value
              ? 'bg-brand-primary text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5'
          }`}
        >
          {t(s.ar, s.en)}
        </Link>
      ))}
    </div>
  );
}

async function ListingsSection({ searchParams, locale, isAr, t }) {
  const sp = await searchParams;
  const vendor = await resolveListingsVendor(sp?.vendor);
  const activeState = sp?.state || '';
  const q = sp?.q || '';

  const { listings, total, page, pageCount, pageSize, from, to } = await getListingsPageData(
    vendor?.id,
    { state: activeState, q, page: sp?.page, size: sp?.size, locale }
  );

  const stateLabel = (state) => {
    const row = STATES.find((s) => s.value === state);
    return row ? t(row.ar, row.en) : state;
  };

  return (
    <ListingsTable
      locale={locale}
      total={total}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      from={from}
      to={to}
      vendorId={vendor?.id ?? null}
    >
      {listings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="font-semibold text-brand-primary">{t('لا توجد إعلانات', 'Nothing here')}</p>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {q
              ? t(`لا نتائج لـ "${q}".`, `Nothing matches “${q}”.`)
              : activeState
                ? t('جرّب تبويباً آخر.', 'Try another tab.')
                : t('أضف سيارتك الأولى.', 'Add your first car.')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-gray-50 text-start dark:bg-[#141414]">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                {/* Selection. Plain checkboxes with no onChange — the ticks are
                    read straight off the form by ListingsTable, so these stay
                    server markup and no row id is shipped to the browser twice.
                    `data-select-all` is how the header box is told apart from a
                    row box by the one handler on the form. */}
                <th className="w-10 ps-4 py-3">
                  <input
                    type="checkbox"
                    data-select-all=""
                    aria-label={t('تحديد الكل', 'Select all')}
                    className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)] align-middle"
                  />
                </th>
                <th className="w-16 px-4 py-3 text-start font-medium">
                  <span className="sr-only">{t('صورة', 'Photo')}</span>
                </th>
                <th className="px-4 py-3 text-start font-medium">{t('السيارة', 'Car')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('السعر', 'Price')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('الحالة', 'Status')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('المشاهدات', 'Views')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {listings.map((l) => (
                <tr key={l.id} className="bg-white dark:bg-[#1a1a1a]">
                  <td className="ps-4 py-3">
                    <input
                      type="checkbox"
                      name="listingIds"
                      value={l.id}
                      aria-label={l.title}
                      className="h-4 w-4 cursor-pointer accent-[var(--brand-primary)] align-middle"
                    />
                  </td>
                  {/* The photo, second — it is how a seller recognises their own
                      car at a glance, faster than reading a title that starts
                      with the same brand as the four rows around it. Served
                      through the storage transform at grid size rather than the
                      full upload, so twenty rows are not twenty full-size
                      photos. A listing with no photo keeps the same footprint,
                      so rows never change height. */}
                  <td className="ps-4 py-3">
                    {l.image ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={thumbUrl(l.image, THUMB.icon)}
                        alt=""
                        loading="lazy"
                        className="h-11 w-14 rounded-md border border-gray-200 object-cover dark:border-gray-700"
                      />
                    ) : (
                      <div className="flex h-11 w-14 items-center justify-center rounded-md border border-dashed border-gray-300 text-[9px] text-gray-400 dark:border-gray-600">
                        {t('بلا صورة', 'No photo')}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-brand-primary">{l.title}</p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {l.city}
                      {l.attributes?.year ? ` · ${l.attributes.year}` : ''}
                      {l.attributes?.mileage_km != null
                        ? ` · ${Number(l.attributes.mileage_km).toLocaleString(isAr ? 'ar-SA' : 'en')} ${t('كم', 'km')}`
                        : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-semibold tabular-nums text-brand-primary">
                    {formatPrice(l.price, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATE_STYLES[l.state] ?? STATE_STYLES.draft}`}>
                      {stateLabel(l.state)}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-gray-600 dark:text-gray-400">{l.views}</td>
                  <td className="px-4 py-3 text-end">
                    <ListingRowActions
                      locale={locale}
                      listing={{ id: l.id, state: l.state, title: l.title }}
                      vendorId={vendor?.id ?? null}
                      publicPath={`/${locale}${l.path}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ListingsTable>
  );
}
