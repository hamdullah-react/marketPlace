import { notFound } from 'next/navigation';
import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import { ArrowLeft, Phone, Mail, Car, Ban } from 'lucide-react';
import { requireVendor } from '@/marketplace/auth/session';
import { getLead } from '@/marketplace/db/queries/leads';
import { getVendorFormFields } from '@/marketplace/db/queries/forms';
import { readAnswers } from '@/marketplace/lib/form-fields';
import LeadWorkspace from '../../../_components/LeadWorkspace';
import MarkLeadRead from '../../../_components/MarkLeadRead';

export const metadata = {
  title: 'Lead',
  robots: { index: false, follow: false },
};

/**
 * One lead, and the controls for working it.
 *
 * The card view the table sends you to. A table answers "who is worth calling
 * first"; this answers "what did this person actually say", which is a
 * different question and needs the answers laid out rather than truncated into
 * a 200px cell.
 *
 * Not streamed behind a Suspense boundary like the list is: there is one query
 * here and nothing to show around it, so a skeleton would flash for the length
 * of a single round trip and then be replaced.
 */
export default async function LeadPage({ params, searchParams }) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const sp = await searchParams;
  const { vendorId } = await requireVendor(sp?.vendor ?? null);

  // getLead is scoped by vendor_id, so another showroom's id comes back null
  // and lands on the same 404 as an id that never existed.
  const lead = await getLead(vendorId, id);
  if (!lead) notFound();

  // activeOnly false: a question switched off last week still has leads that
  // answered it, and dropping it would hide data somebody actually gave.
  const fields = await getVendorFormFields(vendorId, { activeOnly: false }).catch(() => []);
  const answers = readAnswers(lead.answers, fields, locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const title = lead.listing_title?.[locale] || lead.listing_title?.en || null;

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      {/* Renders nothing. Opening a lead is what marks it read, and the browser
          is the only part of the stack that knows a person saw it — see the
          component for why this is not a write during render. */}
      <MarkLeadRead leadId={lead.id} vendorId={vendorId} alreadyRead={Boolean(lead.read_at)} />

      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <Link
            href={`/${locale}/marketplace/seller/leads`}
            className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-primary"
          >
            <ArrowLeft className={`h-4 w-4 ${locale === 'ar' ? 'rotate-180' : ''}`} />
            {t('العملاء المحتملون', 'Leads')}
          </Link>

          <h1 className="text-2xl font-bold text-brand-primary">
            {lead.contact_name || t('مشترٍ', 'Buyer')}
          </h1>

          {/* ── Withdrawn by the buyer ───────────────────────────────────────
              ABOVE the phone number, and before anything else on the page,
              because the whole purpose of this notice is to stop somebody
              ringing a person who has already said not to. A badge down in the
              stage row would be read after the call was made.
              --------------------------------------------------------------- */}
          {lead.stage === 'cancelled' ? (
            <div className="mt-3 flex items-start gap-3 rounded-2xl border border-gray-300 bg-gray-50 p-4 dark:border-white/15 dark:bg-white/5">
              <Ban className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
              <div className="text-sm">
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {lead.cancelled_at
                    ? t(
                        `ألغى المشتري هذا الطلب في ${new Date(lead.cancelled_at).toLocaleDateString('ar-SA', { day: 'numeric', month: 'long' })}`,
                        `The buyer cancelled this on ${new Date(lead.cancelled_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`
                      )
                    : t('ألغى المشتري هذا الطلب', 'The buyer cancelled this request')}
                </p>
                {/* Optional on purpose — a required reason box fills up with
                    "asdf", so one that IS here means something. */}
                {lead.cancel_reason ? (
                  <p className="mt-1 text-gray-700 dark:text-gray-300">
                    “{lead.cancel_reason}”
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    'لا داعي للاتصال. يبقى الطلب هنا كسجل.',
                    'No need to call. The request stays here as a record.'
                  )}
                </p>
              </div>
            </div>
          ) : null}

          {/* The contact details ARE the reply channel now — there is no thread
              to answer in — so they are the first thing on the page and both
              are one tap. */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm">
            {lead.contact_phone ? (
              <a
                href={`tel:${lead.contact_phone}`}
                dir="ltr"
                className="flex items-center gap-1.5 font-medium text-brand-primary hover:underline"
              >
                <Phone className="h-3.5 w-3.5" />
                {lead.contact_phone}
              </a>
            ) : null}
            {lead.contact_email ? (
              <a
                href={`mailto:${lead.contact_email}`}
                dir="ltr"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-brand-primary hover:underline"
              >
                <Mail className="h-3.5 w-3.5" />
                {lead.contact_email}
              </a>
            ) : null}
            {title ? (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Car className="h-3.5 w-3.5" />
                {/* The snapshot, not a join. It still reads after the car is
                    sold and the listing is gone — which is when a seller most
                    wants to know what the lead was about. */}
                {lead.listing_id ? (
                  <Link
                    href={`/${locale}/marketplace/seller/listings/${lead.listing_id}`}
                    className="hover:text-brand-primary hover:underline"
                  >
                    {title}
                  </Link>
                ) : (
                  <span title={t('حُذف الإعلان', 'The listing was removed')}>{title}</span>
                )}
              </span>
            ) : null}
          </div>
        </div>

        <div className="px-4 lg:px-6">
          <LeadWorkspace
            locale={locale}
            vendorId={vendorId}
            lead={lead}
            answers={answers}
          />
        </div>
      </div>
    </div>
  );
}
