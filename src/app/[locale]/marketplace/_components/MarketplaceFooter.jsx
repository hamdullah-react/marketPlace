/**
 * Marketplace footer. Server component — nothing here is interactive, so it
 * costs zero client JS. Mirrors the main site's footer structure (link columns,
 * social row, payment strip, legal bar) without importing it.
 */

import Link from "next/link";
import Image from "next/image";

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
      { ar: "كيف يعمل", en: "How It Works", href: "/marketplace/how-it-works" },
      { ar: "مركز المساعدة", en: "Help Centre", href: "/marketplace/help" },
      { ar: "حماية المشتري", en: "Buyer Protection", href: "/marketplace/buyer-protection" },
      { ar: "شروط البائع", en: "Seller Terms", href: "/marketplace/seller-terms" },
    ],
  },
];

export default function MarketplaceFooter({ locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const year = 2026;

  return (
    <footer
      dir={isAr ? "rtl" : "ltr"}
      className="mt-16 border-t border-brand-primary/10 bg-[var(--app-bg)] font-noto dark:border-white/10 dark:bg-[var(--app-bg-dark)]"
    >
      <div className="mx-auto max-w-[1600px] px-4 py-12 sm:px-8 lg:px-20 xl:px-28">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* ── Brand ─────────────────────────────────────────────────── */}
          <div className="col-span-2 md:col-span-1">
            <div className="relative h-[52px] w-[180px]">
              <Image
                src="/alromaih/new logo.png"
                alt="Alromaih"
                fill
                sizes="180px"
                className="object-contain"
                loading="lazy"
              />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-600 dark:text-gray-400">
              {t(
                "سوق الرميح — بيع واشترِ السيارات من معارض موثوقة في السعودية.",
                "Alromaih Marketplace — buy and sell cars through trusted showrooms across Saudi Arabia."
              )}
            </p>

            <div className="mt-6 flex items-center gap-2.5">
              {SOCIAL.map((s) => (
                <Link
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="group/social raised flex h-9 w-9 items-center justify-center rounded-full"
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
                  <span
                    aria-hidden="true"
                    className="block h-[17px] w-[17px] bg-brand-primary transition-colors duration-300 group-hover/social:bg-brand-dark dark:bg-brand-on-dark dark:group-hover/social:bg-white"
                    style={{
                      maskImage: `url(${s.src})`,
                      WebkitMaskImage: `url(${s.src})`,
                      maskSize: "contain",
                      WebkitMaskSize: "contain",
                      maskRepeat: "no-repeat",
                      WebkitMaskRepeat: "no-repeat",
                      maskPosition: "center",
                      WebkitMaskPosition: "center",
                    }}
                  />
                </Link>
              ))}
            </div>
          </div>

          {/* ── Link columns ──────────────────────────────────────────── */}
          {COLUMNS.map((col) => (
            <div key={col.en}>
              <h3 className="text-sm font-bold text-brand-primary">{t(col.ar, col.en)}</h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={`/${locale}${l.href}`}
                      /* raised-hover: flat at rest, lifted on hover, pressed on
                         click. Flat at rest because a column of twelve
                         permanently-raised chips reads as a keypad, not a list
                         of links. See globals.css. */
                      className="raised-hover -mx-2 inline-block rounded-lg px-2 py-1 text-sm font-bold text-gray-600 dark:text-gray-400"
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
        <div className="mt-10 flex flex-col items-start gap-4 border-t border-gray-100 pt-8 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {t("طرق الدفع المقبولة", "Accepted payment methods")}
          </p>
          <div className="flex items-center gap-6">
            {PAYMENTS.map((p) => (
              <Image
                key={p.label}
                src={p.src}
                alt={p.label}
                width={45}
                height={30}
                style={{ width: "auto", height: 30 }}
                className="object-contain"
                loading="lazy"
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Legal bar ─────────────────────────────────────────────────── */}
      <div className="border-t border-brand-primary/10 bg-brand-primary/[0.04] dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mx-auto flex max-w-[1600px] flex-col items-center justify-between gap-3 px-4 py-5 text-xs text-gray-500 dark:text-gray-400 sm:flex-row sm:px-8 lg:px-20 xl:px-28">
          <p>
            © {year} {t("شركة الرميح للسيارات. جميع الحقوق محفوظة.", "Alromaih Cars. All rights reserved.")}
          </p>
          <div className="flex items-center gap-5">
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
