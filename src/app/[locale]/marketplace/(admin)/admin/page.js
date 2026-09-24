import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import {
  UsersIcon, StoreIcon, CarIcon, MessageSquareIcon, SparklesIcon,
  BadgeDollarSignIcon, TrendingUpIcon, TrendingDownIcon, MinusIcon,
  ClipboardListIcon, TagIcon, ArrowRightIcon, ShieldCheckIcon,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCardsSkeleton } from '../../_components/Skeletons';
import { getAdminOverview } from '@/marketplace/db/queries/admin-overview';
import AdminCharts from '../_components/AdminCharts';

export const metadata = {
  title: 'Admin',
  robots: { index: false, follow: false },
};

/**
 * The admin dashboard.
 *
 * ── One read, one boundary ──────────────────────────────────────────────────
 *
 * Every panel is a cut of the same query (getAdminOverview), so the whole page
 * sits behind a single Suspense boundary and arrives at once. Streaming the
 * cards separately from the charts would show a page that assembles itself in
 * front of the reader for no gain — they come from the same round trip.
 *
 * ── Numbers that mean something ─────────────────────────────────────────────
 *
 * Every headline figure carries its change against the PREVIOUS period of the
 * same length, because a count with nothing to compare it to is not a fact an
 * admin can act on. Where there is no previous period the change is simply not
 * drawn, rather than being invented as +100%.
 */
export default async function AdminPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('لوحة الإدارة', 'Admin dashboard')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'نشاط المنصة خلال آخر ٣٠ يوماً، وما ينتظر قرارك.',
              'What the marketplace has done in the last 30 days, and what is waiting for you.'
            )}
          </p>
        </div>

        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}

/* ── The page, once the numbers are in ────────────────────────────────────── */

async function Dashboard({ locale }) {
  await connection();
  const overview = await getAdminOverview({ days: 30 });

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const nf = (n) => (n == null ? '—' : Number(n).toLocaleString(isAr ? 'ar-SA' : 'en'));

  const { kpis, queue, running, boostValue, topVendors, audit } = overview;

  const CARDS = [
    {
      icon: UsersIcon,
      label: t('المستخدمون', 'Users'),
      value: nf(kpis.users.total),
      note: t(`${nf(kpis.users.current)} جديد هذا الشهر`, `${nf(kpis.users.current)} joined this month`),
      change: kpis.users.percent,
      to: '/marketplace/admin/customers',
    },
    {
      icon: StoreIcon,
      label: t('المعارض', 'Showrooms'),
      value: nf(kpis.vendors.total),
      note: kpis.vendors.pending
        ? t(`${nf(kpis.vendors.pending)} بانتظار الاعتماد`, `${nf(kpis.vendors.pending)} awaiting approval`)
        : t('كلها معتمدة', 'All approved'),
      change: kpis.vendors.percent,
      to: '/marketplace/admin/vendors',
    },
    {
      icon: CarIcon,
      label: t('سيارات منشورة', 'Live cars'),
      value: nf(kpis.listings.total),
      note: t(`${nf(kpis.listings.featured)} مميزة الآن`, `${nf(kpis.listings.featured)} featured now`),
      change: kpis.listings.percent,
      to: '/marketplace/admin/listings',
    },
    {
      icon: MessageSquareIcon,
      label: t('طلبات المشترين', 'Buyer requests'),
      value: nf(kpis.leads.current),
      note: t('خلال آخر ٣٠ يوماً', 'In the last 30 days'),
      change: kpis.leads.percent,
      to: '/marketplace/admin/customers',
    },
  ];

  /* What is actually waiting for a human. Zero is worth showing — "nothing
     pending" is the answer an admin opens this page hoping for — but a queue
     with something in it is marked so the eye finds it first. */
  const QUEUE = [
    {
      icon: SparklesIcon,
      label: t('طلبات تمييز', 'Boost requests'),
      count: queue.boosts,
      to: '/marketplace/admin/content/featured',
    },
    {
      icon: StoreIcon,
      label: t('طلبات انضمام معارض', 'Showroom applications'),
      count: queue.vendors,
      to: '/marketplace/admin/vendors/applications',
    },
    {
      icon: ClipboardListIcon,
      label: t('إعلانات بانتظار المراجعة', 'Listings in review'),
      count: queue.drafts,
      to: '/marketplace/admin/listings/moderation',
    },
  ];

  return (
    <>
      {/* ── Headline figures ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 px-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6">
        {CARDS.map(({ icon: Icon, label, value, note, change, to }) => (
          <Link key={label} href={`/${locale}${to}`} className="group">
            <Card className="@container/card h-full transition-transform group-hover:-translate-y-0.5">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardDescription className="flex items-center gap-1.5">
                    <Icon className="size-3.5 text-brand-primary" />
                    {label}
                  </CardDescription>
                  <Change percent={change} isAr={isAr} />
                </div>
                <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                  {value}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">{note}</CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <AdminCharts locale={locale} overview={overview} />
      </div>

      {/* ── The work queue, what is running, and who is selling ─────────────── */}
      <div className="grid gap-4 px-4 @4xl/main:grid-cols-3 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-brand-primary">
              {t('بانتظار قرارك', 'Waiting for you')}
            </CardTitle>
            <CardDescription>{t('ما لا يتحرك حتى تتصرف', 'Nothing moves until you act')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {QUEUE.map(({ icon: Icon, label, count, to }) => (
              <Link
                key={label}
                href={`/${locale}${to}`}
                className="raised-hover flex items-center gap-3 rounded-lg px-3 py-2.5"
              >
                <Icon className="size-4 shrink-0 text-brand-primary" />
                <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                    count
                      ? 'bg-brand-gold text-[#2a2100]'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {nf(count)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Promotions, as a state rather than a queue: these are running right
            now and need nothing done to them. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-brand-primary">
              {t('يعمل الآن', 'Running now')}
            </CardTitle>
            <CardDescription>{t('الترويج والعروض الحية', 'Live promotions and offers')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Metric
              icon={SparklesIcon}
              label={t('تمييز فعّال', 'Active boosts')}
              value={nf(running.boosts)}
              href={`/${locale}/marketplace/admin/content/featured?tab=active`}
            />
            <Metric
              icon={TagIcon}
              label={t('عروض سارية', 'Live offers')}
              value={nf(running.offers)}
            />
            <Metric
              icon={BadgeDollarSignIcon}
              /* QUOTED, not earned: boosts are paid for off-platform, so this
                 is the value of what was approved, and saying "revenue" would
                 be claiming money the marketplace has not handled. */
              label={t('قيمة التمييز المعتمد', 'Approved boost value')}
              value={nf(boostValue)}
              href={`/${locale}/marketplace/admin/content/boost-plans`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-brand-primary">
              {t('أنشط المعارض', 'Busiest showrooms')}
            </CardTitle>
            <CardDescription>{t('بعدد السيارات المنشورة', 'By live cars')}</CardDescription>
          </CardHeader>
          <CardContent>
            {topVendors.length ? (
              <ol className="grid gap-2">
                {topVendors.map((v, i) => (
                  <li key={v.id}>
                    <Link
                      href={`/${locale}/marketplace/vendors/${v.slug}`}
                      className="raised-hover flex items-center gap-2.5 rounded-lg px-2.5 py-2"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-[10px] font-bold text-brand-primary tabular-nums">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {typeof v.name === 'string' ? v.name : v.name?.[isAr ? 'ar' : 'en'] || v.slug}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                        {nf(v.count)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                {t('لا توجد سيارات منشورة بعد.', 'No live cars yet.')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── What has been done, and by whom ─────────────────────────────────── */}
      <div className="px-4 lg:px-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base text-brand-primary">
                {t('آخر الإجراءات', 'Recent activity')}
              </CardTitle>
              <CardDescription>
                {t('من غيّر ماذا على المنصة', 'Who changed what on the platform')}
              </CardDescription>
            </div>
            <Link
              href={`/${locale}/marketplace/admin/audit-log`}
              className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
            >
              {t('السجل كامل', 'Full log')}
              <ArrowRightIcon className={`size-3.5 ${isAr ? 'rotate-180' : ''}`} />
            </Link>
          </CardHeader>
          <CardContent>
            {audit.length ? (
              <ul className="grid gap-1">
                {audit.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg px-2 py-1.5 text-xs odd:bg-muted/40"
                  >
                    <ShieldCheckIcon className="size-3.5 shrink-0 text-brand-primary" />
                    <span className="font-medium">{row.actor}</span>
                    {/* The action verb as stored — `boost.plan.update` — rather
                        than translated: these are machine names, and inventing
                        a phrase for each would go stale the moment one is
                        added. The entity beside it says what it touched. */}
                    <span className="font-mono text-[11px] text-muted-foreground">{row.action}</span>
                    <span className="ms-auto tabular-nums text-muted-foreground">
                      {new Date(row.created_at).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                {t('لا توجد إجراءات مسجّلة بعد.', 'Nothing recorded yet.')}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

/**
 * The change against the previous period.
 *
 * Green up / red down is the obvious colouring and it is WRONG for one of
 * these: more buyer requests is good, more showrooms is good, more cars is
 * good — every figure on this page rises in the direction the marketplace
 * wants. So up is the brand colour and down is amber (a note, not an alarm),
 * and the arrow carries the meaning for anyone who cannot separate the two.
 */
function Change({ percent, isAr }) {
  if (percent == null) return null;

  const up = percent > 0;
  const flat = percent === 0;
  const Icon = flat ? MinusIcon : up ? TrendingUpIcon : TrendingDownIcon;

  return (
    <span
      title={isAr ? 'مقارنة بالفترة السابقة' : 'Compared with the previous period'}
      className={`flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
        flat
          ? 'bg-muted text-muted-foreground'
          : up
            ? 'bg-brand-primary/10 text-brand-primary'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400'
      }`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {up ? '+' : ''}
      {percent}%
    </span>
  );
}

function Metric({ icon: Icon, label, value, href }) {
  const body = (
    <>
      <Icon className="size-4 shrink-0 text-brand-primary" />
      <span className="min-w-0 flex-1 truncate text-sm">{label}</span>
      <span className="text-sm font-bold tabular-nums text-brand-primary">{value}</span>
    </>
  );

  return href ? (
    <Link href={href} className="raised-hover flex items-center gap-3 rounded-lg px-3 py-2">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2">{body}</div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <StatCardsSkeleton />
      <div className="grid gap-4 px-4 @4xl/main:grid-cols-3 lg:px-6">
        <Skeleton className="h-[340px] rounded-xl @4xl/main:col-span-2" />
        <Skeleton className="h-[340px] rounded-xl" />
        <Skeleton className="h-[320px] rounded-xl @4xl/main:col-span-2" />
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
      <div className="grid gap-4 px-4 @4xl/main:grid-cols-3 lg:px-6">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </>
  );
}
