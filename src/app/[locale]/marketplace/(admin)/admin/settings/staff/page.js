import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { TableSkeleton } from '../../../../_components/Skeletons';
import { getViewer } from '@/marketplace/auth/session';
import { listAdmins } from '@/marketplace/db/queries/admin';
import UserRowActions from '../../../_components/UserRowActions';
import AddAdminForm from '../../../_components/AddAdminForm';

export const instant = false;

export const metadata = {
  title: 'Admins',
  robots: { index: false, follow: false },
};

export default async function AdminStaffPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">{t('المسؤولون', 'Admins')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('من يمكنه دخول لوحة الإدارة.', 'Who can open the admin panel.')}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <AddAdminForm locale={locale} />
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton rows={3} cols={3} />}>
            <AdminsTable locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function AdminsTable({ locale }) {
  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const date = (iso) =>
    iso ? new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const [viewer, admins] = await Promise.all([getViewer(), listAdmins()]);

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-gray-50 dark:bg-[#141414]">
          <tr className="text-xs text-gray-500 dark:text-gray-400">
            <th className="px-4 py-3 text-start font-medium">{t('المسؤول', 'Admin')}</th>
            <th className="px-4 py-3 text-start font-medium">{t('آخر دخول', 'Last sign-in')}</th>
            <th className="px-4 py-3 text-end font-medium">{t('إجراءات', 'Actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
          {admins.map((a) => (
            <tr key={a.id} className="bg-white dark:bg-[#1a1a1a]">
              <td className="px-4 py-3">
                <p className="font-medium text-brand-primary">
                  {a.name || t('بدون اسم', 'No name')}
                  {viewer?.userId === a.id ? (
                    <span className="ms-1.5 text-xs font-normal text-muted-foreground">({t('أنت', 'you')})</span>
                  ) : null}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400" dir="ltr">{a.email}</p>
              </td>
              <td className="px-4 py-3 text-xs tabular-nums text-gray-600 dark:text-gray-400">{date(a.lastSignInAt)}</td>
              <td className="px-4 py-3 text-end">
                <UserRowActions locale={locale} user={a} isSelf={viewer?.userId === a.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
