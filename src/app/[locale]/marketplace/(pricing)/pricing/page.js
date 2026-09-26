import Link from 'next/link';
import { Suspense } from 'react';
import { setRequestLocale } from 'next-intl/server';
import {
  BadgeCheck, Check, Gift, Landmark, MessageCircle, Phone, Send, Sparkles, Store,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { getVendorPlans, getOpenRenewal } from '@/marketplace/db/queries/access';
import { getSiteSettings } from '@/marketplace/db/queries/site';
import { getViewer } from '@/marketplace/auth/session';
import { formatPrice, localized } from '@/marketplace/lib/listing';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import PlanCta from '../_components/PlanCta';
import TiltCard from '../_components/TiltCard';
import PlanCard from '@/app/[locale]/marketplace/_components/PlanCard';
import { freeTrialPlan } from '@/marketplace/lib/planCopy';

/** Managed on Admin → Website content → Pages SEO (defaults in lib/sitePages.js). */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('pricing', locale);
}

/**
 * What it costs to sell here.
 *
 * ── The prices are visible to EVERYONE, signed in or not ────────────────────
 *
 * Only the button changes. A pricing page behind a login is a pricing page
 * nobody reads: a dealer comparing us with Haraj will not create an account to
 * find out the number, they will close the tab. So the cards are public and the
 * sign-in only stands between them and the ACTION — see PlanCta, which explains
 * the four readers this page has.
 *
 * ── A buyer is told, up front, that none of this is for them ────────────────
 *
 * This page is linked from the footer, which means most of the people who arrive
 * are buyers wondering whether they are about to be charged. The first thing
 * under the heading answers that, because a buyer who leaves this page unsure
 * whether browsing costs money is a buyer we may not get back.
 *
 * ── Nothing about the plans is in this file ─────────────────────────────────
 *
 * Names, prices, lengths, the sentence under each name, the ticks and which card
 * is lifted all come from `vendor_plans`, edited on Admin → Subscriptions. The
 * page is a renderer; a hardcoded plan here would be a price that needs a deploy
 * to change.
 */
export default async function PricingPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = (ar, en) => (locale === 'ar' ? ar : en);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:pt-10">
      <SeoJsonLd pageKey="pricing" locale={locale} />

      <header className="mx-auto max-w-2xl text-center">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary">
          <Store className="h-3.5 w-3.5" />
          {t('للمعارض والتجّار', 'For showrooms and dealers')}
        </p>

        <h1 className="mt-4 text-3xl font-bold text-brand-primary sm:text-4xl">
          {t('الأسعار', 'Pricing')}
        </h1>

        {/* The buyer's answer, first, before any number. */}
        <p className="mx-auto mt-3 max-w-xl text-sm text-gray-600 dark:text-gray-400">
          {t(
            'هذه الصفحة للمعارض التي تريد عرض سياراتها. التصفّح والتواصل مع البائع مجاني تماماً للمشترين — لا يوجد ما تدفعه لتشتري سيارة.',
            'This page is for showrooms that want to list their cars. Browsing and contacting a seller is completely free for buyers — there is nothing to pay to buy a car.'
          )}
        </p>
      </header>

      <Suspense fallback={<PlansSkeleton />}>
        <Plans locale={locale} t={t} />
      </Suspense>

      <HowItWorks locale={locale} t={t} />
    </div>
  );
}

/* ── The cards ─────────────────────────────────────────────────────────────
   Behind a boundary of its own: the heading above is static and paints at once,
   and this reads the plans, the settings and the session.
   ------------------------------------------------------------------------ */

async function Plans({ locale, t }) {
  const [plans, site, viewer] = await Promise.all([
    getVendorPlans({ activeOnly: true }),
    getSiteSettings().catch(() => null),
    getViewer().catch(() => null),
  ]);

  const currency = site?.currency ?? null;
  const money = (n) => formatPrice(n, locale, currency);
  const trialDays = Number(site?.trialDays ?? 0);

  /* ── Who is reading ──────────────────────────────────────────────────────
     One of four, decided here on the server and handed to the button as a word.
     The client component must not re-derive this: it has no session, and
     anything it guessed would be a guess about permission. */
  const vendor = viewer?.vendors?.[0] ?? null;
  const audience = !viewer ? 'guest' : vendor ? 'seller' : 'buyer';

  /* Only asked for a seller, and only once: it is the thing that turns every
     card's button into "you already asked". A buyer or a guest has no showroom
     for it to be about. */
  const openRenewal = vendor ? await getOpenRenewal(vendor.id).catch(() => null) : null;

  const loginHref = `/${locale}/marketplace/login?next=${encodeURIComponent(
    `/${locale}/marketplace/pricing`
  )}&notice=showroom`;
  const applyHref = `/${locale}/marketplace/sell/apply`;
  const billingHref = vendor?.access?.allowed
    ? `/${locale}/marketplace/seller/billing`
    : `/${locale}/marketplace/subscription`;

  /* ── Free first ────────────────────────────────────────────────────────
     The trial is what a showroom actually starts on, so it is the first card
     rather than a sentence above the grid. Reading left to right then becomes
     the order somebody moves through: free, then a month, then a year.

     Synthesised rather than stored — see freeTrialPlan() for why a trial must
     not be a row in vendor_plans. Null when an admin has set the trial to zero
     days, in which case the grid simply starts at the first paid plan. */
  const trial = freeTrialPlan(trialDays, locale, { t });
  const cards = trial ? [trial, ...plans] : plans;

  if (!plans.length) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-2xl border border-dashed p-8 text-center dark:border-white/10">
        <Landmark className="mx-auto h-9 w-9 text-gray-300 dark:text-gray-600" />
        <p className="mt-3 font-semibold text-brand-primary">
          {t('الأسعار عند الطلب', 'Pricing on request')}
        </p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {t(
            'تواصل معنا وسنرسل لك عرضاً يناسب حجم معرضك.',
            'Get in touch and we will send you terms that suit the size of your showroom.'
          )}
        </p>

        {/* Contact is the fallback, so it has to BE reachable — a dead end here
            is a showroom that wanted to pay us and could not find out how. */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
          {site?.contactPhone ? (
            <a
              href={`tel:${site.contactPhone}`}
              dir="ltr"
              className="inline-flex items-center gap-1.5 font-medium text-brand-primary hover:underline"
            >
              <Phone className="h-4 w-4" />
              {site.contactPhone}
            </a>
          ) : null}
          {site?.whatsapp ? (
            <a
              href={`https://wa.me/${String(site.whatsapp).replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 font-medium text-brand-primary hover:underline"
            >
              <MessageCircle className="h-4 w-4" />
              {t('واتساب', 'WhatsApp')}
            </a>
          ) : null}
          {site?.contactEmail ? (
            <a
              href={`mailto:${site.contactEmail}`}
              dir="ltr"
              className="font-medium text-brand-primary hover:underline"
            >
              {site.contactEmail}
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* The free period, stated where it is decided — a showroom that does not
          have to pay yet should not be reading prices thinking they do. Only
          when there is one: `trial_days` can be set to 0. */}
      {trialDays > 0 ? (
        <p className="mx-auto mt-6 flex max-w-max items-center gap-2 rounded-full bg-brand-gold/20 px-4 py-1.5 text-sm font-semibold text-brand-primary">
          <Gift className="h-4 w-4" />
          {t(
            `أول ${trialDays} يوماً مجاناً لكل معرض جديد`,
            `The first ${trialDays} days are free for every new showroom`
          )}
        </p>
      ) : null}

      <div
        className={`mt-8 grid gap-5 ${
          cards.length === 1
            ? 'mx-auto max-w-sm'
            : cards.length === 2
              ? 'mx-auto max-w-3xl sm:grid-cols-2'
              : 'sm:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {cards.map((plan) => (
          /* ── The card turns towards the pointer ──────────────────────
             The tilt wraps the card rather than being part of it, so the card
             stays the same component the dashboard draws — a screen reader, a
             crawler and a printer all see identical markup, and the 3D is
             something only a mouse gets.
             TiltCard switches itself off for a touch screen and for anybody
             who has asked their system for reduced motion. */
          <TiltCard key={plan.id} className={plan.popular ? 'lg:-mt-2 lg:mb-2' : ''}>
            <PlanCard plan={plan} locale={locale} currency={currency}>
              <PlanCta
                locale={locale}
                planId={plan.id}
                /* The trial is not bought. Pressing it can only mean "start" —
                   join, or open a showroom — so the button is told which card
                   it is on rather than inferring it from a price of zero, which
                   an admin could also set on a real plan they are giving
                   away. */
                trial={plan.synthetic === true}
                audience={openRenewal ? 'waiting' : audience}
                vendorId={vendor?.id ?? null}
                featured={plan.popular}
                loginHref={loginHref}
                applyHref={applyHref}
                billingHref={billingHref}
              />
            </PlanCard>
          </TiltCard>
        ))}
      </div>

      {/* Said once, under the grid, rather than on every card. */}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t(
          'تبدأ المدة من لحظة تأكيد الدفعة، لا من تاريخ الطلب — فلا تخسر أياماً وأنت تنتظر.',
          'The period starts when your payment is confirmed, not when you request it — so no days are lost waiting.'
        )}
      </p>
    </>
  );
}

/* ── How paying actually works ─────────────────────────────────────────────
   Static, so it renders with the heading rather than waiting on the database.
   This is the part that stops the "I sent the money, why am I still locked
   out" call: the confirmation step is named, up front, as a step.
   ------------------------------------------------------------------------ */

function HowItWorks({ locale, t }) {
  const STEPS = [
    {
      icon: Send,
      title: t('١. اختر خطة', '1. Pick a plan'),
      body: t(
        'اطلبها من هذه الصفحة أو من لوحة معرضك. يُسجّل الطلب باسم معرضك وبسعر اليوم.',
        'Request it here or from your dashboard. It is recorded against your showroom at today’s price.'
      ),
    },
    {
      icon: Landmark,
      title: t('٢. حوّل المبلغ', '2. Transfer the amount'),
      body: t(
        'تظهر لك تفاصيل الحساب البنكي ورقم المستحق فوراً بعد الطلب.',
        'The bank details and your charge reference are shown as soon as you have asked.'
      ),
    },
    {
      icon: BadgeCheck,
      title: t('٣. نؤكد ونفتح اللوحة', '3. We confirm, and the dashboard opens'),
      body: t(
        'عند تأكيد الدفعة تُضاف أيام الخطة كاملة، ويُرفع أي إيقاف تلقائياً.',
        'Once the payment is confirmed the plan’s full days are added and any block is lifted, automatically.'
      ),
    },
  ];

  return (
    <section className="mt-14">
      <h2 className="text-center text-lg font-bold text-brand-primary">
        {t('كيف يتم الدفع', 'How paying works')}
      </h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl bg-white p-5 ring-1 ring-black/5 dark:bg-[#161616] dark:ring-white/10">
            <span className="flex size-9 items-center justify-center rounded-lg bg-brand-primary text-white">
              <Icon className="size-4" />
            </span>
            <p className="mt-3 text-sm font-semibold text-brand-primary">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        {t(
          'الترويج (تمييز سيارة في المقدمة) يُطلب ويُدفع على حدة من لوحة المعرض.',
          'Promotions — putting one car at the front — are requested and paid for separately from your dashboard.'
        )}
      </p>

      <p className="mt-8 text-center text-sm">
        <Link
          href={`/${locale}/marketplace/sell`}
          className="font-medium text-brand-primary hover:underline"
        >
          {t('اعرف المزيد عن البيع على المنصة', 'Read more about selling on the platform')}
        </Link>
      </p>
    </section>
  );
}

function PlansSkeleton() {
  return (
    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-2xl p-6 ring-1 ring-black/5 dark:ring-white/10">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-5 h-8 w-32" />
          <div className="mt-6 space-y-2.5">
            {Array.from({ length: 4 }, (_, j) => (
              <Skeleton key={j} className="h-3 w-full" />
            ))}
          </div>
          <Skeleton className="mt-6 h-10 w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}
