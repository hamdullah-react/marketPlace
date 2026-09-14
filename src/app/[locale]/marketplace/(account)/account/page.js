import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import {
  Heart, ClipboardList, CalendarDays, MapPin, Store, Phone, Mail, Car,
  ChevronLeft, ChevronRight, AlertCircle, Plus, Pencil,
} from 'lucide-react';
import { requireUser } from '@/marketplace/auth/session';
import {
  getAccountCounts, getSavedListings, getBuyerRequests, getAddresses,
} from '@/marketplace/db/queries/account';
import { Skeleton } from '@/components/ui/skeleton';
import { localized, normalizeListing } from '@/marketplace/lib/listing';
import { buyerStage } from '@/marketplace/lib/lead-stages';
import DangerZone from '../_components/DangerZone';
import { SavedCount } from '../../_components/savedStore';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'My Account',
  robots: { index: false, follow: false },
};

/**
 * The buyer's home.
 *
 * ── What changed, and why ───────────────────────────────────────────────────
 *
 * This was five tiles with counts on them: "Saved cars · 3", "My requests · 1".
 * A door with a number on it tells you almost nothing — you still have to open
 * it to find out whether the request was answered or which car you saved — so
 * every visit cost a click before the page said anything.
 *
 * It shows the CONTENT now: the three cars most recently saved, the last three
 * requests with the stage each one is at, and the default address written out.
 * The numbers are still there, as a strip across the top, because "you have 12
 * saved cars" is worth knowing at a glance — but they are the summary, not the
 * page.
 *
 * ── Addresses ───────────────────────────────────────────────────────────────
 *
 * The address block lives here, in full, rather than as a row in the header's
 * profile menu. Somebody sets an address once and then never thinks about it,
 * which makes it a poor use of a menu that is open for two seconds and a good
 * use of a page they land on deliberately.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 *
 * "My orders". The old tile linked to /marketplace/account/orders, which does
 * not exist — a 404 in a live marketplace's own account page. Nothing anywhere
 * inserts into `orders` yet and every commerce route is a stub. It comes back
 * when there is something behind it.
 *
 * The identity strip renders from the session and needs no query, so it paints
 * immediately; everything under it streams.
 */
export default async function AccountPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  // Signed out → login, and back here afterwards. proxy.js already redirects
  // /account, but the guard belongs next to the data too: proxy only reads the
  // cookie, and a layout is not re-run on navigation.
  const viewer = await requireUser();

  const initials = (viewer.fullName || viewer.email || '?')
    .split('@')[0]
    .split(/[\s._-]+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:py-12">
      {/* ── Who ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161616] sm:p-6">
        <div className="flex items-center gap-4">
          {viewer.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={viewer.avatarUrl}
              alt=""
              referrerPolicy="no-referrer"
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700"
            />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-primary text-lg font-semibold text-white">
              {initials || '?'}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-brand-primary sm:text-2xl">
              {viewer.fullName || t('حسابي', 'My account')}
            </h1>

            <div className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground sm:flex-row sm:gap-4">
              <span className="flex min-w-0 items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{viewer.email}</span>
              </span>
              {viewer.phone ? (
                <span className="flex items-center gap-1.5" dir="ltr">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  {viewer.phone}
                </span>
              ) : null}
            </div>
          </div>

          <Link
            href={`/${locale}/marketplace/complete-profile?next=${encodeURIComponent(`/${locale}/marketplace/account`)}`}
            className="hidden shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-300 sm:flex"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t('تعديل', 'Edit')}
          </Link>
        </div>

        {/* The one nudge worth making. A showroom answers a request by ringing
            the number on it, so a buyer without one can send enquiries nobody
            can act on — see `profileComplete` in auth/session.js. */}
        {viewer.profileComplete ? null : (
          <Link
            href={`/${locale}/marketplace/complete-profile?next=${encodeURIComponent(`/${locale}/marketplace/account`)}`}
            className="mt-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-start transition-colors hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-amber-900 dark:text-amber-200">
                {t('أكمل ملفك الشخصي', 'Complete your profile')}
              </span>
              <span className="block text-xs text-amber-700 dark:text-amber-300/80">
                {t(
                  'رقم الجوال والعنوان مطلوبان حتى يتمكن المعرض من الرد عليك.',
                  'A phone number and an address are what let a showroom get back to you.'
                )}
              </span>
            </span>
          </Link>
        )}
      </div>

      <Suspense fallback={<OverviewSkeleton />}>
        <Overview viewer={viewer} locale={locale} t={t} isAr={isAr} />
      </Suspense>

      {/* ── Selling ────────────────────────────────────────────────────── */}
      <div className="mt-6 flex flex-col items-start gap-4 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-6 sm:flex-row sm:items-center">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-xs dark:bg-[#1c1c1c]">
          <Store className="h-5 w-5 text-brand-primary" />
        </span>
        <div className="flex-1">
          <h2 className="font-semibold text-brand-primary">
            {viewer.vendors.length
              ? t('لديك معرض', 'You have a showroom')
              : t('تبيع سيارات؟', 'Selling cars?')}
          </h2>
          <p className="mt-0.5 text-sm text-gray-700 dark:text-gray-300">
            {viewer.vendors.length
              ? t('أدر إعلاناتك من لوحة البائع.', 'Manage your listings from the seller dashboard.')
              : t('افتح معرضك وابدأ البيع اليوم.', 'Open your showroom and start selling today.')}
          </p>
        </div>
        <Link
          href={`/${locale}/marketplace/${viewer.vendors.length ? 'seller' : 'sell'}`}
          className="raised-solid rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white"
        >
          {viewer.vendors.length ? t('لوحة البائع', 'Dashboard') : t('افتح معرضك', 'Open a showroom')}
        </Link>
      </div>

      {/* Last on the page and behind its own border, streaming separately: the
          counts it needs are the same ones the sections read, but a slow count
          must not hold up the content above it. */}
      <Suspense fallback={null}>
        <Danger viewer={viewer} locale={locale} />
      </Suspense>
    </div>
  );
}

/* ── Everything that needs the database ─────────────────────────────────── */

/**
 * One boundary, one wave of queries.
 *
 * Four reads, all roughly a 300ms round trip, none of which needs another's
 * answer. In Promise.all the section costs one of those; split across four
 * Suspense boundaries it would still cost one but would paint in four jerks,
 * and awaited in turn it would cost four. A failed read is that section
 * missing, never the page.
 */
async function Overview({ viewer, locale, t, isAr }) {
  const Arrow = isAr ? ChevronLeft : ChevronRight;

  const [counts, saved, requests, addresses] = await Promise.all([
    getAccountCounts(viewer.userId).catch(() => ({ saved: 0, requests: 0, orders: 0, bookings: 0 })),
    getSavedListings(viewer.userId, { limit: 3 }).catch(() => ({ items: [], total: 0 })),
    getBuyerRequests(viewer.userId, { limit: 3 }).catch(() => ({ items: [], total: 0 })),
    getAddresses(viewer.userId).catch(() => []),
  ]);

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  /* Test drives are counted but only shown once there is one. The route behind
     them is still a stub, and a zero linking to a "coming soon" page is two
     disappointments in one tile. */
  const stats = [
    /* `live` marks the one number that can change without leaving the page:
       un-saving from the header's Saved list, or a heart tapped in another tab
       of the same session. The rest only move on a navigation. */
    { key: 'saved', href: '/marketplace/account/saved', icon: Heart, ar: 'محفوظة', en: 'Saved', n: counts.saved, live: true },
    { key: 'requests', href: '/marketplace/account/requests', icon: ClipboardList, ar: 'طلبات', en: 'Requests', n: counts.requests },
    ...(counts.bookings > 0
      ? [{ key: 'bookings', href: '/marketplace/account/bookings', icon: CalendarDays, ar: 'تجارب قيادة', en: 'Test drives', n: counts.bookings }]
      : []),
  ];

  const sectionHead = (title, href, more) => (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">{title}</h2>
      {more ? (
        <Link href={href} className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline">
          {more}
          <Arrow className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );

  return (
    <>
      {/* ── The numbers ────────────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(({ key, href, icon: Icon, ar, en, n, live }) => (
          <Link
            key={key}
            href={`/${locale}${href}`}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-brand-primary/40 hover:shadow-xs dark:border-white/10 dark:bg-[#161616]"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
              <Icon className="h-5 w-5 text-brand-primary" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                {/* The digits are the only part that has to subscribe, so the
                    client boundary is the digits — not this page. */}
                {live ? <SavedCount fallback={n} /> : n}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{t(ar, en)}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* ── Saved cars ─────────────────────────────────────────────────── */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161616]">
        {sectionHead(
          t('السيارات المحفوظة', 'Saved cars'),
          `/${locale}/marketplace/account/saved`,
          saved.total > 3 ? t(`عرض الكل (${saved.total})`, `See all ${saved.total}`) : null,
        )}

        {saved.items.length === 0 ? (
          <Empty
            icon={Heart}
            title={t('لم تحفظ أي سيارة بعد', 'Nothing saved yet')}
            body={t(
              'اضغط القلب على أي سيارة لتجدها هنا لاحقاً.',
              'Tap the heart on any car and it waits for you here.'
            )}
            cta={t('تصفّح السيارات', 'Browse cars')}
            href={`/${locale}/marketplace/cars`}
          />
        ) : (
          <div className="space-y-1">
            {saved.items.map((row) => {
              const car = normalizeListing(row, locale);
              return (
                <Link
                  key={car.id}
                  href={`/${locale}${car.path}`}
                  className="flex items-center gap-3 rounded-xl border border-transparent p-2 transition-colors hover:border-brand-primary/30 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  <span className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 dark:bg-white/10">
                    {car.image ? (
                      /* A plain <img>: marketplace media is on its own Supabase
                         host, which is not in next.config's remotePatterns. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={car.image} alt={car.imageAlt || ''} loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <Car className="h-6 w-6 text-gray-400" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {car.title}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[car.brand?.name, car.attributes?.year, car.city].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-sm font-bold text-brand-primary">{car.priceLabel}</span>
                    {car.compareAtLabel ? (
                      <span className="block text-[11px] text-gray-400 line-through">{car.compareAtLabel}</span>
                    ) : null}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Requests ───────────────────────────────────────────────────── */}
      <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161616]">
        {sectionHead(
          t('طلباتي', 'My requests'),
          `/${locale}/marketplace/account/requests`,
          requests.total > 3 ? t(`عرض الكل (${requests.total})`, `See all ${requests.total}`) : null,
        )}

        {requests.items.length === 0 ? (
          <Empty
            icon={ClipboardList}
            title={t('لا توجد طلبات', 'No requests yet')}
            body={t(
              'اطلب السعر من أي معرض وتابع الرد من هنا.',
              'Ask a showroom for a price and follow the reply from here.'
            )}
            cta={t('تصفّح السيارات', 'Browse cars')}
            href={`/${locale}/marketplace/cars`}
          />
        ) : (
          <div className="space-y-2">
            {requests.items.map((r) => {
              const badge = buyerStage(r.stage);
              return (
                <Link
                  key={r.id}
                  href={`/${locale}/marketplace/account/requests`}
                  className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 transition-colors hover:border-brand-primary/30 hover:bg-gray-50 dark:border-white/10 dark:hover:bg-white/5"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {/* The snapshotted title, not a join — a request still
                          reads after the car is sold. See getBuyerRequests. */}
                      {r.listing_title ? localized(r.listing_title, locale) : t('طلب سعر', 'Price request')}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {[
                        r.vendors ? localized(r.vendors.name, locale) : null,
                        new Date(r.created_at).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>

                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${badge.tone}`}>
                    {t(badge.ar, badge.en)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Addresses ──────────────────────────────────────────────────────
          Written out, not linked to. This is the block that used to be a row
          in the header's profile menu — see the note there. */}
      <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#161616]">
        {sectionHead(
          t('العناوين', 'Addresses'),
          `/${locale}/marketplace/account/addresses`,
          addresses.length ? t(`إدارة (${addresses.length})`, `Manage (${addresses.length})`) : null,
        )}

        {defaultAddress ? (
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10">
              <MapPin className="h-5 w-5 text-brand-primary" />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <div className="flex items-center gap-2">
                {/* The label if they gave one ("Home", "Office"), otherwise
                    the name on the address — which is what a courier reads and
                    is more use than the words "Default address". */}
                <span className="truncate font-semibold text-gray-900 dark:text-gray-100">
                  {defaultAddress.label || defaultAddress.full_name || t('العنوان الافتراضي', 'Default address')}
                </span>
                {defaultAddress.is_default ? (
                  <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-medium text-brand-primary">
                    {t('افتراضي', 'Default')}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-muted-foreground">
                {[
                  defaultAddress.building,
                  defaultAddress.street,
                  defaultAddress.district,
                  defaultAddress.city,
                ]
                  .filter(Boolean)
                  /* An Arabic comma, which is the separator in both languages
                     here — the addresses themselves are Saudi and read in
                     Arabic order even when the interface is in English. */
                  .join('، ')}
              </p>
              {defaultAddress.phone ? (
                <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                  {defaultAddress.phone}
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <Empty
            icon={MapPin}
            title={t('لا يوجد عنوان', 'No address yet')}
            body={t(
              'يُستخدم عند الطلب والتسليم، ويساعد المعرض على الرد عليك.',
              'Used when you order and when a car is delivered — and it is what lets a showroom reach you.'
            )}
            cta={t('أضف عنواناً', 'Add an address')}
            ctaIcon={Plus}
            href={`/${locale}/marketplace/account/addresses`}
          />
        )}
      </section>
    </>
  );
}

async function Danger({ viewer, locale }) {
  const counts = await getAccountCounts(viewer.userId).catch(() => ({}));

  return (
    <DangerZone
      locale={locale}
      email={viewer.email ?? ''}
      counts={counts}
      // Only showrooms this person OWNS — a manager leaving does not take the
      // showroom with them, and the dialog must not claim otherwise.
      showrooms={viewer.vendors
        .filter((v) => v.role === 'owner')
        .map((v) => ({ id: v.id, name: localized(v.name, locale) }))}
    />
  );
}

/**
 * An empty section, with the one thing to do about it.
 *
 * Module scope, and shared by all three: an empty state that only says "nothing
 * here" is a dead end, and three hand-written versions of "nothing here, and
 * here is the way out" is how one of them ends up without the way out.
 */
function Empty({ icon: Icon, title, body, cta, href, ctaIcon: CtaIcon }) {
  return (
    <div className="py-6 text-center">
      <Icon className="mx-auto mb-2 h-8 w-8 text-gray-300 dark:text-white/20" />
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{body}</p>
      <Link
        href={href}
        className="raised-solid mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-4 py-2 text-xs font-medium text-white"
      >
        {CtaIcon ? <CtaIcon className="h-3.5 w-3.5" /> : null}
        {cta}
      </Link>
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 p-4 dark:border-white/10">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-8" />
              <Skeleton className="h-3 w-14" />
            </div>
          </div>
        ))}
      </div>

      {Array.from({ length: 3 }, (_, s) => (
        <div key={s} className="mt-4 rounded-2xl border border-gray-200 p-5 dark:border-white/10">
          <Skeleton className="mb-3 h-4 w-28" />
          <div className="space-y-2">
            {Array.from({ length: 2 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="h-14 w-20 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/5" />
                  <Skeleton className="h-2.5 w-2/5" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
