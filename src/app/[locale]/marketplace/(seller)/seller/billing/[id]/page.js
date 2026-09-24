import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, ArrowRight, Landmark } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getVendorCharge } from '@/marketplace/db/queries/billing';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import {
  billingDetails, stateLabel, methodLabel, accountKindLabel, formatIban,
} from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import PrintButton from '../../../_components/PrintButton';

export const instant = false;

export const metadata = {
  title: 'Receipt',
  robots: { index: false, follow: false },
};

/**
 * One charge as a document — on screen, and on paper.
 *
 * ── Why it is called a RECEIPT and not an invoice ───────────────────────────
 *
 * A tax invoice in Saudi Arabia is a regulated document: ZATCA e-invoicing means
 * a cryptographic stamp, a QR code, a VAT breakdown and reporting to the
 * authority. This page has none of those, and titling it "Invoice" would invite
 * a seller's accountant to file it as one. It is what it actually is — a record
 * of an amount charged and, where it has been, paid — and it says so in its own
 * footer. If a real tax invoice is wanted, that is a separate and regulated
 * piece of work.
 *
 * Paid ones read as a receipt; unpaid ones read as a statement of what is owed,
 * with the payment details attached so the document is enough on its own.
 *
 * ── The print view IS this page ─────────────────────────────────────────────
 *
 * There is no second template. The dashboard chrome carries `data-print-hide`
 * (globals.css), so pressing Print — or Save as PDF, which is the same dialog —
 * produces exactly the document on screen. A separate PDF renderer would be a
 * second thing to keep in step, and would have to be taught Arabic shaping that
 * the browser already does.
 */
export default async function SellerChargePage({ params, searchParams }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor || null);

  const [charge, site] = await Promise.all([
    getVendorCharge(id, vendorId),
    getSiteSettings().catch(() => null),
  ]);

  // Not theirs, or not there. Indistinguishable on purpose: a 404 must not be a
  // way to test whether a charge id exists.
  if (!charge) notFound();

  const details = billingDetails(site?.billing);
  const terms = localized(details.terms, locale);
  const paid = charge.state === 'paid';
  const voided = charge.state === 'void';

  const money = (n) => formatPrice(n, locale);
  const Back = locale === 'ar' ? ArrowRight : ArrowLeft;

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '—';

  const platform = localized(site?.name, locale) || 'Marketplace';
  const shop = charge.vendors ? localized(charge.vendors.name, locale) : '';
  const address = charge.vendors?.address ? localized(charge.vendors.address, locale) : '';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-6">
      {/* ── Screen only ───────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3" data-print-hide>
        <Link
          href={`/${locale}/marketplace/seller/billing`}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-primary"
        >
          <Back className="h-3.5 w-3.5" />
          {t('رجوع إلى المستحقات', 'Back to billing')}
        </Link>

        <span className="ms-auto">
          <PrintButton locale={locale} />
        </span>
      </div>

      {/* ── The document ──────────────────────────────────────────────── */}
      <article className="raised-card mt-4 rounded-2xl p-6 sm:p-8">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5 dark:border-white/10">
          <div className="flex items-center gap-3">
            {site?.logoUrl ? (
              <Image src={site.logoUrl} alt="" width={44} height={44} className="h-11 w-11 object-contain" />
            ) : null}
            <div>
              <p className="text-base font-bold text-brand-primary">{platform}</p>
              {site?.contactEmail ? (
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {site.contactEmail}
                </p>
              ) : null}
            </div>
          </div>

          <div className="text-end">
            <p className="text-sm font-bold uppercase tracking-wide text-brand-primary">
              {paid
                ? t('سند استلام', 'Payment receipt')
                : voided
                  ? t('مستحق ملغى', 'Cancelled charge')
                  : t('بيان مستحق', 'Statement of charge')}
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground" dir="ltr">
              {charge.ref}
            </p>
            {/* PAID is the first thing anybody looks for on a piece of paper. */}
            {paid ? (
              <p className="mt-2 inline-block rounded-lg bg-green-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-green-700 dark:bg-green-950 dark:text-green-400">
                {t('مدفوع', 'Paid')}
              </p>
            ) : (
              <p className="mt-2 inline-block rounded-lg bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                {stateLabel(charge.state, locale)}
              </p>
            )}
          </div>
        </header>

        <section className="grid gap-5 border-b py-5 sm:grid-cols-2 dark:border-white/10">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('إلى', 'Billed to')}
            </p>
            <p className="mt-1 font-semibold">{shop}</p>
            {address ? <p className="text-xs text-muted-foreground">{address}</p> : null}
            {charge.vendors?.city ? (
              <p className="text-xs text-muted-foreground">{charge.vendors.city}</p>
            ) : null}
            {charge.vendors?.contact_phone ? (
              <p className="text-xs text-muted-foreground" dir="ltr">
                {charge.vendors.contact_phone}
              </p>
            ) : null}
            {/* A seller's own accountant looks for these two. */}
            {charge.vendors?.cr_number ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t('السجل التجاري: ', 'CR: ')}
                <span dir="ltr">{charge.vendors.cr_number}</span>
              </p>
            ) : null}
            {charge.vendors?.vat_number ? (
              <p className="text-xs text-muted-foreground">
                {t('الرقم الضريبي: ', 'VAT: ')}
                <span dir="ltr">{charge.vendors.vat_number}</span>
              </p>
            ) : null}
          </div>

          <dl className="space-y-1 text-xs sm:text-end">
            <div className="flex justify-between gap-3 sm:justify-end">
              <dt className="text-muted-foreground">{t('تاريخ الإصدار', 'Issued')}</dt>
              <dd className="tabular-nums sm:w-32">{when(charge.issued_at)}</dd>
            </div>
            {!paid && charge.due_at ? (
              <div className="flex justify-between gap-3 sm:justify-end">
                <dt className="text-muted-foreground">{t('تاريخ الاستحقاق', 'Due')}</dt>
                <dd className="tabular-nums sm:w-32">{when(charge.due_at)}</dd>
              </div>
            ) : null}
            {paid ? (
              <>
                <div className="flex justify-between gap-3 sm:justify-end">
                  <dt className="text-muted-foreground">{t('تاريخ الدفع', 'Paid on')}</dt>
                  <dd className="tabular-nums sm:w-32">{when(charge.paid_at)}</dd>
                </div>
                <div className="flex justify-between gap-3 sm:justify-end">
                  <dt className="text-muted-foreground">{t('طريقة الدفع', 'Method')}</dt>
                  <dd className="sm:w-32">{methodLabel(charge.payment_method, locale)}</dd>
                </div>
                {charge.paid_into ? (
                  <div className="flex justify-between gap-3 sm:justify-end">
                    <dt className="text-muted-foreground">{t('وصل إلى', 'Received into')}</dt>
                    <dd className="sm:w-32">{charge.paid_into}</dd>
                  </div>
                ) : null}
                {charge.payment_ref ? (
                  <div className="flex justify-between gap-3 sm:justify-end">
                    <dt className="text-muted-foreground">{t('المرجع', 'Reference')}</dt>
                    <dd className="font-mono sm:w-32" dir="ltr">
                      {charge.payment_ref}
                    </dd>
                  </div>
                ) : null}
              </>
            ) : null}
          </dl>
        </section>

        {/* ── The line ────────────────────────────────────────────────── */}
        <table className="w-full py-5 text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground dark:border-white/10">
              <th className="py-2 text-start font-medium">{t('البيان', 'Description')}</th>
              <th className="py-2 text-end font-medium">{t('المبلغ', 'Amount')}</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b dark:border-white/10">
              <td className="py-3">
                <p className="font-medium">{localized(charge.description, locale)}</p>
                {charge.listings ? (
                  <p className="text-xs text-muted-foreground">{localized(charge.listings.name, locale)}</p>
                ) : null}
              </td>
              <td className="py-3 text-end font-semibold tabular-nums">{money(charge.amount)}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 text-end font-semibold">
                {paid ? t('الإجمالي المدفوع', 'Total paid') : t('الإجمالي المستحق', 'Total due')}
              </td>
              <td className="pt-3 text-end text-lg font-bold tabular-nums text-brand-primary">
                {money(charge.amount)}
              </td>
            </tr>
          </tfoot>
        </table>

        {charge.state === 'void' && charge.void_reason ? (
          <p className="rounded-lg bg-gray-50 p-3 text-xs text-muted-foreground dark:bg-white/5">
            {t('أُلغي لأن: ', 'Cancelled because: ')}
            {charge.void_reason}
          </p>
        ) : null}

        {/* ── How to pay, on the unpaid ones ──────────────────────────────
            The document has to be usable on its own: a statement forwarded to
            somebody's accounts department with no account number on it comes
            straight back. */}
        {!paid && !voided && details.accounts.length ? (
          <section className="mt-2 rounded-xl bg-brand-primary/5 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold text-brand-primary">
              <Landmark className="h-3.5 w-3.5" />
              {t('طريقة الدفع', 'How to pay')}
            </p>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              {details.accounts.map((account) => (
                <div key={account.id} className="text-xs">
                  <p className="font-medium">
                    {account.label}
                    <span className="ms-1 font-normal text-muted-foreground">
                      · {accountKindLabel(account.kind, locale)}
                    </span>
                  </p>
                  {account.accountName ? (
                    <p className="text-muted-foreground">{account.accountName}</p>
                  ) : null}
                  {account.iban ? (
                    <p className="font-mono" dir="ltr">
                      {formatIban(account.iban)}
                    </p>
                  ) : null}
                  {account.accountNumber ? (
                    <p className="font-mono" dir="ltr">
                      {account.accountNumber}
                    </p>
                  ) : null}
                  {account.notes ? <p className="text-muted-foreground">{account.notes}</p> : null}
                </div>
              ))}
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              {t(
                `اكتب الرقم ${charge.ref} في بيان التحويل حتى نتمكن من مطابقته.`,
                `Put ${charge.ref} on the transfer so we can match it.`
              )}
            </p>
            {terms ? <p className="mt-1 text-xs text-muted-foreground">{terms}</p> : null}
          </section>
        ) : null}

        <footer className="mt-6 border-t pt-4 text-[11px] leading-relaxed text-muted-foreground dark:border-white/10">
          {/* Stated on the document itself, not only in the code. */}
          <p>
            {t(
              'هذا المستند سجل داخلي للمبلغ والدفع، وليس فاتورة ضريبية معتمدة.',
              'This document is an internal record of the amount and the payment. It is not a certified tax invoice.'
            )}
          </p>
          {charge.note ? <p className="mt-1">{charge.note}</p> : null}
        </footer>
      </article>
    </div>
  );
}
