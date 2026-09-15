import Link from 'next/link';
import { Suspense } from 'react';
import { connection } from 'next/server';
import { setRequestLocale } from 'next-intl/server';
import { UsersIcon, ShieldCheckIcon, SparklesIcon, BadgeDollarSignIcon } from 'lucide-react';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCardsSkeleton } from '../../_components/Skeletons';
import { getAdminStats } from '@/marketplace/db/queries/admin';

export const instant = false;

export const metadata = {
  title: 'Admin Dashboard',
  robots: { index: false, follow: false },
};

export default async function AdminPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  const SHORTCUTS = [
    {
      href: '/marketplace/admin/customers', icon: UsersIcon,
      title: t('المستخدمون', 'Users'),
      body: t('ابحث عن أي حساب، اجعله مسؤولاً أو احذفه.', 'Find any account, make it an admin or delete it.'),
    },
    {
      href: '/marketplace/admin/settings/staff', icon: ShieldCheckIcon,
      title: t('المسؤولون', 'Admins'),
      body: t('من يمكنه دخول هذه اللوحة، وإضافة مسؤول جديد.', 'Who can open this panel, and add a new admin.'),
    },
    {
      href: '/marketplace/admin/content/featured', icon: SparklesIcon,
      title: t('طلبات التمييز', 'Boost requests'),
      body: t('وافق على طلبات المعارض لتمييز سياراتها أو ارفضها.', 'Approve or reject showrooms asking to feature a car.'),
    },
    {
      href: '/marketplace/admin/content/boost-plans', icon: BadgeDollarSignIcon,
      title: t('خطط التمييز والأسعار', 'Boost plans & prices'),
      body: t('حدد مدد التمييز وأسعارها التي يراها البائعون.', 'Set the boost lengths and prices sellers can choose.'),
    },
  ];

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('لوحة الإدارة', 'Admin dashboard')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('نظرة عامة على المنصة.', 'An overview of the marketplace.')}
          </p>
        </div>

        <Suspense fallback={<StatCardsSkeleton />}>
          <Stats locale={locale} />
        </Suspense>

        <div className="grid grid-cols-1 gap-4 px-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6">
          {SHORTCUTS.map(({ href, icon: Icon, title, body }) => (
            <Link
              key={href}
              href={`/${locale}${href}`}
              className="raised-card flex items-start gap-3 rounded-xl p-4 transition-transform hover:-translate-y-0.5"
            >
              <span className="raised-solid flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block font-semibold text-brand-primary">{title}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

async function Stats({ locale }) {
  await connection();
  const s = await getAdminStats();

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const nf = (n) => (n == null ? '—' : Number(n).toLocaleString(isAr ? 'ar-SA' : 'en'));

  const CARDS = [
    {
      label: t('المستخدمون', 'Users'),
      value: nf(s.users),
      note: t(`${nf(s.admins)} مسؤول`, `${nf(s.admins)} admins`),
      to: '/marketplace/admin/customers',
    },
    {
      label: t('المعارض المعتمدة', 'Approved showrooms'),
      value: nf(s.vendors),
      note: t('معارض ظاهرة في السوق', 'Visible on the marketplace'),
      to: '/marketplace/vendors',
    },
    {
      label: t('إعلانات منشورة', 'Live listings'),
      value: nf(s.live),
      note: t(`${nf(s.featured)} مميزة الآن`, `${nf(s.featured)} featured now`),
      to: '/marketplace/cars',
    },
    {
      label: t('طلبات تمييز معلّقة', 'Pending boost requests'),
      value: nf(s.pendingBoosts),
      note: s.pendingBoosts ? t('بانتظار قرارك', 'Waiting for your decision') : t('لا شيء معلّق', 'Nothing pending'),
      to: '/marketplace/admin/content/featured',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4 lg:px-6 dark:*:data-[slot=card]:bg-card">
      {CARDS.map(({ label, value, note, to }) => (
        <Link key={label} href={`/${locale}${to}`}>
          <Card className="@container/card h-full">
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">{value}</CardTitle>
            </CardHeader>
            <CardFooter className="text-sm text-muted-foreground">{note}</CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  );
}
