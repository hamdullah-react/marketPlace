import Link from 'next/link';
import { redirect } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { Lock, Mail, MessageCircle, Phone, ShieldCheck, Wallet } from 'lucide-react';
import { vendorForBlockedScreen } from '@/marketplace/auth/session';
import { getVendorChargeTotals, getVendorCharges } from '@/marketplace/db/queries/billing';
import { getVendorPlans, getOpenRenewal } from '@/marketplace/db/queries/access';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { accessLabel } from '@/marketplace/lib/access';
import { billingDetails } from '@/marketplace/lib/billing';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import { Card } from '@/components/ui/card';
import LiveAccess from '../_components/LiveAccess';
import BlockedDialog from '../_components/BlockedDialog';
import RenewalPanel from '../../(seller)/_components/RenewalPanel';

export const instant = false;

export const metadata = {
  title: 'Subscription',
  robots: { index: false, follow: false },
};

/**
 * Where a showroom lands when its subscription has ended.
 *
 * ── Why this is a PAGE and not a dialog over the dashboard ──────────────────
 *
 * A modal is a decoration on top of a screen that has already been rendered and
 * whose data has already been read. The enforcement is requireVendor(), which
 * redirects before any seller page runs a query — so by the time anybody could
 * see a dialog, the thing it was covering would have already been sent to their
 * browser. The wall has to BE the page.
 *
 * ── Why it lives in (account) and not (seller) ──────────────────────────────
 *
 * The (seller) layout calls requireVendor(), which is what redirects here — a
 * blocked screen under that layout would redirect to itself for ever. Here it
 * gets the public header and footer, which is also the right answer: somebody
 * whose dashboard is closed can still use the rest of the site, and the header
 * carries the way to reach us.
 *
 * ── It never blocks anybody who is allowed in ───────────────────────────────
 *
 * The check is repeated at the top and sends an allowed showroom back to their
 * dashboard, so the page cannot become a trap of its own after an admin has
 * switched them on — and LiveAccess reloads it the second that happens.
 */
export default async function SubscriptionPage({ params, searchParams }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);
  const sp = await searchParams;

  const viewer = await vendorForBlockedScreen(sp?.vendor || null);

  // Not a seller at all: this page has nothing to say to them.
  if (!viewer) redirect(`/${locale}/marketplace/sell/apply`);

  /* ── The answer comes from the SESSION, and re-deriving it was the bug ──
     requireVendor() sends a blocked showroom here on the strength of
     vendor.access, which getViewer() computed from the columns it read. This
     page used to call accessState(viewer.vendor) again — on the MAPPED
     showroom, which carries no access_until and no access_blocked. With
     nothing to judge by it answered "allowed", so this page bounced straight
     back to the dashboard, which bounced back here: ERR_TOO_MANY_REDIRECTS,
     and a blocked seller could not reach any page at all.
     There is one verdict per request and this is it. */
  const access = viewer.vendor.access;

  // Paid up — go back to work. Also what makes the live reload land somewhere
  // useful rather than on this screen a second time.
  if (access.allowed) redirect(`/${locale}/marketplace/seller`);

  const [totals, charges, plans, openRenewal, site] = await Promise.all([
    getVendorChargeTotals(viewer.vendorId).catch(() => null),
    getVendorCharges(viewer.vendorId, { limit: 5 }).catch(() => ({ items: [] })),
    getVendorPlans().catch(() => []),
    getOpenRenewal(viewer.vendorId).catch(() => null),
    getSiteSettings().catch(() => null),
  ]);

  const money = (n) => formatPrice(n, locale, site?.currency);
  const details = billingDetails(site?.billing);
  const shop = localized(viewer.vendor.name, locale);

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === 'ar' ? 'ar-SA' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

  const whatsapp = site?.whatsapp ? String(site.whatsapp).replace(/[^\d]/g, '') : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 lg:px-6">
      {/* Reloads the moment the platform team switches them back on. */}
      <LiveAccess vendorId={viewer.vendorId} />

      {/* Says out loud what the redirect did silently. Everything in it is also
          on this page, so closing it is safe — see BlockedDialog. */}
      <BlockedDialog
        locale={locale}
        state={access.state}
        reason={access.reason}
        until={access.until}
        live={sp?.blocked === '1'}
        phone={site?.contactPhone}
        whatsapp={whatsapp}
      />

      <Card className="p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/50">
            <Lock className="h-6 w-6 text-amber-700 dark:text-amber-400" />
          </span>

          <div className="min-w-0">
            <h1 className="text-xl font-bold text-brand-primary">
              {access.state === 'blocked'
                ? t('تم إيقاف لوحة معرضك', 'Your showroom dashboard is switched off')
                : t('انتهت فترة معرضك المجانية', 'Your free period has ended')}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {shop}
              {access.until ? (
                <>
                  {' · '}
                  {t('انتهت في ', 'ended on ')}
                  {when(access.until)}
                </>
              ) : null}
              {' · '}
              {accessLabel(access.state, locale)}
            </p>
          </div>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {access.state === 'blocked'
            ? t(
                'أوقف فريق المنصة لوحة التحكم مؤقتاً. تواصل معنا لإعادة تفعيلها.',
                'The platform team has switched your dashboard off. Get in touch and we will sort it out.'
              )
            : t(
                'سياراتك وصفحة معرضك ما زالت ظاهرة للمشترين — لوحة التحكم فقط هي المتوقفة. تواصل مع فريق المنصة لتجديد الاشتراك وإعادة فتحها.',
                'Your cars and your showroom page are still visible to buyers — it is only the dashboard that is closed. Contact the platform team to renew and reopen it.'
              )}
        </p>

        {/* The admin's own words, when they blocked by hand. Without this the
            seller is arguing with a wall that will not say why. */}
        {access.reason ? (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {t('السبب: ', 'Reason: ')}
            {access.reason}
          </p>
        ) : null}

        {/* ── How to reach us ──────────────────────────────────────────── */}
        <div className="mt-6 rounded-xl border p-4 dark:border-white/10">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
            <ShieldCheck className="h-4 w-4" />
            {t('تواصل مع إدارة المنصة', 'Contact the platform team')}
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {site?.contactPhone ? (
              <a
                href={`tel:${site.contactPhone}`}
                className="raised-solid inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-white"
              >
                <Phone className="h-4 w-4" />
                <span dir="ltr">{site.contactPhone}</span>
              </a>
            ) : null}

            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium hover:border-brand-primary dark:border-white/10"
              >
                <MessageCircle className="h-4 w-4" />
                {t('واتساب', 'WhatsApp')}
              </a>
            ) : null}

            {site?.contactEmail ? (
              <a
                href={`mailto:${site.contactEmail}`}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium hover:border-brand-primary dark:border-white/10"
              >
                <Mail className="h-4 w-4" />
                <span dir="ltr">{site.contactEmail}</span>
              </a>
            ) : null}
          </div>

          {/* Nothing configured is a real state, and saying so beats three
              buttons that do nothing. */}
          {!site?.contactPhone && !whatsapp && !site?.contactEmail ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t(
                'لم تُضف بيانات تواصل المنصة بعد.',
                'The platform has not published its contact details yet.'
              )}
            </p>
          ) : null}
        </div>

        {/* ── What it costs ────────────────────────────────────────────────
            Only when an admin has actually created a plan. Inventing a price
            here would be the app quoting a figure nobody agreed. */}
        {/* ── Renewing ────────────────────────────────────────────────────
            The way OUT of this screen, and the reason it is not a dead end: the
            seller picks a plan, a charge is raised with a reference to transfer
            against, and the dashboard reopens the moment the team confirms the
            money. Nothing here grants access — see _actions/subscription.js. */}
        <div id="renew" className="mt-6 scroll-mt-24 border-t pt-5 dark:border-white/10">
          <p className="text-sm font-semibold text-brand-primary">
            {t('تجديد الاشتراك', 'Renew your subscription')}
          </p>
          <p className="mt-1 mb-3 text-xs text-muted-foreground">
            {t(
              'اختر مدة، ثم حوّل المبلغ بالرقم المرجعي الذي يظهر لك.',
              'Choose a length, then transfer the amount quoting the reference it gives you.'
            )}
          </p>

          <RenewalPanel
            locale={locale}
            vendorId={viewer.vendorId}
            plans={plans}
            openRenewal={openRenewal}
            currency={site?.currency}
          />
        </div>

        {/* ── What they already owe ─────────────────────────────────────── */}
        {totals?.outstanding > 0 ? (
          <div className="mt-5 rounded-xl bg-brand-primary/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-brand-primary">
              <Wallet className="h-4 w-4" />
              {t('مستحقات قائمة', 'Outstanding')}
              <span className="ms-auto tabular-nums">{money(totals.outstanding)}</span>
            </p>

            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {(charges.items ?? [])
                .filter((c) => c.state === 'due')
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-mono" dir="ltr">
                      {c.ref}
                    </span>
                    <span>{localized(c.description, locale)}</span>
                    <span className="ms-auto tabular-nums">{money(c.amount)}</span>
                  </li>
                ))}
            </ul>

            {details.accounts.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                {t(
                  'بيانات التحويل موجودة في صفحة المستحقات، وتظهر لك بعد إعادة التفعيل.',
                  'The transfer details are on your billing page, which opens again once you are switched back on.'
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        <p className="mt-6 border-t pt-4 text-xs text-muted-foreground dark:border-white/10">
          {t(
            'تُفتح اللوحة تلقائياً بمجرد تفعيل الاشتراك — لا حاجة لتحديث الصفحة.',
            'This page opens by itself the moment your subscription is switched on — no need to refresh.'
          )}
        </p>

        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href={`/${locale}/marketplace`} className="text-brand-primary hover:underline">
            {t('تصفّح السوق', 'Browse the marketplace')}
          </Link>
          <Link
            href={`/${locale}/marketplace/vendors/${viewer.vendor.slug}`}
            className="text-brand-primary hover:underline"
          >
            {t('صفحة معرضي', 'My showroom page')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
