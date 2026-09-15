import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '../../../_components/Skeletons';
import { resolveListingsVendor } from '../listings/_apicalls/listingsPageApi';
import { getVendorBoosts, getBoostableListings, getBoostPlans } from '@/marketplace/db/queries/boosts';
import { sweepExpiredBoosts } from '@/marketplace/db/queries/engagement';
import { localized } from '@/marketplace/lib/listing';
import SafeThumb from '../../../_components/SafeThumb';
import BoostRequestForm from '../../_components/BoostRequestForm';
import BoostRequestActions from '../../_components/BoostRequestActions';
import LiveBoostRefresher from '../../_components/LiveBoostRefresher';

export const metadata = {
  title: 'Promotions',
  robots: { index: false, follow: false },
};

/**
 * Promotions — where a seller asks for a car to be featured and follows the
 * request through: waiting → approved (running until a date) / rejected (with
 * the team's reason) → ended.
 */
export default async function SellerPromotionsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  const STEPS = [
    {
      icon: Send,
      title: t('١. أرسل طلباً', '1. Send a request'),
      body: t('اختر سيارة منشورة وإحدى خطط التمييز المتاحة.', 'Pick a live car and one of the available boost plans.'),
    },
    {
      icon: ShieldCheck,
      title: t('٢. يراجعه الفريق', '2. The team reviews it'),
      body: t('يوافق فريق المنصة على الطلب أو يرفضه مع السبب.', 'The platform team approves it, or rejects it with a reason.'),
    },
    {
      icon: Sparkles,
      title: t('٣. سيارتك في المقدمة', '3. Your car goes first'),
      body: t(
        'تظهر أولاً في كل السيارات وفي قسم المميزة بالرئيسية بشارة "مميز"، وتنتهي تلقائياً.',
        'It shows first on All Cars and in the home Featured row with a "Featured" label, and ends on its own.'
      ),
    },
  ];

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <LiveBoostRefresher />
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <Link href={`/${locale}/marketplace/seller`} className="hover:text-brand-primary">
              {t('لوحة البائع', 'Seller')}
            </Link>
            <span>›</span>
            <span className="text-gray-700 dark:text-gray-300">{t('الترويج', 'Promotions')}</span>
          </nav>
          <h1 className="text-2xl font-bold text-brand-primary">{t('الترويج', 'Promotions')}</h1>
        </div>

        <div className="grid grid-cols-1 gap-3 px-4 @3xl/main:grid-cols-3 lg:px-6">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="raised-card flex items-start gap-3 rounded-xl p-4">
              <span className="raised-solid flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-brand-primary">{title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{body}</span>
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<Skeleton className="h-72 w-full rounded-xl" />}>
            <RequestSection searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>

        <div className="px-4 lg:px-6">
          <h2 className="mb-3 font-semibold text-brand-primary">{t('طلباتك', 'Your requests')}</h2>
          <Suspense fallback={<TableSkeleton rows={4} cols={5} />}>
            <HistorySection searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function RequestSection({ searchParams, locale }) {
  const sp = await searchParams;
  const vendor = await resolveListingsVendor(sp?.vendor);
  const [listings, { plans }] = await Promise.all([
    getBoostableListings(vendor?.id),
    getBoostPlans({ activeOnly: true }),
  ]);

  return (
    <BoostRequestForm
      locale={locale}
      vendorId={vendor?.id ?? null}
      plans={plans}
      initialListingId={typeof sp?.listing === 'string' ? sp.listing : null}
      listings={listings.map((l) => ({ ...l, title: localized(l.name, locale) }))}
    />
  );
}

async function HistorySection({ searchParams, locale }) {
  const sp = await searchParams;
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const date = (iso) =>
    iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // A plain number in the reader's own digits — no currency is fixed in code.
  const money = (n) =>
    n == null ? '—' : new Intl.NumberFormat(isAr ? 'ar-SA' : 'en', { maximumFractionDigits: 2 }).format(Number(n));

  const vendor = await resolveListingsVendor(sp?.vendor);
  await sweepExpiredBoosts().catch(() => {});
  const { ready, items } = await getVendorBoosts(vendor?.id);

  if (!ready) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
        {t('الترويج غير متاح بعد. حاول لاحقاً.', 'Promotions are not available yet. Please try again later.')}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 py-12 text-center text-sm dark:border-gray-700">
        <p className="font-semibold text-brand-primary">{t('لا توجد طلبات بعد', 'No requests yet')}</p>
        <p className="mt-1 text-muted-foreground">{t('أرسل أول طلب ترويج من الأعلى.', 'Send your first promotion request above.')}</p>
      </div>
    );
  }

  const status = (b) => {
    if (b.state === 'pending') {
      return { label: t('بانتظار المراجعة', 'Waiting for review'), cls: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400' };
    }
    if (b.running) {
      return { label: t(`مميزة حتى ${date(b.ends_at)}`, `Featured until ${date(b.ends_at)}`), cls: 'bg-[#06170E] font-bold text-brand-gold' };
    }
    if (b.state === 'rejected') {
      return { label: t('مرفوض', 'Rejected'), cls: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400' };
    }
    if (b.state === 'cancelled') {
      return { label: t('ملغى', 'Cancelled'), cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
    }
    return { label: t('انتهى', 'Ended'), cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300' };
  };

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[720px] text-sm">
        <thead className="bg-gray-50 dark:bg-[#141414]">
          <tr className="text-xs text-gray-500 dark:text-gray-400">
            <th className="w-16 px-4 py-3"><span className="sr-only">{t('صورة', 'Photo')}</span></th>
            <th className="px-4 py-3 text-start font-medium">{t('السيارة', 'Car')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('المدة', 'Length')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('السعر', 'Price')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('تاريخ الطلب', 'Requested')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('الحالة', 'Status')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('إجراءات', 'Actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {items.map((b) => {
            const media = Array.isArray(b.listings?.media) ? b.listings.media : [];
            const image = (media.find((m) => m?.primary) ?? media[0])?.url ?? null;
            const s = status(b);
            return (
              <tr key={b.id} className="bg-white align-top dark:bg-[#1a1a1a]">
                <td className="px-4 py-3">
                  {/* Falls back to the original photo when the resize times
                      out on a large upload — see SafeThumb. */}
                  <SafeThumb src={image} className="h-11 w-14 rounded-md border object-cover" />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-brand-primary">
                    {b.listings ? localized(b.listings.name, locale) : t('إعلان محذوف', 'Deleted listing')}
                  </p>
                  {b.note ? <p className="mt-1 text-xs italic text-muted-foreground">“{b.note}”</p> : null}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums">{t(`${b.days} يوم`, `${b.days} days`)}</td>
                <td className="px-4 py-3 text-xs font-semibold tabular-nums text-brand-primary">
                  {money(b.price)}
                </td>
                <td className="px-4 py-3 text-xs tabular-nums text-gray-600 dark:text-gray-400">{date(b.created_at)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${s.cls}`}>{s.label}</span>
                  {b.state === 'rejected' && b.review_note ? (
                    <p className="mt-1.5 max-w-xs text-xs text-red-700 dark:text-red-400">
                      {t('السبب: ', 'Reason: ')}{b.review_note}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-end">
                  <BoostRequestActions
                    locale={locale}
                    boostId={b.id}
                    vendorId={vendor?.id ?? null}
                    canCancel={b.state === 'pending'}
                    canDelete={!b.running}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
