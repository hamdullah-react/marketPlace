import Link from 'next/link';
import { setRequestLocale } from 'next-intl/server';
import {
  Car, Store, Tags, MapPin, Mail, Phone, MessageCircle, ShieldCheck, BadgePercent, Handshake,
  ArrowLeft, ArrowRight, PenLine,
} from 'lucide-react';
import SeoJsonLd from '@/app/[locale]/marketplace/_components/SeoJsonLd';
import SiteSocialIcons from '@/app/[locale]/marketplace/_components/SiteSocialIcons';
import RichTextRender, { hasRichText } from '@/app/[locale]/marketplace/(browse)/vendors/[slug]/_components/RichTextRender';
import { getMarketplaceStats, getSitePage, getSiteSettings } from '@/marketplace/db/queries/site';
import { socialLinksOf } from '@/marketplace/lib/social';
import { pageMetadata } from '@/marketplace/seo/pageMetadata';

/** Managed on Admin → Website content → Pages SEO. */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return pageMetadata('about', locale);
}

/**
 * About us.
 *
 * Everything on this page is the admin's:
 *
 *   the story            Admin → Website content → About us (rich text, per
 *                        language, rendered from the stored document — never HTML)
 *   logo, name, tagline  Admin → Settings → Branding
 *   contact + socials    Admin → Settings → Contact & links
 *   the numbers          the marketplace itself (live cars, showrooms, brands,
 *                        cities), cached for an hour
 *
 * A story missing in the visitor's language falls back to the other one only
 * when Settings → Language allows it. Unpublished or empty, the page still
 * stands — the story card simply says it is on its way.
 */
export default async function AboutPage({ params }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const isAr = locale === 'ar';
  const t = (ar, en) => (isAr ? ar : en);
  const other = isAr ? 'en' : 'ar';
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const [page, site, stats] = await Promise.all([
    getSitePage('about'),
    getSiteSettings(),
    getMarketplaceStats(),
  ]);

  const docLang = hasRichText(page?.body?.[locale])
    ? locale
    : site.localeFallback && hasRichText(page?.body?.[other])
      ? other
      : null;

  const siteName = isAr ? site.name.ar : site.name.en;
  const tagline = isAr ? site.tagline.ar : site.tagline.en;
  const title =
    page?.title?.[locale] || (site.localeFallback ? page?.title?.[other] : '') || t('من نحن', 'About us');
  const address = site.address[locale] || (site.localeFallback ? site.address[other] : '');

  const socials = site.socialLinks ? socialLinksOf({ social_links: site.socialLinks }, locale) : [];
  const nf = new Intl.NumberFormat(isAr ? 'ar-SA' : 'en');

  const STATS = [
    { icon: Car, value: stats.cars, label: t('سيارة معروضة', 'Cars for sale') },
    { icon: Store, value: stats.vendors, label: t('معرض موثوق', 'Trusted showrooms') },
    { icon: Tags, value: stats.brands, label: t('ماركة', 'Brands') },
    { icon: MapPin, value: stats.cities, label: t('مدينة', 'Cities') },
  ];

  const VALUES = [
    {
      icon: ShieldCheck,
      title: t('معارض موثوقة', 'Verified showrooms'),
      body: t(
        'كل معرض يُراجع قبل أن يعرض سياراته، لتشتري من جهة تعرفها.',
        'Every showroom is reviewed before it lists a car, so you buy from someone known.'
      ),
    },
    {
      icon: BadgePercent,
      title: t('أسعار واضحة', 'Clear prices'),
      body: t(
        'السعر والمواصفات والعروض ظاهرة على كل إعلان، بلا مفاجآت.',
        'Price, specifications and offers are on every listing — no surprises.'
      ),
    },
    {
      icon: Handshake,
      title: t('تواصل مباشر', 'Direct contact'),
      body: t(
        'تحدّث مع البائع مباشرة واطلب ما تحتاجه دون وسطاء.',
        'Talk to the seller directly and ask for what you need, with no middleman.'
      ),
    },
  ];

  const whatsappHref = site.whatsapp ? `https://wa.me/${site.whatsapp.replace(/\D/g, '').replace(/^0/, '966')}` : null;

  return (
    <main className="pb-20">
      <SeoJsonLd pageKey="about" locale={locale} />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden bg-brand-primary dark:bg-[var(--brand-ink)]">
        <div aria-hidden="true" className="pointer-events-none absolute -top-32 start-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-gold/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -end-20 h-96 w-96 rounded-full bg-[var(--brand-on-dark)]/20 blur-3xl" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.12),transparent_60%)]"
        />

        <div className="relative mx-auto flex max-w-[1100px] flex-col items-center px-4 pb-24 pt-14 text-center sm:px-8 sm:pb-28 sm:pt-20">
          <div className="raised-card rounded-2xl px-6 py-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={site.logoUrl} alt={siteName} className="h-11 w-auto max-w-[220px] object-contain sm:h-14" />
          </div>

          <p className="mt-7 text-xs font-bold uppercase tracking-[0.25em] text-brand-gold">
            {t('تعرّف علينا', 'Get to know us')}
          </p>
          <h1 className="mt-3 max-w-3xl text-balance text-3xl font-extrabold leading-tight text-white sm:text-5xl">
            {title}
          </h1>
          {tagline ? (
            <p className="mt-4 max-w-2xl text-balance text-sm leading-relaxed text-white/75 sm:text-lg">{tagline}</p>
          ) : null}

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`/${locale}/marketplace/cars`}
              className="raised inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold"
            >
              <Car className="h-4 w-4" />
              {t('تصفّح السيارات', 'Browse cars')}
            </Link>
            <Link
              href={`/${locale}/marketplace/vendors`}
              className="inline-flex items-center gap-2 rounded-full border border-white/30 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
            >
              <Store className="h-4 w-4" />
              {t('المعارض', 'Showrooms')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Numbers, overlapping the hero ────────────────────────────────── */}
      <div className="relative z-10 mx-auto -mt-14 max-w-[1100px] px-4 sm:px-8">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {STATS.map(({ icon: Icon, value, label }) => (
            <div key={label} className="raised-card flex items-center gap-3 rounded-2xl p-4 sm:p-5">
              <span className="raised-solid flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl font-extrabold tabular-nums text-brand-primary sm:text-3xl">
                  {nf.format(value)}
                </span>
                <span className="block truncate text-xs text-muted-foreground sm:text-sm">{label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Story + side panel ───────────────────────────────────────────── */}
      <div className="mx-auto mt-12 grid max-w-[1100px] gap-6 px-4 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article
          dir={docLang ? (docLang === 'ar' ? 'rtl' : 'ltr') : undefined}
          lang={docLang ?? undefined}
          className="raised-card rounded-3xl p-6 sm:p-10"
        >
          <p className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
            <span className="h-px w-8 bg-brand-gold" />
            {t('قصتنا', 'Our story')}
          </p>

          {docLang ? (
            <RichTextRender
              doc={page.body[docLang]}
              className="text-[15px] leading-8 text-gray-700 sm:text-base dark:text-gray-300 [&_h2]:mt-8 [&_h2]:text-2xl [&_h2]:first:mt-0 [&_h3]:mt-6 [&_h3]:text-lg [&_img]:rounded-2xl [&_img]:shadow-md [&_blockquote]:rounded-e-xl [&_blockquote]:bg-brand-primary/5 [&_blockquote]:py-3 [&_blockquote]:pe-4 [&_blockquote]:not-italic"
            />
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <span className="raised flex h-14 w-14 items-center justify-center rounded-full text-brand-primary">
                <PenLine className="h-6 w-6" />
              </span>
              <p className="mt-4 text-lg font-bold text-brand-primary">
                {t('نكتب قصتنا الآن', 'Our story is on its way')}
              </p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                {t(
                  `تعرّف قريباً على ${siteName} والفريق الذي يقف خلفه.`,
                  `Soon you will read more about ${siteName} and the team behind it.`
                )}
              </p>
            </div>
          )}
        </article>

        <aside className="space-y-6">
          {site.contactEmail || site.contactPhone || site.whatsapp || address ? (
            <div className="raised-card rounded-3xl p-6">
              <h2 className="text-sm font-bold text-brand-primary">{t('تواصل معنا', 'Contact us')}</h2>
              <ul className="mt-4 space-y-3 text-sm">
                {site.contactEmail ? (
                  <ContactRow icon={Mail} href={`mailto:${site.contactEmail}`} label={site.contactEmail} ltr />
                ) : null}
                {site.contactPhone ? (
                  <ContactRow icon={Phone} href={`tel:${site.contactPhone.replace(/\s+/g, '')}`} label={site.contactPhone} ltr />
                ) : null}
                {whatsappHref ? (
                  <ContactRow icon={MessageCircle} href={whatsappHref} label={t('واتساب', 'WhatsApp')} external />
                ) : null}
                {address ? <ContactRow icon={MapPin} label={address} /> : null}
              </ul>
            </div>
          ) : null}

          {socials.length ? (
            <div className="raised-card rounded-3xl p-6">
              <h2 className="text-sm font-bold text-brand-primary">{t('تابعنا', 'Follow us')}</h2>
              <SiteSocialIcons links={socials} size="lg" className="mt-4" />
            </div>
          ) : null}

          <div className="relative overflow-hidden rounded-3xl bg-brand-primary p-6 text-white dark:bg-[var(--brand-ink)]">
            <div aria-hidden="true" className="pointer-events-none absolute -end-10 -top-10 h-40 w-40 rounded-full bg-brand-gold/30 blur-2xl" />
            <p className="relative text-lg font-bold">{t(`بِع على ${siteName}`, `Sell on ${siteName}`)}</p>
            <p className="relative mt-1 text-sm text-white/75">
              {t('افتح معرضك واعرض سياراتك أمام المشترين.', 'Open your showroom and put your cars in front of buyers.')}
            </p>
            <Link
              href={`/${locale}/marketplace/sell`}
              className="raised relative mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-bold"
            >
              {t('ابدأ الآن', 'Get started')}
              <Arrow className="h-4 w-4" />
            </Link>
          </div>
        </aside>
      </div>

      {/* ── What we stand for ────────────────────────────────────────────── */}
      <section className="mx-auto mt-16 max-w-[1100px] px-4 sm:px-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-brand-gold">{t('لماذا نحن', 'Why us')}</p>
          <h2 className="mt-2 text-2xl font-extrabold text-brand-primary sm:text-3xl">
            {t(`ما يميّز ${siteName}`, `What makes ${siteName} different`)}
          </h2>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {VALUES.map(({ icon: Icon, title: heading, body }) => (
            <div
              key={heading}
              className="raised-card group rounded-3xl p-6 transition-transform duration-500 hover:-translate-y-1"
            >
              <span className="raised-solid flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-primary text-white">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-5 text-lg font-bold text-brand-primary">{heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/* ── Module scope ─────────────────────────────────────────────────────────── */

function ContactRow({ icon: Icon, href, label, ltr = false, external = false }) {
  const content = (
    <>
      <span className="raised flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span dir={ltr ? 'ltr' : undefined} className="min-w-0 break-words">{label}</span>
    </>
  );

  return (
    <li>
      {href ? (
        <a
          href={href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          className="flex items-center gap-3 text-gray-700 transition-colors hover:text-brand-primary dark:text-gray-300"
        >
          {content}
        </a>
      ) : (
        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">{content}</div>
      )}
    </li>
  );
}
