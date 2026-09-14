import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Clock, CheckCircle2, XCircle, PauseCircle } from 'lucide-react';
import { getViewer } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { localized } from '@/marketplace/lib/listing';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

export const metadata = {
  title: 'Application Status',
  robots: { index: false, follow: false },
};

/**
 * Where an applicant waits.
 *
 * The whole point of this page is that "we are still looking at it" and "we
 * said no" are different answers and a seller deserves to be told which. A
 * dashboard that simply refuses to open says neither.
 *
 * Reads the vendor through the SERVICE client, because getViewer() reports only
 * approved showrooms — an applicant would otherwise be invisible to the page
 * built for applicants.
 */
export default async function SellApplyStatusPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const viewer = await getViewer();
  if (!viewer) {
    redirect(
      `/${locale}/marketplace/login?next=${encodeURIComponent(`/${locale}/marketplace/sell/apply/status`)}`
    );
  }

  const { data: membership } = await getMarketplaceDb()
    .from('vendor_members')
    .select('vendors ( slug, name, state, suspended_reason )')
    .eq('user_id', viewer.userId)
    .limit(1)
    .maybeSingle();

  // Nothing to show a status for. Not an error — they simply have not applied.
  if (!membership?.vendors) redirect(`/${locale}/marketplace/sell/apply`);

  const vendor = membership.vendors;

  const STATES = {
    applied: {
      icon: Clock,
      tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
      ar: 'قيد المراجعة',
      en: 'Under review',
      bodyAr: 'وصلنا طلبك. يراجعه الفريق ويتواصل معك عادة خلال يوم عمل واحد.',
      bodyEn: 'We have your application. The team reviews it and will be in touch, usually within one working day.',
    },
    approved: {
      icon: CheckCircle2,
      tone: 'text-green-600 bg-green-50 dark:bg-green-950/40',
      ar: 'تمت الموافقة',
      en: 'Approved',
      bodyAr: 'معرضك جاهز. ابدأ بإضافة سياراتك.',
      bodyEn: 'Your showroom is live. Start by adding your cars.',
    },
    rejected: {
      icon: XCircle,
      tone: 'text-red-600 bg-red-50 dark:bg-red-950/40',
      ar: 'لم تتم الموافقة',
      en: 'Not approved',
      bodyAr: 'لم نتمكن من قبول الطلب هذه المرة. تواصل معنا لمعرفة التفاصيل.',
      bodyEn: 'We could not approve this application. Get in touch and we will explain why.',
    },
    suspended: {
      icon: PauseCircle,
      tone: 'text-red-600 bg-red-50 dark:bg-red-950/40',
      ar: 'المعرض موقوف',
      en: 'Showroom suspended',
      bodyAr: 'تم إيقاف المعرض مؤقتاً. تواصل معنا لإعادة تفعيله.',
      bodyEn: 'This showroom is suspended. Contact us to have it reinstated.',
    },
  };

  const state = STATES[vendor.state] ?? STATES.applied;
  const Icon = state.icon;

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-14 text-center">
      <span className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${state.tone}`}>
        <Icon className="h-7 w-7" />
      </span>

      <h1 className="mt-5 text-2xl font-bold text-brand-primary">
        {t(state.ar, state.en)}
      </h1>

      <p className="mt-1 text-sm font-medium text-gray-700 dark:text-gray-300">
        {localized(vendor.name, locale)}
      </p>

      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        {t(state.bodyAr, state.bodyEn)}
      </p>

      {/* The reason staff gave, when there is one — it is the only thing on
          this page the seller can actually act on. */}
      {vendor.suspended_reason ? (
        <p className="mx-auto mt-4 max-w-md rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {vendor.suspended_reason}
        </p>
      ) : null}

      <div className="mt-7 flex flex-wrap justify-center gap-3">
        {vendor.state === 'approved' ? (
          <Link
            href={`/${locale}/marketplace/seller`}
            className="rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5a2363]"
          >
            {t('إلى لوحة البائع', 'Go to the dashboard')}
          </Link>
        ) : null}

        <Link
          href={`/${locale}/marketplace`}
          className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm transition-colors hover:border-brand-primary dark:border-gray-600"
        >
          {t('تصفّح السوق', 'Browse the marketplace')}
        </Link>
      </div>
    </div>
  );
}
