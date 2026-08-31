import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import { requireVendor } from '@/marketplace/auth/session';
import {
  getVendorFormFields, getVendorFormStyle, getVendorFormTabs,
} from '@/marketplace/db/queries/forms';
import { Skeleton } from '@/components/ui/skeleton';
import FormBuilder from '../../_components/FormBuilder';

export const metadata = {
  title: 'Lead form',
  robots: { index: false, follow: false },
};

/**
 * The questions this showroom asks buyers.
 *
 * Every seller qualifies a lead differently: a finance broker needs employer
 * and monthly income, a used-car dealer needs the trade-in and the budget, a
 * parts shop needs a VIN. Shipping the union of everyone's questions would give
 * every buyer a form mostly about somebody else's business, so each showroom
 * builds its own — and the answers arrive on the lead itself, in Enquiries.
 *
 * Name, phone and message are not editable here. They are asked on every form,
 * they are what makes a lead answerable at all, and a seller who removed
 * "phone" by accident would be collecting leads they cannot act on.
 */
export default async function LeadFormPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="@container/main flex flex-1 flex-col gap-2">
      <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <div className="px-4 lg:px-6">
          <h1 className="text-2xl font-bold text-brand-primary">
            {t('نموذج الاستفسار', 'Lead form')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              'اختر ما تسأل عنه المشترين. تظهر هذه الحقول في كل إعلاناتك، وتصلك إجاباتها مع كل استفسار.',
              'Choose what you ask buyers. These fields appear on every one of your listings, and the answers arrive with each enquiry.'
            )}
          </p>
        </div>

        <div className="px-4 lg:px-6">
          <Suspense fallback={<BuilderSkeleton />}>
            <Builder searchParams={searchParams} locale={locale} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function Builder({ searchParams, locale }) {
  const sp = await searchParams;
  // requireVendor resolves the showroom from the session; ?vendor= only ever
  // narrows between showrooms this person already belongs to.
  const { vendorId } = await requireVendor(sp?.vendor ?? null);

  // activeOnly false — the builder must show a switched-off field in order to
  // switch it back on. In parallel with the style: neither needs the other.
  const [fields, look, tabs] = await Promise.all([
    getVendorFormFields(vendorId, { activeOnly: false }),
    getVendorFormStyle(vendorId),
    getVendorFormTabs(vendorId),
  ]);

  return (
    <FormBuilder
      locale={locale}
      vendorId={vendorId}
      fields={fields}
      styleKey={look.styleKey}
      theme={look.theme}
      tabs={tabs}
    />
  );
}

function BuilderSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-20 w-full rounded-xl" />
      ))}
    </div>
  );
}
