import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import {
  Store, Camera, MessageSquare, BarChart3, ShieldCheck, Zap, ArrowRight, Check,
} from 'lucide-react';
import { getViewer } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';
import { getSiteSettings } from '@/marketplace/db/queries/site';

/**
 * The session is read at the top of this component, so the shell cannot be
 * prerendered without blocking. Same reason, same fix as listing/[slug]:
 * route-segment-config/instant.md, "Disabling instant".
 */
export const instant = false;

/** Managed on Admin → Website content → Pages SEO (defaults in lib/sitePages.js). */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('sell', locale);
}

/**
 * The page that turns a visitor into a seller.
 *
 * Unlike everything else under /sell it is PUBLIC and indexable — this is the
 * page a showroom owner finds by searching, so it carries the pitch rather than
 * a form. The form is one click away at /sell/apply.
 *
 * The single call to action changes with who is reading, because a page that
 * says "Get started" to somebody who already has a showroom is a page that
 * wasted their click:
 *
 *   signed out      → Get started  (login, then straight back here)
 *   signed in       → Open your showroom
 *   already selling → Go to your dashboard
 */
export default async function SellPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);

  const [viewer, site] = await Promise.all([getViewer(), getSiteSettings()]);
  const siteName = isAr ? site.name.ar : site.name.en;

  // A showroom that exists but is suspended or rejected is not "already
  // selling" — those people belong on the status page, which explains why.
  let pending = null;
  if (viewer && !viewer.vendors.length) {
    const { data } = await getMarketplaceDb()
      .from('vendor_members')
      .select('vendor_id')
      .eq('user_id', viewer.userId)
      .limit(1)
      .maybeSingle();
    pending = data ?? null;
  }

  const cta = !viewer
    ? {
        href: `/${locale}/marketplace/login?next=${encodeURIComponent(`/${locale}/marketplace/sell/apply`)}`,
        ar: 'ابدأ الآن',
        en: 'Get started',
      }
    : viewer.vendors.length
      ? { href: `/${locale}/marketplace/seller`, ar: 'إلى لوحة البائع', en: 'Go to your dashboard' }
      : pending
        ? { href: `/${locale}/marketplace/sell/apply/status`, ar: 'حالة معرضك', en: 'Your showroom status' }
        : { href: `/${locale}/marketplace/sell/apply`, ar: 'افتح معرضك', en: 'Open your showroom' };

  const SELLING_POINTS = [
    {
      icon: Zap,
      ar: 'ابدأ فوراً',
      en: 'Start immediately',
      bodyAr: 'لا انتظار ولا مراجعة. تملأ النموذج وتفتح لوحة البائع في نفس اللحظة.',
      bodyEn: 'No queue, no review. Fill in the form and your dashboard opens the same minute.',
    },
    {
      icon: Camera,
      ar: 'إعلانات تليق بسياراتك',
      en: 'Listings that do your cars justice',
      bodyAr: 'صور داخلية وخارجية، ألوان متعددة، ومواصفات كاملة من كتالوج جاهز.',
      bodyEn: 'Interior and exterior galleries, colour variants, and full specs from a ready-made catalog.',
    },
    {
      icon: MessageSquare,
      ar: 'تواصل مباشر مع المشتري',
      en: 'Buyers reach you directly',
      bodyAr: 'الاستفسارات تصل إلى لوحتك، ويمكنك الرد عليها من نفس المكان.',
      bodyEn: 'Enquiries land in your dashboard and you answer them from the same place.',
    },
    {
      icon: BarChart3,
      ar: 'تعرف ما الذي يُشاهَد',
      en: 'See what gets looked at',
      bodyAr: 'مشاهدات كل إعلان وأداء معرضك، بدون تخمين.',
      bodyEn: 'Views per listing and how your showroom is doing — without guessing.',
    },
  ];

  const STEPS = [
    {
      ar: 'أنشئ حسابك',
      en: 'Create your account',
      bodyAr: 'بالبريد الإلكتروني أو عبر جوجل.',
      bodyEn: 'With an email address, or with Google.',
    },
    {
      ar: 'أخبرنا عن معرضك',
      en: 'Tell us about your showroom',
      bodyAr: 'الاسم والمدينة ورقم التواصل. أقل من دقيقة.',
      bodyEn: 'Name, city and a phone number. Under a minute.',
    },
    {
      ar: 'أضف أول سيارة',
      en: 'Add your first car',
      bodyAr: 'اختر الماركة والموديل من الكتالوج، وارفع الصور.',
      bodyEn: 'Pick the make and model from the catalog, then upload the photos.',
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:py-16">
      <SeoJsonLd pageKey="sell" locale={locale} />
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-primary/10 px-3 py-1 text-xs font-medium text-brand-primary">
          <Store className="h-3.5 w-3.5" />
          {t('للمعارض والتجّار', 'For showrooms and dealers')}
        </span>

        <h1 className="mx-auto mt-5 max-w-3xl text-3xl font-bold leading-tight text-brand-primary sm:text-4xl md:text-5xl">
          {t(`بِع سياراتك على ${siteName}`, `Sell your cars on ${siteName}`)}
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-base text-gray-600 sm:text-lg dark:text-gray-400">
          {t(
            'افتح معرضك في دقائق، واعرض سياراتك أمام مشترين يبحثون عنها بالفعل.',
            'Open your showroom in minutes and put your cars in front of buyers already looking for them.'
          )}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={cta.href}
            className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white"
          >
            {t(cta.ar, cta.en)}
            <ArrowRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />
          </Link>

          <Link
            href={`/${locale}/marketplace/cars`}
            className="rounded-lg border border-gray-300 px-6 py-3 text-sm transition-colors hover:border-brand-primary dark:border-gray-600"
          >
            {t('شاهد السوق أولاً', 'See the marketplace first')}
          </Link>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          {t('مجاناً — بدون رسوم إدراج.', 'Free to join — no listing fee.')}
        </p>
      </div>

      {/* ── What you get ──────────────────────────────────────────────────── */}
      <div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SELLING_POINTS.map(({ icon: Icon, ar, en, bodyAr, bodyEn }) => (
          <div
            key={en}
            className="raised-card rounded-xl p-5 transition-transform duration-300 hover:-translate-y-0.5"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary/10">
              <Icon className="h-5 w-5 text-brand-primary" />
            </span>
            <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">{t(ar, en)}</h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{t(bodyAr, bodyEn)}</p>
          </div>
        ))}
      </div>

      {/* ── Three steps ───────────────────────────────────────────────────── */}
      <div className="mt-16">
        <h2 className="text-center text-2xl font-bold text-brand-primary">
          {t('ثلاث خطوات', 'Three steps')}
        </h2>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.en} className="text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-primary text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 font-semibold text-gray-900 dark:text-gray-100">
                {t(step.ar, step.en)}
              </h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {t(step.bodyAr, step.bodyEn)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── The verified badge ────────────────────────────────────────────
          Its own block because it is the one thing that is NOT instant, and
          burying that would make the badge look arbitrary when it appears on
          somebody else's showroom and not yours.
          ------------------------------------------------------------------ */}
      <div className="mt-16 flex flex-col items-start gap-4 rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-6 sm:flex-row sm:items-center sm:p-8">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white shadow-xs dark:bg-[#1c1c1c]">
          <ShieldCheck className="h-6 w-6 text-brand-primary" />
        </span>
        <div>
          <h3 className="font-semibold text-brand-primary">
            {t('شارة «موثّق»', 'The “Verified” badge')}
          </h3>
          <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
            {t(
              'تبيع من اليوم الأول. أضف سجلك التجاري وسيتحقق منه الفريق، وتظهر الشارة على صفحة معرضك — وهي ما يبحث عنه المشتري قبل أن يتصل.',
              'You sell from day one. Add your commercial registration and the team checks it, then the badge appears on your showroom page — it is what a buyer looks for before picking up the phone.'
            )}
          </p>
        </div>
      </div>

      {/* ── Close ─────────────────────────────────────────────────────────── */}
      <div className="mt-16 text-center">
        <h2 className="text-2xl font-bold text-brand-primary">
          {t('جاهز؟', 'Ready?')}
        </h2>
        <ul className="mx-auto mt-4 inline-flex flex-col gap-2 text-start text-sm text-gray-700 dark:text-gray-300">
          {[
            { ar: 'بدون رسوم إدراج', en: 'No listing fee' },
            { ar: 'عدد غير محدود من السيارات', en: 'Unlimited cars' },
            { ar: 'يمكنك إيقاف معرضك في أي وقت', en: 'Pause your showroom whenever you like' },
          ].map((line) => (
            <li key={line.en} className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-green-600" />
              {t(line.ar, line.en)}
            </li>
          ))}
        </ul>

        <div className="mt-8">
          <Link
            href={cta.href}
            className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-6 py-3 text-sm font-medium text-white"
          >
            {t(cta.ar, cta.en)}
            <ArrowRight className={`h-4 w-4 ${isAr ? 'rotate-180' : ''}`} />
          </Link>
        </div>
      </div>
    </div>
  );
}
