import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireUser } from '@/marketplace/auth/session';
import { getAddresses } from '@/marketplace/db/queries/account';
import { Skeleton } from '@/components/ui/skeleton';
import AddressBook from '../../_components/AddressBook';

export const metadata = {
  title: 'Addresses',
  robots: { index: false, follow: false },
};

/**
 * The address book.
 *
 * Heading and breadcrumb are static so they paint immediately; only the list
 * streams. The whole of the interactive part is one client component, because
 * adding, editing and deleting all share the same form and the same set of
 * validation messages.
 */
export default async function AddressesPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <nav className="mb-2 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
        <Link href={`/${locale}/marketplace/account`} className="hover:text-brand-primary">
          {t('حسابي', 'My account')}
        </Link>
        <span>›</span>
        <span className="text-gray-700 dark:text-gray-300">{t('العناوين', 'Addresses')}</span>
      </nav>

      <h1 className="text-2xl font-bold text-brand-primary sm:text-3xl">
        {t('العناوين', 'Addresses')}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {t(
          'تُستخدم عند الطلب والتسليم. العنوان الافتراضي هو المختار تلقائياً.',
          'Used when you order and when a car is delivered. The default one is picked automatically.'
        )}
      </p>

      <Suspense fallback={<BookSkeleton />}>
        <Book locale={locale} />
      </Suspense>
    </div>
  );
}

async function Book({ locale }) {
  const viewer = await requireUser();

  // An empty list and a failed read look the same to the component, and that is
  // the right call here: either way the answer is "add one", and a database
  // error message on a buyer's address page helps nobody.
  const addresses = await getAddresses(viewer.userId).catch(() => []);

  return <AddressBook locale={locale} addresses={addresses} />;
}

function BookSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-2 h-3 w-40" />
          <Skeleton className="mt-1.5 h-3 w-24" />
          <Skeleton className="mt-1.5 h-3 w-56" />
        </div>
      ))}
    </div>
  );
}
