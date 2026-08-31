import { Suspense } from 'react';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorLeads, getLeadCounts } from '@/marketplace/db/queries/leads';
import { getVendorFormFields } from '@/marketplace/db/queries/forms';
import { Skeleton } from '@/components/ui/skeleton';
import LeadsTable from '../../_components/LeadsTable';

export const metadata = {
  title: 'Leads',
  robots: { index: false, follow: false },
};

/**
 * The pipeline. THE inbox.
 *
 * There used to be a Messages page beside this one, holding chat threads, and a
 * seller with two inboxes checks one of them — so a lead could sit unworked
 * because its owner was watching the other page. Everything a buyer sends
 * arrives here now, and the showroom calls or emails back on the contact
 * details the lead carries.
 */
export default async function LeadsPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">
            {t('العملاء المحتملون', 'Leads')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'ما أرسله المشترون عبر نموذجك. الأعمدة هي أسئلتك أنت.',
              'What buyers sent through your form. The columns are your own questions.'
            )}{' '}
            <Link
              href={`/${locale}/marketplace/seller/lead-form`}
              className="text-brand-primary underline underline-offset-4"
            >
              {t('عدّل النموذج', 'Edit the form')}
            </Link>
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<TableSkeleton />}>
            <Pipeline searchParams={searchParams} locale={locale} t={t} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

/**
 * Rows per page — the same ladder the Listings and Catalog tables offer, so a
 * seller does not have to relearn the controls between three tables that sit
 * next to each other in the sidebar.
 */
const PAGE_SIZES = [8, 16, 32, 64, 100];
const DEFAULT_PAGE_SIZE = 20;

async function Pipeline({ searchParams, locale, t }) {
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor ?? null);

  /**
   * The view lives in the URL: stage, search, unread and page.
   *
   * Not in React state, for the same reason as the listings table — a filtered
   * pipeline is then shareable, survives a refresh, and can be sent to a
   * colleague as "look at these". It also means the SERVER does the filtering,
   * which is the part that matters: a search that only sees the rows already
   * loaded answers "not found" for a lead that exists.
   */
  const stage = typeof sp?.stage === 'string' ? sp.stage : '';
  const q = typeof sp?.q === 'string' ? sp.q : '';
  const unread = sp?.unread === '1';

  // Clamped rather than trusted — `size` arrives from the query string, and an
  // unbounded one is a request for every lead the showroom has ever received.
  const pageSize = PAGE_SIZES.includes(Number(sp?.size)) ? Number(sp.size) : DEFAULT_PAGE_SIZE;
  const page = Math.max(1, Number(sp?.page) || 1);

  // In parallel — none of the three needs the others.
  const [{ items, total, missing, searchUnavailable }, counts, fields] = await Promise.all([
    getVendorLeads(vendorId, {
      stage,
      unread,
      q,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
    // The tab counts are for the WHOLE pipeline, deliberately: they have to
    // keep saying how many Won leads exist while the table is showing New,
    // otherwise every tab reads 0 except the one you are on.
    getLeadCounts(vendorId),
    // activeOnly false: a question switched off last week still has leads that
    // answered it, and the lead page needs its label to render their answers.
    getVendorFormFields(vendorId, { activeOnly: false }).catch(() => []),
  ]);

  if (missing) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-semibold">{t('جدول العملاء غير موجود بعد', 'The leads table does not exist yet')}</p>
        <p className="mt-1">
          {t(
            'شغّل schema.sql (القسم 21) لتفعيل هذه الصفحة.',
            'Run schema.sql (section 21) to switch this page on.'
          )}
        </p>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Counted from the rows actually returned rather than from page × size.
  // Someone can always type ?page=9 by hand, and the arithmetic version says
  // "161–180 of 12" on a page showing nothing.
  const from = items.length ? (page - 1) * pageSize + 1 : 0;
  const to = items.length ? from + items.length - 1 : 0;

  return (
    <LeadsTable
      locale={locale}
      rows={items}
      counts={counts}
      fields={fields}
      vendorId={vendorId}
      basePath={`/${locale}/marketplace/seller/leads`}
      stage={stage}
      query={q}
      unread={unread}
      total={total}
      page={page}
      pageCount={pageCount}
      pageSize={pageSize}
      pageSizes={PAGE_SIZES}
      from={from}
      to={to}
      searchUnavailable={searchUnavailable}
    />
  );
}

function TableSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-8 w-72 rounded-lg" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
