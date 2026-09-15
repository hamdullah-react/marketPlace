import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableSkeleton } from '../../../_components/Skeletons';
import { getViewer } from '@/marketplace/auth/session';
import { listUsers } from '@/marketplace/db/queries/admin';
import { localized } from '@/marketplace/lib/listing';
import UserRowActions from '../../_components/UserRowActions';

export const instant = false;

export const metadata = {
  title: 'Users',
  robots: { index: false, follow: false },
};

const PER_PAGE = 20;

const ROLE_STYLES = {
  admin: 'bg-brand-gold text-[#2a2100]',
  staff: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  buyer: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};

export default async function AdminUsersPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('المستخدمون', 'Users')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('كل الحسابات في السوق — المشترون والبائعون والمسؤولون.', 'Every account on the marketplace — buyers, sellers and admins.')}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<UsersSkeleton />}>
            <UsersSection searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function UsersSkeleton() {
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Skeleton className="h-10 w-full rounded-lg sm:max-w-xs" />
        <Skeleton className="h-4 w-20" />
      </div>
      <TableSkeleton rows={8} cols={6} />
    </>
  );
}

function initialsOf(name = '') {
  return String(name).trim().split(/\s+/).slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase() || '?';
}

async function UsersSection({ searchParams, locale }) {
  const sp = await searchParams;
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const nf = (n) => Number(n ?? 0).toLocaleString(isAr ? 'ar-SA' : 'en');
  const date = (iso) =>
    iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const q = typeof sp?.q === 'string' ? sp.q.slice(0, 100) : '';
  const page = Math.max(1, Number(sp?.page) || 1);

  const [viewer, { users, total }] = await Promise.all([
    getViewer(),
    listUsers({ page, perPage: PER_PAGE, q }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const base = `/${locale}/marketplace/admin/customers`;
  const href = (p) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (p > 1) u.set('page', String(p));
    const s = u.toString();
    return `${base}${s ? `?${s}` : ''}`;
  };

  const roleLabel = (role) =>
    role === 'admin' ? t('مسؤول', 'Admin') : role === 'staff' ? t('موظف', 'Staff') : t('مستخدم', 'User');

  return (
    <>
      <form action={base} className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            name="q"
            defaultValue={q}
            placeholder={t('ابحث بالبريد أو الاسم أو الجوال', 'Search email, name or phone')}
            className="raised h-10 w-full rounded-lg ps-9 pe-3 text-sm outline-none"
          />
        </div>
        <span className="text-sm text-muted-foreground">{t(`${nf(total)} حساب`, `${nf(total)} accounts`)}</span>
      </form>

      {users.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 py-16 text-center dark:border-gray-700">
          <p className="font-semibold text-brand-primary">{t('لا يوجد مستخدمون', 'No users found')}</p>
          {q ? <p className="mt-1 text-sm text-muted-foreground">{t(`لا نتائج لـ "${q}".`, `Nothing matches “${q}”.`)}</p> : null}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-gray-50 dark:bg-[#141414]">
              <tr className="text-xs text-gray-500 dark:text-gray-400">
                <th className="px-4 py-3 text-start font-medium">{t('المستخدم', 'User')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('الصلاحية', 'Role')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('المعارض', 'Showrooms')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('انضم', 'Joined')}</th>
                <th className="px-4 py-3 text-start font-medium">{t('آخر دخول', 'Last sign-in')}</th>
                <th className="px-4 py-3 text-end font-medium">{t('إجراءات', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {users.map((u) => (
                <tr key={u.id} className="bg-white dark:bg-[#1a1a1a]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.avatarUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={u.avatarUrl} alt="" referrerPolicy="no-referrer" className="size-9 shrink-0 rounded-full object-cover" />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
                          {initialsOf(u.name || u.email)}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium text-brand-primary">
                          {u.name || t('بدون اسم', 'No name')}
                          {viewer?.userId === u.id ? (
                            <span className="ms-1.5 text-xs font-normal text-muted-foreground">({t('أنت', 'you')})</span>
                          ) : null}
                        </p>
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400" dir="ltr">{u.email}</p>
                        {!u.confirmed ? (
                          <p className="text-[11px] text-amber-600">{t('البريد غير مؤكد', 'Email not confirmed')}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${ROLE_STYLES[u.role] ?? ROLE_STYLES.buyer}`}>
                      {roleLabel(u.role)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                    {u.showrooms.length
                      ? u.showrooms.map((s) => (
                          <Link key={s.id} href={`/${locale}/marketplace/vendors/${s.slug}`} className="block truncate hover:text-brand-primary">
                            {localized(s.name, locale)}
                          </Link>
                        ))
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-600 dark:text-gray-400">{date(u.createdAt)}</td>
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-600 dark:text-gray-400">{date(u.lastSignInAt)}</td>
                  <td className="px-4 py-3 text-end">
                    <UserRowActions locale={locale} user={u} isSelf={viewer?.userId === u.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t(`صفحة ${nf(page)} من ${nf(pageCount)}`, `Page ${page} of ${pageCount}`)}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={href(page - 1)} className="raised rounded-lg px-3 py-1.5">{t('السابق', 'Previous')}</Link>
            ) : null}
            {page < pageCount ? (
              <Link href={href(page + 1)} className="raised rounded-lg px-3 py-1.5">{t('التالي', 'Next')}</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
