import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { BadgeDollarSign, Phone, Mail, MessageCircle } from 'lucide-react';
import { listBoosts } from '@/marketplace/db/queries/boosts';
import { sweepExpiredBoosts } from '@/marketplace/db/queries/engagement';
import { localized, formatPrice } from '@/marketplace/lib/listing';
import SafeThumb from '../../../../_components/SafeThumb';
import BoostRowActions from '../../../_components/BoostRowActions';
import BoostOrderList from '../../../_components/BoostOrderList';
import SearchBox from '../../../../_components/SearchBox';

export const instant = false;

export const metadata = {
  title: 'Boost requests',
  robots: { index: false, follow: false },
};

const TABS = [
  { value: 'pending', ar: 'بانتظار المراجعة', en: 'Waiting' },
  { value: 'active', ar: 'مميزة الآن', en: 'Running' },
  { value: 'history', ar: 'السجل', en: 'History' },
];

const STATE_STYLES = {
  pending: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
  approved: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

/**
 * A Saudi mobile as wa.me wants it: country code, digits only. "0501234567",
 * "501234567" and "+966501234567" all become "966501234567".
 */
function whatsappNumber(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.startsWith('966')) return digits;
  if (digits.startsWith('05')) return `966${digits.slice(1)}`;
  if (digits.startsWith('5') && digits.length === 9) return `966${digits}`;
  return digits;
}

/** A tab link that keeps the current search. */
function tabHref(tab, term) {
  const params = new URLSearchParams();
  if (tab !== 'pending') params.set('tab', tab);
  if (term) params.set('q', term);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default async function AdminBoostsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="flex flex-wrap items-start justify-between gap-3 px-4 lg:px-6">
          <div>
            <h1 className="text-2xl font-bold text-brand-primary">{t('طلبات التمييز', 'Boost requests')}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t(
                'السيارات المميزة تظهر أولاً في صفحة كل السيارات وفي قسم المميزة بالصفحة الرئيسية، مع شارة "مميز". تنتهي تلقائياً بعد المدة.',
                'Featured cars show first on All Cars and in the home page Featured row, with a "Featured" label. They end on their own when the time is up.'
              )}
            </p>
          </div>
          <Link
            href={`/${locale}/marketplace/admin/content/boost-plans`}
            className="raised-hover inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-primary"
          >
            <BadgeDollarSign className="h-4 w-4 text-brand-gold" />
            {t('الخطط والأسعار', 'Plans and prices')}
          </Link>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={5} cols={6} />}>
            <BoostsSection searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function BoostsSection({ searchParams, locale }) {
  const sp = await searchParams;
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const date = (iso) =>
    iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  // A plain number in the reader's own digits — no currency is fixed in code.
  const money = (n) =>
    n == null ? null : new Intl.NumberFormat(isAr ? 'ar-SA' : 'en', { maximumFractionDigits: 2 }).format(Number(n));

  const tab = TABS.some((x) => x.value === sp?.tab) ? sp.tab : 'pending';
  const term = typeof sp?.q === 'string' ? sp.q.slice(0, 80) : '';

  // Opening this page retires anything that has run out, so "Running" is true.
  await sweepExpiredBoosts({ force: true }).catch(() => {});
  const { ready, items, total = 0 } = await listBoosts({ tab, q: term });

  const stateLabel = (s) =>
    ({
      pending: t('بانتظار المراجعة', 'Waiting'),
      approved: t('موافق عليه', 'Approved'),
      rejected: t('مرفوض', 'Rejected'),
      cancelled: t('ملغى', 'Cancelled'),
      expired: t('منتهي', 'Expired'),
    })[s] ?? s;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        {TABS.map((x) => (
          <Link
            key={x.value}
            /* The term travels with the tab. Dropping it would throw an admin
               who searched a showroom back into the whole queue the moment they
               looked at another tab — which reads as the search having failed. */
            href={`/${locale}/marketplace/admin/content/featured${tabHref(x.value, term)}`}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              tab === x.value ? 'raised-solid bg-brand-primary text-white' : 'raised-hover text-gray-600 dark:text-gray-400'
            }`}
          >
            {t(x.ar, x.en)}
          </Link>
        ))}

        <div className="ms-auto flex w-full items-center gap-2 sm:w-auto">
          {term ? (
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {t(`${items.length} من ${total}`, `${items.length} of ${total}`)}
            </span>
          ) : null}
          <SearchBox
            locale={locale}
            className="w-full sm:w-64"
            placeholder={t('ابحث بالسيارة أو المعرض أو الجوال', 'Search car, showroom or phone')}
          />
        </div>
      </div>

      {!ready ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm dark:border-amber-900 dark:bg-amber-950/40">
          <p className="font-semibold text-amber-800 dark:text-amber-300">{t('التمييز غير مفعّل بعد', 'Boosts are not set up yet')}</p>
          <p className="mt-2 text-amber-700 dark:text-amber-400">
            {t(
              'افتح Supabase ← SQL Editor وشغّل القسم الأخير من src/marketplace/db/schema.sql (BOOSTS, THE VIEW COUNTER). ثم حدّث الصفحة.',
              'Open Supabase → SQL Editor and run the last section of src/marketplace/db/schema.sql (BOOSTS, THE VIEW COUNTER). Then refresh this page.'
            )}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="font-semibold text-brand-primary">
            {term
              ? t('لا نتائج لهذا البحث', 'Nothing matches that search')
              : tab === 'pending'
                ? t('لا توجد طلبات بانتظارك', 'No requests waiting')
                : t('لا شيء هنا', 'Nothing here')}
          </p>
          {term && total > 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                `يوجد ${total} طلب في هذا التبويب — جرّب كلمة أخرى.`,
                `There ${total === 1 ? 'is' : 'are'} ${total} in this tab — try another word.`
              )}
            </p>
          ) : null}
        </div>
      ) : tab === 'active' ? (
        /* Running promotions are a LIST IN ORDER, not a table: the order is the
           point, and it is what a visitor meets on the home page. Localised
           here, on the server, so the client component takes plain strings. */
        <BoostOrderList
          locale={locale}
          rows={items.map((b) => {
            const media = Array.isArray(b.listings?.media) ? b.listings.media : [];
            return {
              id: b.id,
              title: b.listings ? localized(b.listings.name, locale) : t('إعلان محذوف', 'Deleted listing'),
              vendorName: b.vendors ? localized(b.vendors.name, locale) : '',
              image: (media.find((m) => m?.primary) ?? media[0])?.url ?? null,
              /* No end date means approved and NOT paid for — the promotion is
               agreed but the car is not on the grid yet. It used to render as
               an empty string, so the one row an admin can still act on looked
               like the others with a field missing. */
            endsLabel: b.ends_at
              ? t(`ينتهي ${date(b.ends_at)}`, `ends ${date(b.ends_at)}`)
              : t('بانتظار الدفع — لم تُنشر بعد', 'awaiting payment — not live yet'),
            };
          })}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-gray-50 dark:bg-[#141414]">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="w-16 px-4 py-3"><span className="sr-only">{t('صورة', 'Photo')}</span></th>
                <th className="px-4 py-3 text-start font-medium">{t('السيارة', 'Car')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('المعرض', 'Showroom')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('المدة', 'Length')}</th>
                <th className="px-4 py-3 text-start font-medium">
                  {tab === 'pending' ? t('تاريخ الطلب', 'Requested') : t('ينتهي', 'Ends')}
                </th>
                <th className="px-4 py-3 text-start font-medium">{t('الحالة', 'Status')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((b) => {
                const media = Array.isArray(b.listings?.media) ? b.listings.media : [];
                const image = (media.find((m) => m?.primary) ?? media[0])?.url ?? null;
                return (
                  <tr key={b.id} className="bg-white align-top dark:bg-[#1a1a1a]">
                    <td className="px-4 py-3">
                      <SafeThumb src={image} className="h-11 w-14 rounded-md border object-cover" />
                    </td>
                    <td className="px-4 py-3">
                      {b.listings ? (
                        <Link
                          href={`/${locale}/marketplace/listing/${b.listings.slug}`}
                          className="font-medium text-brand-primary hover:underline"
                        >
                          {localized(b.listings.name, locale)}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t('إعلان محذوف', 'Deleted listing')}</span>
                      )}
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        {b.listings ? formatPrice(b.listings.price, locale, b.listings.currency) : ''}
                        {b.listings ? ` · ${Number(b.listings.views ?? 0).toLocaleString(isAr ? 'ar-SA' : 'en')} ${t('مشاهدة', 'views')}` : ''}
                      </p>
                      {b.note ? (
                        <p className="mt-1 max-w-xs text-xs italic text-gray-600 dark:text-gray-400">“{b.note}”</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {b.vendors ? (
                        <Link href={`/${locale}/marketplace/vendors/${b.vendors.slug}`} className="hover:text-brand-primary">
                          {localized(b.vendors.name, locale)}
                        </Link>
                      ) : '—'}
                      {/* The contact the seller sent with this request. Older
                          requests, from before the form asked, have none. */}
                      {b.contact_phone || b.contact_email ? (
                        <div className="mt-1.5 space-y-1" dir="ltr">
                          {b.contact_phone ? (
                            <div className="flex items-center gap-2">
                              <a
                                href={`tel:${b.contact_phone}`}
                                className="inline-flex items-center gap-1 tabular-nums text-gray-600 hover:text-brand-primary dark:text-gray-400"
                              >
                                <Phone className="h-3 w-3" aria-hidden="true" />
                                {b.contact_phone}
                              </a>
                              <a
                                href={`https://wa.me/${whatsappNumber(b.contact_phone)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="WhatsApp"
                                aria-label={t('واتساب', 'WhatsApp')}
                                className="text-green-600 hover:text-green-700"
                              >
                                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" />
                              </a>
                            </div>
                          ) : null}
                          {b.contact_email ? (
                            <a
                              href={`mailto:${b.contact_email}`}
                              className="flex max-w-[220px] items-center gap-1 truncate text-gray-600 hover:text-brand-primary dark:text-gray-400"
                            >
                              <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                              <span className="truncate">{b.contact_email}</span>
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums">
                      {t(`${b.days} يوم`, `${b.days} days`)}
                      {money(b.price) ? (
                        <span className="mt-0.5 block font-semibold text-brand-primary">
                          {money(b.price)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-gray-600 dark:text-gray-400">
                      {tab === 'pending' ? date(b.created_at) : date(b.ends_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${STATE_STYLES[b.state] ?? STATE_STYLES.cancelled}`}>
                        {stateLabel(b.state)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end">
                      <BoostRowActions locale={locale} boostId={b.id} tab={tab} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
