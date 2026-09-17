/**
 * Marketplace footer. Server component — nothing here is interactive, so it
 * costs zero client JS. Mirrors the main site's footer structure (link columns,
 * social row, payment strip, legal bar) without importing it.
 *
 * The logo, name, tagline and contact details come from Admin → Settings
 * (a cached read).
 */

import Link from "next/link";
import Image from "next/image";
import {
  Mail, Phone, Globe, Ghost, Link as LinkIcon, MessageCircle, Send, MapPin, Store, Star,
  Image as ImageIcon, Video, FileText,
} from "lucide-react";
import { getSiteSettings } from "@/marketplace/db/queries/site";
import { socialLinksOf } from "@/marketplace/lib/social";

const SOCIAL = [
  { href: "https://x.com/Alromaihcars", src: "/images/Twitter.svg", label: "X" },
  { href: "https://www.facebook.com/alromaihcars", src: "/images/Facebook.svg", label: "Facebook" },
  { href: "https://www.youtube.com/@alromaihcar", src: "/images/Youtube.svg", label: "YouTube" },
  { href: "https://www.instagram.com/alromaihcars/", src: "/images/Instagram.svg", label: "Instagram" },
  { href: "https://www.tiktok.com/@alromaihcars", src: "/images/Tiktok.svg", label: "TikTok" },
];

const PAYMENTS = [
  { src: "/icons/Visa.svg", label: "Visa" },
  { src: "/icons/Mastercard.svg", label: "MasterCard" },
  { src: "/icons/Mada.svg", label: "Mada" },
];

const COLUMNS = [
  {
    ar: "تصفح", en: "Browse",
    links: [
      { ar: "كل السيارات", en: "All Cars", href: "/marketplace/cars" },
      { ar: "المعارض", en: "Showrooms", href: "/marketplace/vendors" },
      { ar: "الماركات", en: "Brands", href: "/marketplace/brands" },
      { ar: "مقارنة", en: "Compare", href: "/marketplace/compare" },
    ],
  },
  {
    ar: "البيع", en: "Selling",
    links: [
      { ar: "بِع سيارتك", en: "Sell Your Car", href: "/marketplace/sell" },
      { ar: "انضم كمعرض", en: "Become a Vendor", href: "/marketplace/sell/apply" },
      { ar: "لوحة البائع", en: "Seller Dashboard", href: "/marketplace/seller" },
      { ar: "الرسوم", en: "Fees", href: "/marketplace/fees" },
    ],
  },
  {
    ar: "المساعدة", en: "Help",
    links: [
      { ar: "من نحن", en: "About Us", href: "/marketplace/about" },
      { ar: "كيف يعمل", en: "How It Works", href: "/marketplace/how-it-works" },
      { ar: "مركز المساعدة", en: "Help Centre", href: "/marketplace/help" },
      { ar: "حماية المشتري", en: "Buyer Protection", href: "/marketplace/buyer-protection" },
      { ar: "شروط البائع", en: "Seller Terms", href: "/marketplace/seller-terms" },
    ],
  },
];

/** The closed icon set a custom link may wear (lib/social.ts), plus the two platforms with no SVG. */
const MARKS = {
  link: LinkIcon, globe: Globe, ghost: Ghost, "message-circle": MessageCircle, send: Send,
  phone: Phone, mail: Mail, "map-pin": MapPin, store: Store, star: Star, image: ImageIcon,
  video: Video, "file-text": FileText,
};

function LucideMark({ name }) {
  const Icon = MARKS[name] ?? LinkIcon;
  return (
    <Icon
      aria-hidden="true"
      className="h-[17px] w-[17px] text-brand-primary transition-colors duration-300 group-hover/social:text-brand-dark dark:text-brand-on-dark dark:group-hover/social:text-white"
    />
  );
}

export default async function MarketplaceFooter({ locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const year = 2026;

  const site = await getSiteSettings();
  const siteName = isAr ? site.name.ar : site.name.en;
  const tagline = isAr ? site.tagline.ar : site.tagline.en;
  // SVG and uploaded (absolute URL) logos load directly, not via the optimiser,
  // which returns 500 when it cannot fetch the upload in time. See loadDirect in
  // MarketplaceHeader.
  const directLogo = /\.svg($|\?)/i.test(site.logoUrl) || /^https?:\/\//i.test(site.logoUrl);

  // Admin → Settings → Contact & links: the same list a showroom keeps. The
  // built-in links are only used until that column exists.
  const socials = site.socialLinks
    ? socialLinksOf({ social_links: site.socialLinks }, locale)
    : SOCIAL.map((s) => ({ key: s.label, label: s.label, href: s.href, icon: s.src, lucide: null }));

  return (
    <footer
      dir={isAr ? "rtl" : "ltr"}
      className="mt-16 border-t border-brand-primary/10 bg-[var(--app-bg)] font-noto dark:border-white/10 dark:bg-[var(--app-bg-dark)]"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-8 sm:py-12 lg:px-20 xl:px-28">
        {/* Three link columns side by side on a phone, under the brand block,
            rather than two and a stragglers' row — the footer was a long
            single-file scroll of links on a small screen. */}
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:gap-8 md:grid-cols-4">
          {/* ── Brand ─────────────────────────────────────────────────── */}
          <div className="col-span-3 md:col-span-1">
            <div className="relative h-[40px] w-[140px] sm:h-[52px] sm:w-[180px]">
              <Image
                src={site.logoUrl}
                alt={siteName}
                fill
                sizes="(max-width: 640px) 140px, 180px"
                className="object-contain object-start"
                loading="lazy"
                unoptimized={directLogo}
              />
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-gray-600 dark:text-gray-400 sm:mt-4 sm:text-sm">
              {tagline}
            </p>

            {site.contactEmail || site.contactPhone ? (
              <ul className="mt-3 space-y-1.5 text-xs text-gray-600 sm:mt-4 sm:text-sm dark:text-gray-400">
                {site.contactEmail ? (
                  <li>
                    <a href={`mailto:${site.contactEmail}`} className="inline-flex items-center gap-2 hover:text-brand-primary">
                      <Mail className="h-4 w-4" />
                      <span dir="ltr">{site.contactEmail}</span>
                    </a>
                  </li>
                ) : null}
                {site.contactPhone ? (
                  <li>
                    <a href={`tel:${site.contactPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-2 hover:text-brand-primary">
                      <Phone className="h-4 w-4" />
                      <span dir="ltr">{site.contactPhone}</span>
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}

            <div className="mt-4 flex items-center gap-2 sm:mt-6 sm:gap-2.5">
              {socials.map((s, i) => (
                <Link
                  key={`${s.key}-${i}`}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="group/social raised flex h-8 w-8 items-center justify-center rounded-full sm:h-9 sm:w-9"
                >
                  {/*
                    MASKED, not drawn.

                    These were <Image> tags pointing at flat black SVGs, with
                    `dark:invert` to make them white again — which is the whole
                    reason they could not take the brand colour: an <img> is a
                    picture, and nothing in CSS can recolour its pixels.

                    Using the same file as a MASK inverts the relationship. The
                    artwork supplies the shape, the background supplies the
                    colour, and the colour is a brand token — so these follow
                    the theme like every other mark on the page instead of
                    being two hardcoded states (black, and inverted black).

                    Same five files, no new assets, and the alt text moves to
                    the link's aria-label where it belongs — the icon is now
                    decoration and the link is the thing being labelled.
                  */}
                  {s.icon ? (
                  <span
                    aria-hidden="true"
                    className="block h-[15px] w-[15px] bg-brand-primary sm:h-[17px] sm:w-[17px] transition-colors duration-300 group-hover/social:bg-brand-dark dark:bg-brand-on-dark dark:group-hover/social:bg-white"
                    style={{
                      maskImage: `url(${s.icon})`,
                      WebkitMaskImage: `url(${s.icon})`,
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskPosition: "center",
                    }}
                  />
                  ) : (
                    <LucideMark name={s.lucide} />
                  )}
                </Link>
              ))}
            </div>
          </div>

          {/* ── Link columns ──────────────────────────────────────────── */}
          {COLUMNS.map((col) => (
            <div key={col.en} className="min-w-0">
              <h3 className="text-xs font-bold text-brand-primary sm:text-sm">{t(col.ar, col.en)}</h3>
              <ul className="mt-2 space-y-1 sm:mt-4 sm:space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={`/${locale}${l.href}`}
                      /* raised-hover: flat at rest, lifted on hover, pressed on
                         click. Flat at rest because a column of twelve
                         permanently-raised chips reads as a keypad, not a list
                         of links. See globals.css. */
                      className="raised-hover -mx-1 inline-block rounded-lg px-1 py-0.5 text-[11px] font-bold leading-snug text-gray-600 dark:text-gray-400 sm:-mx-2 sm:px-2 sm:py-1 sm:text-sm"
                    >
                      {t(l.ar, l.en)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Payments ────────────────────────────────────────────────── */}
        <div className="mt-6 flex flex-row items-center justify-between gap-3 border-t border-gray-100 pt-5 dark:border-gray-800 sm:mt-10 sm:gap-4 sm:pt-8">
          <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400 sm:text-xs">
            {t("طرق الدفع المقبولة", "Accepted payment methods")}
          </p>
          <div className="flex shrink-0 items-center gap-3 sm:gap-6">
            {PAYMENTS.map((p) => (
              <Image
                key={p.label}
                src={p.src}
                alt={p.label}
                width={45}
                height={30}
                style={{ width: "auto" }}
                className="h-5 object-contain sm:h-[30px]"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Legal bar ─────────────────────────────────────────────────── */}
      <div className="border-t border-brand-primary/10 bg-brand-primary/[0.04] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-gray-500 sm:gap-3 sm:py-5 sm:text-xs dark:text-gray-400 sm:flex-row sm:px-8 lg:px-20 xl:px-28">
          <p>
            © {year} {siteName}. {t("جميع الحقوق محفوظة.", "All rights reserved.")}
          </p>
          <div className="flex items-center gap-4 sm:gap-5">
            <Link href={`/${locale}/privacy-policy`} className="transition-colors hover:text-brand-primary">
              {t("سياسة الخصوصية", "Privacy Policy")}
            </Link>
            <Link href={`/${locale}/terms-and-conditions`} className="transition-colors hover:text-brand-primary">
              {t("الشروط والأحكام", "Terms")}
            </Link>
            <Link href={`/${locale}`} className="transition-colors hover:text-brand-primary">
              {t("الموقع الرئيسي", "Main site")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
