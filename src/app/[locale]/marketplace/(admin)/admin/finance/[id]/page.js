import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import {
  ArrowLeft, ArrowRight, Clock, ExternalLink, FileText, Landmark, Store,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { requireStaff } from '@/marketplace/auth/session';
import { getCharge } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { listProofsForCharge } from '@/marketplace/db/queries/proofs';
import {
  billingDetails, isOverdue, kindLabel, methodLabel, overdueLabel,
  stateLabel, stateTone,
} from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import ChargeRowActions from '../../../_components/ChargeRowActions';

export const instant = false;

export const metadata = {
  title: 'Charge',
  robots: { index: false, follow: false },
};

/**
 * One charge, in full — what the table's row opens into.
 *
 * ── Why a page and not a wider row ──────────────────────────────────────────
 *
 * The table answers "who owes us and how much" across forty rows, which is the
 * question an admin has most of the time. It cannot also answer "what exactly
 * happened with this one", because that is a dozen facts and a history: every
 * receipt the showroom has sent, each with its own verdict and the note that
 * came with a refusal. Widening the row to carry those would cost every other
 * row the width, for a detail only one of them is ever being read for.
 *
 * ── The receipts are the reason this page exists ────────────────────────────
 *
 * A first attempt gets rejected, a second arrives, and the argument three months
 * later is about which of them was accepted and why the first was not. The table
 * can only show the latest; this shows the lot, oldest first, which is the order
 * the story happened in.
 */
export default async function AdminChargePage({ params }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <Suspense fallback={<ChargeSkeleton />}>
          <Body id={id} locale={locale} t={t} />
        </Suspense>
      </div>
    </div>
  );
}

async function Body({ id, locale, t }) {
  await requireStaff();

  const [charge, site, proofs] = await Promise.all([
    getCharge(id),
    getSiteSettings().catch(() => null),
    /* Never throws — a database without the PAYMENT PROOFS section shows no
       receipts and the rest of the page is unaffected. */
    listProofsForCharge(id).catch(() => ({ ready: false, items: [] })),
  ]);

  if (!charge) notFound();

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);
  const late = isOverdue(charge);
  const shop = charge.vendors ? localized(charge.vendors.name, locale) : null;

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleString(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Riyadh',
        })
      : '—';

  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;

  const ledger =
    charge.kind === 'subscription' ? 'subscriptions' : charge.kind === 'boost' ? 'promotions' : 'other';

  return (
    <>
      <div className="px-4 lg:px-6">
        <Link
          href={`/${locale}/marketplace/admin/finance?section=${ledger}`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-primary"
        >
          <Back className="h-3.5 w-3.5" />
          {t(`مستحقات ${kindLabel(charge.kind, locale)}`, `${kindLabel(charge.kind, locale)} charges`)}
        </Link>

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-2xl font-bold text-brand-primary" dir="ltr">
            {charge.ref}
          </h1>

          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stateTone(charge.state)}`}>
            {stateLabel(charge.state, locale)}
          </span>

          {late ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              <Clock className="h-3 w-3" />
              {overdueLabel(charge, locale)}
            </span>
          ) : null}

          <span className="ms-auto text-2xl font-bold tabular-nums text-brand-primary">
            {money(charge.amount)}
          </span>
        </div>
      </div>

      {/* ── The actions, at the top ───────────────────────────────────────
          In the BUTTON face here, not the menu one. A menu is right in a table
          cell, where four buttons would set the width of every row; on a page
          about one charge the actions are the reason somebody opened it, and
          hiding them behind a further press would be ceremony. Same component
          and the same dialogs either way — see ChargeRowActions. */}
      <div className="px-4 lg:px-6">
        <Card className="p-4">
          <ChargeRowActions
            locale={locale}
            charge={charge}
            accounts={details.accounts ?? []}
            vendorName={shop ?? ''}
            carName={charge.listings ? localized(charge.listings.name, locale) : ''}
            amountLabel={money(charge.amount)}
            descriptionLabel={localized(charge.description, locale)}
            dueLabel={when(charge.due_at)}
          />
        </Card>
      </div>

      {/* ── What it is ────────────────────────────────────────────────────── */}
      <div className="grid gap-3 px-4 lg:grid-cols-2 lg:px-6">
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-brand-primary">
            {t('المستحق', 'The charge')}
          </h2>

          <dl className="grid gap-2 text-sm">
            <Row label={t('النوع', 'Kind')} value={kindLabel(charge.kind, locale)} />
            <Row label={t('الوصف', 'Description')} value={localized(charge.description, locale)} />
            <Row label={t('صدر', 'Issued')} value={when(charge.issued_at)} />
            {charge.due_at ? <Row label={t('الاستحقاق', 'Due')} value={when(charge.due_at)} /> : null}

            {/* What recording a payment on this charge will ALSO do. An admin
                confirming money should know it reopens a dashboard. */}
            {charge.access_days ? (
              <Row
                label={t('يمنح', 'Grants')}
                value={t(`${charge.access_days} يوم وصول`, `${charge.access_days} days of access`)}
              />
            ) : null}

            {charge.state === 'paid' ? (
              <>
                <Row label={t('دُفع', 'Paid')} value={when(charge.paid_at)} />
                <Row label={t('الطريقة', 'Method')} value={methodLabel(charge.payment_method, locale)} />
                {charge.paid_into ? (
                  <Row label={t('إلى حساب', 'Into')} value={charge.paid_into} />
                ) : null}
                {charge.payment_ref ? (
                  <Row label={t('رقم العملية', 'Reference')} value={charge.payment_ref} mono />
                ) : null}
              </>
            ) : null}

            {charge.state === 'void' && charge.void_reason ? (
              <Row label={t('أُلغي لأن', 'Cancelled because')} value={charge.void_reason} />
            ) : null}

            {charge.recorded_by ? (
              <Row label={t('سجّلها', 'Recorded by')} value={charge.recorded_by} />
            ) : null}
            {charge.note ? <Row label={t('ملاحظة', 'Note')} value={charge.note} /> : null}
          </dl>

          {charge.listings ? (
            <Link
              href={`/${locale}/marketplace/listing/${charge.listings.slug}`}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {localized(charge.listings.name, locale)}
            </Link>
          ) : null}
        </Card>

        {/* ── Who owes it ─────────────────────────────────────────────────── */}
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <Store className="h-4 w-4" />
            {t('المعرض', 'Showroom')}
          </h2>

          {charge.vendors ? (
            <>
              <dl className="grid gap-2 text-sm">
                <Row label={t('الاسم', 'Name')} value={shop} />
                {charge.vendors.city ? <Row label={t('المدينة', 'City')} value={charge.vendors.city} /> : null}
                {charge.vendors.contact_phone ? (
                  <Row label={t('الجوال', 'Phone')} value={charge.vendors.contact_phone} mono />
                ) : null}
                {charge.vendors.contact_email ? (
                  <Row label={t('البريد', 'Email')} value={charge.vendors.contact_email} />
                ) : null}
                {charge.vendors.cr_number ? (
                  <Row label={t('السجل التجاري', 'CR number')} value={charge.vendors.cr_number} mono />
                ) : null}
                {charge.vendors.vat_number ? (
                  <Row label={t('الرقم الضريبي', 'VAT number')} value={charge.vendors.vat_number} mono />
                ) : null}
              </dl>

              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href={`/${locale}/marketplace/vendors/${charge.vendors.slug}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t('صفحة المعرض', 'Storefront')}
                </Link>
                <Link
                  href={`/${locale}/marketplace/admin/subscriptions/${charge.vendors.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-primary hover:underline"
                >
                  <Landmark className="h-3.5 w-3.5" />
                  {t('الاشتراك والوصول', 'Subscription and access')}
                </Link>
              </div>
            </>
          ) : (
            /* The charge outlives the showroom: vendor_id is ON DELETE RESTRICT,
               so this only happens on a row whose join failed. Said plainly
               rather than rendering an empty card. */
            <p className="text-sm text-muted-foreground">
              {t('تعذّر قراءة بيانات المعرض.', 'The showroom’s details could not be read.')}
            </p>
          )}
        </Card>
      </div>

      {/* ── Every receipt the showroom has sent ───────────────────────────
          Oldest first, which is the order it happened in: a refusal and its
          reason, then the corrected attempt. The table upstream can only show
          the latest, and the latest is not the story. */}
      {proofs.items.length ? (
        <div className="px-4 lg:px-6">
          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-brand-primary">
              <FileText className="h-4 w-4" />
              {t('الإيصالات المُرسلة', 'Receipts sent')}
              <span className="text-xs font-normal text-muted-foreground tabular-nums">
                {proofs.items.length}
              </span>
            </h2>

            <ul className="grid gap-3">
              {proofs.items.map((proof) => (
                <li key={proof.id} className="raised-card rounded-xl p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        proof.state === 'accepted'
                          ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
                          : proof.state === 'rejected'
                            ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                      }`}
                    >
                      {proof.state === 'accepted'
                        ? t('مقبول', 'Accepted')
                        : proof.state === 'rejected'
                          ? t('مرفوض', 'Rejected')
                          : t('قيد المراجعة', 'Under review')}
                    </span>

                    <span className="text-xs text-muted-foreground tabular-nums">
                      {when(proof.created_at)}
                    </span>

                    {/* What the SELLER claimed, beside what the charge says. A
                        mismatch is the single most useful thing on this page. */}
                    {proof.amount != null ? (
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          Number(proof.amount) !== Number(charge.amount)
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-brand-primary'
                        }`}
                      >
                        {money(proof.amount)}
                        {Number(proof.amount) !== Number(charge.amount)
                          ? t(' (يختلف عن المستحق)', ' (differs from the charge)')
                          : ''}
                      </span>
                    ) : null}

                    <a
                      href={`/api/marketplace/payments/${proof.id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ms-auto inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {t('عرض الإيصال', 'Open receipt')}
                    </a>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {proof.method ? <span>{methodLabel(proof.method, locale)}</span> : null}
                    {proof.reference ? (
                      <span className="font-mono" dir="ltr">
                        {proof.reference}
                      </span>
                    ) : null}
                    {proof.paid_at ? (
                      <span className="tabular-nums">
                        {t('حُوّل: ', 'Transferred: ')}
                        {when(proof.paid_at)}
                      </span>
                    ) : null}
                  </div>

                  {proof.note ? (
                    <p className="mt-2 text-xs text-muted-foreground">{proof.note}</p>
                  ) : null}

                  {/* The verdict's own sentence — the reason a rejection carries
                      a note at all, and what the showroom was shown. */}
                  {proof.review_note ? (
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs dark:bg-white/5">
                      <span className="font-semibold">{t('الرد: ', 'Answer: ')}</span>
                      {proof.review_note}
                      {proof.reviewed_at ? (
                        <span className="ms-2 text-muted-foreground tabular-nums">
                          {when(proof.reviewed_at)}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value, mono = false }) {
  if (value == null || value === '') return null;

  return (
    <div className="flex flex-wrap gap-2 border-b pb-2 last:border-0 last:pb-0 dark:border-white/10">
      <dt className="min-w-28 text-xs text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 flex-1 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>
        {value}
      </dd>
    </div>
  );
}

function ChargeSkeleton() {
  return (
    <>
      <div className="px-4 lg:px-6">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-8 w-56" />
      </div>
      <div className="grid gap-3 px-4 lg:grid-cols-2 lg:px-6">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-xl border p-4 dark:border-white/10">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-3 h-3 w-full" />
            <Skeleton className="mt-2 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </>
  );
}
