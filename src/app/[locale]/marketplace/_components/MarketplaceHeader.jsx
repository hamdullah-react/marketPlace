"use client";

/**
 * Marketplace header — fixed, 80px, same silhouette as the main site's Header
 * so the two feel like one company, but self-contained: its own nav model, its
 * own profile menu, no imports from @/MyComponents.
 *
 * ── Three layouts, not two ──────────────────────────────────────────────────
 *
 *   < 640  phone      hamburger + logo + search + language + profile, all
 *                     one step down — 28px logo, 32px controls, 20px glyphs.
 *                     At full size that row was the widest thing on a 320px
 *                     screen and the bar looked stuffed.
 *   < 1024 tablet     the same at full size, plus the saved-cars heart
 *   ≥ 1024 desktop    the full nav bar, compact
 *   ≥ 1280 desktop    the full nav bar, roomy
 *
 * The lg→xl split is the part that is easy to miss. At exactly 1024px the
 * container's own `lg:px-20` eats 160px, and the English labels ("Sell Your
 * Car", "How It Works") are long enough that logo + nav + actions overflowed
 * and the bar wrapped. So between lg and xl the logo shrinks, the MARKET badge
 * steps out, and the nav tightens its padding and type — the same bar, one
 * size down, rather than a different bar.
 *
 * The horizontal padding scale deliberately matches the pages underneath
 * (`px-4 sm:px-8 lg:px-20 xl:px-28`) so the logo sits on the same line as the
 * filter rail below it. Fixing the overflow by shrinking the padding instead
 * would have broken that alignment on every page in the segment.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useOnChange } from "@/hooks/use-on-change";
import {
  Menu, X, Search, Heart, User, ChevronDown, Store, LogOut,
  LogIn, UserPlus, SlidersHorizontal, ClipboardList, Car, Plus,
  LayoutDashboard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import LanguageSwitcher from "./LanguageSwitcher";
import { syncSavedCount, useSavedCount } from "./savedStore";
import { signOut } from "../(auth)/_actions/auth";

/**
 * Loaded when it is first opened, not with the header.
 *
 * The modal pulls in Radix's Dialog and the two search actions, and it sits in
 * the layout of every page in the marketplace — bundling it with the bar would
 * put a control almost nobody presses on the critical path of every visit.
 * ssr:false because there is nothing to render on the server: it is closed.
 */
const SearchModal = dynamic(() => import("./SearchModal"), { ssr: false });

/**
 * The nav model.
 *
 * `dropdown` is a list of sub-links. Optional — an item without one renders as
 * a plain link, which is why adding a menu to "Showrooms" later is a data
 * change here and nothing else.
 *
 * Every entry is a real route with a page behind it: /cars, /cars/new,
 * /cars/used, /brands. Not filter URLs and not a grid of brand logos — the
 * menu names pages, and each of those pages carries its own title, its own
 * description and its own place in the sitemap, which a `?condition=new` on
 * the all-cars page never could.
 *
 * The offers row carries a `when` because offers expire: there are none live
 * today, so the entry would open on an empty grid. It comes back on its own
 * the moment a seller runs one.
 */
const NAV = [
  {
    key: "cars",
    ar: "السيارات",
    en: "Cars",
    href: "/marketplace/cars",
    dropdown: [
      { key: "all", ar: "كل السيارات", en: "All cars", href: "/marketplace/cars" },
      { key: "new", ar: "سيارات جديدة", en: "New cars", href: "/marketplace/cars/new" },
      { key: "used", ar: "سيارات مستعملة", en: "Used cars", href: "/marketplace/cars/used" },
      { key: "brands", ar: "الماركات", en: "Car brands", href: "/marketplace/brands" },
      {
        key: "offers",
        ar: "سيارات عليها عروض",
        en: "Cars with offers",
        href: "/marketplace/cars?has_offer=1",
        when: ({ offerCount }) => offerCount > 0,
      },
    ],
  },
  { key: "vendors", ar: "المعارض", en: "Showrooms", href: "/marketplace/vendors" },
  { key: "compare", ar: "المقارنة", en: "Compare", href: "/marketplace/compare" },
  { key: "sell", ar: "بِع سيارتك", en: "Sell Your Car", href: "/marketplace/sell" },
  { key: "how", ar: "كيف يعمل", en: "How It Works", href: "/marketplace/how-it-works" },
];

/**
 * Initials, for when there is no photo.
 *
 * `name` is the full name when we have one and the EMAIL when we do not, so the
 * domain is cut off first: thetedred@gmail.com was rendering "TC", the C coming
 * from "com". An address gives one letter, a real name gives two.
 *
 * \p{L} rather than A-Z, because most of these names are Arabic.
 */
function initialsOf(name = "") {
  const local = String(name).split("@")[0];
  const parts = local.split(/[\s._-]+/).filter((w) => /^\p{L}/u.test(w));
  if (!parts.length) return null;
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function MarketplaceHeader({ locale = "ar", viewer = null, offerCount = 0, savedCount = 0 }) {
  const isAr = locale === "ar";
  const pathname = usePathname() || "";
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  /* Search is a dialog, not a route — see SearchModal. `mountedSearch` is what
     keeps it out of the bundle until the icon is pressed: `open` alone would
     still import the chunk on first paint. */
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchMounted, setSearchMounted] = useState(false);
  // Which nav section is expanded in the mobile drawer. One at a time: the
  // drawer is 320px wide and a second open accordion pushes everything below
  // it off the bottom of a phone.
  const [openSection, setOpenSection] = useState(null);
  // Google's avatar URLs expire and are rate limited, so the <img> can 404 on a
  // perfectly valid session. Without this the circle renders empty and the
  // header looks broken rather than merely photo-less.
  const [avatarBroken, setAvatarBroken] = useState(false);
  const profileRef = useRef(null);

  const t = (ar, en) => (isAr ? ar : en);

  /**
   * The saved-cars number, live.
   *
   * `savedCount` is what the server knew when this layout last rendered, and a
   * layout does not re-render when a heart is tapped three routes away — so it
   * is the FALLBACK, and the store is the answer. See savedStore.js.
   */
  const savedLive = useSavedCount(savedCount);

  /* The server's number, handed to the store so a card that nudges it has
     something to count from. In an effect because publishing during render is
     a write to another component's state mid-render; keyed on the value so a
     fresher server count (another device, another tab) still wins. */
  useEffect(() => {
    syncSavedCount(savedCount);
  }, [savedCount]);

  /**
   * The sub-links an item actually has right now, and null when it has none.
   *
   * Resolved once, here, rather than filtered separately in the desktop panel
   * and the drawer — two copies of the same condition is how a row ends up
   * showing on phones only. An item whose links all drop out falls back to a
   * plain link, chevron and all.
   */
  const menuFor = (item) => {
    const subs = (item.dropdown ?? []).filter((sub) => !sub.when || sub.when({ offerCount }));
    return subs.length ? subs : null;
  };

  /**
   * Sign in, and come back to where you were.
   *
   * Without the `next` the visitor lands on the marketplace home and has to
   * find their way back to the car they were looking at — which is the moment
   * most people give up on signing in at all.
   */
  const authHref = (route) =>
    `/${locale}/marketplace/${route}${
      pathname && !pathname.includes("/marketplace/login") && !pathname.includes("/marketplace/signup")
        ? `?next=${encodeURIComponent(pathname)}`
        : ""
    }`;

  /**
   * What the menu offers, by who is looking.
   *
   * Built here rather than inline in the JSX because the desktop dropdown and
   * the mobile drawer both draw it, and two hand-kept copies is how a Seller
   * Dashboard link ends up showing to buyers on phones only.
   *
   * The dashboard and catalog entries are hidden from people who cannot use
   * them. This is presentation, not protection — proxy.js redirects and the
   * database refuses — but a menu that lists a door you cannot open is a menu
   * that lies.
   */
  /**
   * Buying and selling, kept apart.
   *
   * Every signed-in person is now both — everyone gets a showroom — so the flat
   * list this used to be put "Saved Cars" directly above "Seller Dashboard" and
   * left the reader to work out that the two belong to different halves of the
   * product. Worse, there were two "Settings" in play (the buyer's addresses
   * and the showroom's profile) with nothing saying which was which.
   *
   * Two labelled groups, and each item named for the side it belongs to. The
   * grouping is the whole point, so this is a list OF LISTS rather than a flat
   * one with separators bolted on — a separator can be forgotten when an item
   * is added, a group cannot.
   */
  const menu = viewer
    ? [
        {
          key: "buying",
          ar: "التسوّق",
          en: "Buying",
          items: [
            {
              icon: Heart, ar: "السيارات المحفوظة", en: "Saved cars",
              href: "/marketplace/account/saved",
              // Live, from the same store as the badge on the icon — the two
              // are a foot apart and disagreeing would be worse than either
              // being stale on its own.
              count: savedLive,
            },
            /**
             * ── "My orders" is not here, on purpose ─────────────────────────
             *
             * It linked to /marketplace/account/orders, which does not exist —
             * so it was a 404 in the account menu of a live marketplace. The
             * commerce routes it was reaching for (cart, checkout, orders,
             * track-order) are all ComingSoon stubs, nothing anywhere inserts
             * into `orders`, and the table is empty.
             *
             * The two are NOT the same thing and should not be merged when
             * checkout ships:
             *
             *   request   "call me about this car" — no money, no stock. It is
             *             how a 200,000 SAR car is actually sold, and nobody
             *             buys one through a Buy Now button.
             *   order     "I paid for this" — a brake pad, a service, an
             *             accessory. It carries a refund, a dispute window and
             *             a delivery, none of which a request has.
             *
             * The schema already draws that line: listing_type has all four,
             * and listings_stock_required_for_goods forces stock on parts and
             * accessories precisely because those are the checkout-able ones.
             *
             * So the entry comes back when there is something behind it —
             * labelled "مشترياتي" in Arabic, NOT "طلباتي". See below.
             */
            {
              icon: ClipboardList,
              // Was "طلباتي للأسعار" while the line under it read "طلباتي".
              // In Arabic those are near-identical, which is why a buyer could
              // not tell the two menu items apart — the English pair "requests"
              // and "orders" hid a collision that only existed in the language
              // most of these buyers actually read.
              ar: "طلباتي",
              en: "My requests",
              href: "/marketplace/account/requests",
            },
            /**
             * Addresses is NOT here any more.
             *
             * It is one page, reached rarely — you set an address once and then
             * do not think about it again — and it was taking a third of the
             * Buying group to say so. It lives on the account page now, where
             * the default address is shown in full rather than as a link to a
             * list, and that is both fewer clicks and more information than
             * this row ever gave.
             */
          ],
        },
        {
          key: "selling",
          ar: "البيع",
          en: "Selling",
          /**
           * One invitation, or the whole dashboard. Never both, and never the
           * dashboard to someone who has no showroom.
           *
           * A menu that lists "My listings" and "Showroom settings" to a buyer
           * is promising four pages that will all bounce them to the
           * application form. Offering the application itself is the honest
           * version of the same menu, and it is a better invitation than a
           * dashboard link that turns out to be a form.
           */
          items: viewer.isVendor
            ? [
                { icon: LayoutDashboard, ar: "لوحة البائع", en: "Seller dashboard", href: "/marketplace/seller" },
                { icon: Car, ar: "إعلاناتي", en: "My listings", href: "/marketplace/seller/listings" },
                { icon: Plus, ar: "إضافة سيارة", en: "Add a car", href: "/marketplace/seller/listings/new" },
                // Named "Showroom settings", never just "Settings" — the buying
                // group has its own and the two are different pages.
                { icon: Store, ar: "إعدادات المعرض", en: "Showroom settings", href: "/marketplace/seller/settings" },
              ]
            : [
                { icon: Store, ar: "سجّل معرضك", en: "Register your showroom", href: "/marketplace/sell/apply" },
              ],
        },
        // Staff only, and its own group so it can never be mistaken for one of
        // the two halves everybody has.
        ...(viewer.isStaff
          ? [{
              key: "platform",
              ar: "المنصة",
              en: "Platform",
              items: [
                { icon: SlidersHorizontal, ar: "الكتالوج", en: "Catalog", href: "/marketplace/seller/catalog" },
              ],
            }]
          : []),
      ]
    : [];

  // Close the profile menu on outside click and on route change — a dropdown
  // that survives navigation looks broken.
  useEffect(() => {
    const onClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Navigating closes both menus. During render rather than in an effect: the
  // new page paints with the old menu still open for a frame otherwise, which
  // on the mobile drawer is a full-screen panel flashing over the page the
  // visitor just asked for.
  useOnChange(pathname, () => {
    setProfileOpen(false);
    setMenuOpen(false);
  });

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [menuOpen]);

  const isActive = (href) => pathname.startsWith(`/${locale}${href}`);

  /**
   * A sub-link is only ever marked current when it carries no query string.
   *
   * Reading `?condition=new` back off the URL would mean useSearchParams(),
   * which opts its subtree into client rendering — in a component that lives
   * in a LAYOUT that would drag every page in the segment with it. Not worth
   * a highlight on four menu rows.
   */
  const isSubActive = (href) => !href.includes("?") && pathname === `/${locale}${href}`;

  // Every drawer link closes the drawer. The pathname effect above is not
  // enough on its own: some menu links only change the QUERY STRING, so tapping
  // one from /marketplace/cars would leave the drawer sitting open over the
  // results it had just filtered.
  const closeDrawer = () => setMenuOpen(false);

  /**
   * Photo, then initials, then the generic mark.
   *
   * A plain <img>, not next/image: this is 32 pixels from a host that is not in
   * the remotePatterns allow-list, and routing it through the optimizer would
   * add a round trip through our own server to save nothing.
   *
   * referrerPolicy="no-referrer" is not decoration — Google returns 403 for
   * googleusercontent requests carrying some referrers, and the photo silently
   * fails to load on exactly the sign-in it was fetched for.
   */
  /* The avatar is the module-scope <ViewerAvatar>, called directly at each
     site. No local wrapper: a wrapper is itself a new component type on every
     render, so React would unmount everything under it and the hoist would
     buy nothing. This header re-renders on scroll and on every menu open. */
  const avatarProps = {
    viewer,
    broken: avatarBroken,
    onBroken: () => setAvatarBroken(true),
  };

  return (
    <>
      <header
        dir={isAr ? "rtl" : "ltr"}
        className="fixed inset-x-0 top-0 z-50 h-20 w-full bg-white font-noto shadow-lg transition-colors duration-300 dark:bg-[#0f0f0f]"
      >
        <div className="w-full border-b border-gray-200 bg-white transition-colors duration-300 dark:border-gray-800 dark:bg-[#0f0f0f]">
          <div className="mx-auto max-w-[1600px] px-4 sm:px-8 lg:px-20 xl:px-28">
            <div className="flex h-20 items-center justify-between gap-2">
              {/* ── Logo ──────────────────────────────────────────────── */}
              <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
                <button
                  onClick={() => setMenuOpen(true)}
                  className="-ms-1 rounded-full p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
                  aria-label={t("القائمة", "Menu")}
                >
                  <Menu className="h-5 w-5 text-gray-700 dark:text-gray-300 sm:h-6 sm:w-6" />
                </button>

                <Link href={`/${locale}/marketplace`} className="flex items-center gap-2">
                  {/* Fixed on both axes at every step so the logo cannot shift
                      as it loads, and one step smaller between lg and xl where
                      the nav needs the room. */}
                  <div className="relative h-[28px] w-[97px] sm:h-[38px] sm:w-[130px] lg:h-[44px] lg:w-[150px] xl:h-[52px] xl:w-[180px]">
                    <Image
                      src="/alromaih/new logo.png"
                      alt="Alromaih"
                      fill
                      sizes="(max-width: 640px) 97px, (max-width: 1024px) 130px, (max-width: 1280px) 150px, 180px"
                      className="object-contain"
                      loading="eager"
                    />
                  </div>
                  {/* Present on phones and tablets, gone at lg where the five
                      nav labels need every pixel, back at xl. */}
                  <span className="hidden rounded-md bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary dark:bg-brand-primary/20 sm:inline lg:hidden xl:inline">
                    {t("السوق", "MARKET")}
                  </span>
                </Link>
              </div>

              {/* ── Desktop nav ───────────────────────────────────────── */}
              <nav className="ms-2 hidden min-w-0 flex-1 flex-nowrap items-center justify-center gap-0.5 lg:flex xl:ms-8 xl:gap-1">
                {NAV.map((item) => {
                  const active = isActive(item.href);
                  const subs = menuFor(item);

                  const triggerClass = `relative flex items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors xl:px-4 xl:text-sm ${
                    active
                      ? "text-brand-primary"
                      : "text-gray-700 hover:text-brand-primary dark:text-gray-300 dark:hover:text-white"
                  }`;
                  const underline = active ? (
                    <span className="absolute inset-x-2.5 -bottom-0.5 h-0.5 rounded-full bg-brand-primary xl:inset-x-4" />
                  ) : null;

                  if (!subs) {
                    return (
                      <Link key={item.key} href={`/${locale}${item.href}`} className={triggerClass}>
                        {t(item.ar, item.en)}
                        {underline}
                      </Link>
                    );
                  }

                  return (
                    <DropdownMenu key={item.key}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className={`${triggerClass} cursor-pointer border-none bg-transparent outline-hidden`}
                        >
                          {t(item.ar, item.en)}
                          <ChevronDown className="h-4 w-4" />
                          {underline}
                        </button>
                      </DropdownMenuTrigger>

                      {/* The main site's dropdown, to the pixel: a narrow white
                          card hanging off the START edge of its trigger, with
                          nothing in it but rows of text.

                          Nothing else. It briefly held a grid of brand logos,
                          which was a mega-menu beside a header that is
                          otherwise a copy of the dealership site's — and the
                          brands have their own pages now, so the menu links to
                          them instead of trying to be them. */}
                      <DropdownMenuContent
                        dir={isAr ? "rtl" : "ltr"}
                        align="start"
                        sideOffset={8}
                        className="w-48 rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:border-gray-700 dark:bg-[#1e1e1e]"
                      >
                        {subs.map((sub) => {
                          const subActive = isSubActive(sub.href);
                          return (
                            <DropdownMenuItem key={sub.key} asChild>
                              <Link
                                href={`/${locale}${sub.href}`}
                                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${
                                  subActive
                                    ? "bg-brand-primary/5 font-semibold text-brand-primary"
                                    : "text-gray-700 dark:text-gray-300"
                                }`}
                              >
                                {t(sub.ar, sub.en)}
                              </Link>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  );
                })}
              </nav>

              {/* ── Right actions ─────────────────────────────────────── */}
              <div className="flex shrink-0 items-center gap-0.5 sm:gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchMounted(true);
                    setSearchOpen(true);
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10 sm:h-10 sm:w-10"
                  aria-label={t("بحث", "Search")}
                >
                  <Search className="h-[18px] w-[18px] text-brand-primary sm:h-5 sm:w-5" />
                </button>

                {/* The count rides on the icon rather than beside it: the
                    header is already tight at 1024 and a number that widens the
                    row would push the language switcher off a tablet. `relative`
                    on the link, absolute on the badge, so the icon does not move
                    when the number gains a digit.

                    Signed-in only — a signed-out visitor's hearts are in
                    localStorage and this link goes to a page that would not
                    show them. See HeaderSlot. */}
                <Link
                  href={`/${locale}/marketplace/account/saved`}
                  className="relative hidden h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10 sm:flex"
                  aria-label={
                    viewer && savedLive > 0
                      ? t(`المفضلة (${savedLive})`, `Saved (${savedLive})`)
                      : t("المفضلة", "Saved")
                  }
                >
                  <Heart
                    className={`h-5 w-5 text-brand-primary ${viewer && savedLive > 0 ? "fill-brand-primary" : ""}`}
                  />

                  {viewer && savedLive > 0 ? (
                    /* 99+ rather than a fourth digit — a three-character badge
                       is as wide as the icon it sits on. */
                    <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-[10px] font-bold leading-none text-white tabular-nums">
                      {savedLive > 99 ? "99+" : savedLive}
                    </span>
                  ) : null}
                </Link>

                <LanguageSwitcher />

                {/* ── Profile ─────────────────────────────────────────── */}
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setProfileOpen((v) => !v)}
                    className="flex h-8 items-center gap-1.5 rounded-full border border-gray-200 px-0.5 transition-colors hover:border-brand-primary dark:border-gray-700 sm:h-10 sm:pe-2 sm:ps-1"
                    aria-expanded={profileOpen}
                    aria-haspopup="menu"
                  >
                    <ViewerAvatar size="h-7 w-7 sm:h-8 sm:w-8" {...avatarProps} />
                    <ChevronDown
                      className={`hidden h-4 w-4 text-gray-500 transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  {profileOpen ? (
                    <div
                      role="menu"
                      className={`absolute top-12 z-50 w-[min(88vw,15rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-[#1a1a1a] ${isAr ? "left-0" : "right-0"}`}
                    >
                      <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
                        {viewer ? (
                          <div className="flex items-center gap-3">
                            <ViewerAvatar size="h-9 w-9" {...avatarProps} />
                            <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{viewer.name}</p>
                            {/* Only when it is not already the line above — a
                                menu that prints the same email twice looks like
                                a bug. */}
                            {viewer.email && viewer.email !== viewer.name ? (
                              <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                {viewer.email}
                              </p>
                            ) : null}
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="text-sm font-semibold">{t("مرحباً بك", "Welcome")}</p>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                              {t("سجّل الدخول لإدارة إعلاناتك", "Sign in to manage your listings")}
                            </p>
                          </>
                        )}
                      </div>

                      {menu.length ? (
                        <div className="max-h-[60vh] overflow-y-auto p-1">
                          {/* "My account" sits above both groups: it is the way
                              in to everything below and belongs to neither. */}
                          <Link
                            href={`/${locale}/marketplace/account`}
                            role="menuitem"
                            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 hover:text-brand-primary dark:text-gray-200 dark:hover:bg-white/5"
                          >
                            <User className="h-4 w-4" />
                            {t("حسابي", "My account")}
                          </Link>

                          {menu.map((group) => (
                            <div key={group.key} className="mt-1 border-t border-gray-100 pt-1 dark:border-gray-700">
                              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                                {t(group.ar, group.en)}
                              </p>
                              {group.items.map(({ icon: Icon, ar, en, href, count }) => (
                                <Link
                                  key={href}
                                  href={`/${locale}${href}`}
                                  role="menuitem"
                                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-brand-primary dark:text-gray-200 dark:hover:bg-white/5"
                                >
                                  <Icon className="h-4 w-4" />
                                  <span className="flex-1 truncate">{t(ar, en)}</span>

                                  {/* Zero draws nothing. "Saved cars · 0" is a
                                      row telling you it has nothing to show
                                      while still asking to be read. */}
                                  {count > 0 ? (
                                    <span className="shrink-0 rounded-full bg-brand-primary/10 px-2 py-0.5 text-xs font-bold text-brand-primary tabular-nums">
                                      {count}
                                    </span>
                                  ) : null}
                                </Link>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="border-t border-gray-100 p-1 dark:border-gray-700">
                        {viewer ? (
                          /* A form, not a link: signing out is a state change,
                             and a GET that ends your session can be fired by any
                             page that manages to prefetch it. */
                          <form action={signOut}>
                            <input type="hidden" name="locale" value={locale} />
                            <button
                              type="submit"
                              role="menuitem"
                              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-200 dark:hover:bg-red-950/40"
                            >
                              <LogOut className="h-4 w-4" />
                              {t("تسجيل الخروج", "Sign out")}
                            </button>
                          </form>
                        ) : (
                          <>
                            <Link
                              href={authHref("login")}
                              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary/5"
                            >
                              <LogIn className="h-4 w-4" />
                              {t("تسجيل الدخول", "Sign in")}
                            </Link>
                            <Link
                              href={authHref("signup")}
                              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 hover:text-brand-primary dark:text-gray-200 dark:hover:bg-white/5"
                            >
                              <UserPlus className="h-4 w-4" />
                              {t("إنشاء حساب", "Create an account")}
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ── Search ────────────────────────────────────────────────────────
          Stays mounted once opened so reopening is instant and the last
          search is still in the box — closing it is `open=false`, not an
          unmount. */}
      {searchMounted ? (
        <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} locale={locale} />
      ) : null}

      {/* ── Mobile drawer ─────────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-99 bg-black/40 backdrop-blur-xs transition-opacity duration-300 lg:hidden ${
          menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMenuOpen(false)}
      />
      <div
        dir={isAr ? "rtl" : "ltr"}
        className={`fixed bottom-0 top-0 z-100 flex w-[86%] max-w-[330px] flex-col bg-white shadow-2xl transition-transform duration-300 dark:bg-[#0f0f0f] lg:hidden ${
          isAr ? "right-0 rounded-l-[20px]" : "left-0 rounded-r-[20px]"
        } ${menuOpen ? "translate-x-0" : isAr ? "translate-x-full" : "-translate-x-full"}`}
      >
        <div className="flex min-h-[80px] shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <Image src="/alromaih/new logo.png" width={150} height={43} alt="Alromaih" loading="eager" />
          <button
            onClick={() => setMenuOpen(false)}
            className="rounded-full p-2 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
            aria-label={t("إغلاق", "Close")}
          >
            <X className="h-5 w-5 text-gray-700 dark:text-white" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3">
          {NAV.map((item) => {
            const active = isActive(item.href);
            const subs = menuFor(item);
            const open = openSection === item.key;

            if (!subs) {
              return (
                <Link
                  key={item.key}
                  href={`/${locale}${item.href}`}
                  onClick={closeDrawer}
                  className={`block rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-primary/5 text-brand-primary"
                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
                  }`}
                >
                  {t(item.ar, item.en)}
                </Link>
              );
            }

            return (
              <div key={item.key}>
                {/* The row is a disclosure, not a link — tapping the label of a
                    section that has one opens it. The section's own first
                    entry ("All cars") is the link to the parent page, so
                    nothing is unreachable. */}
                <button
                  type="button"
                  onClick={() => setOpenSection(open ? null : item.key)}
                  aria-expanded={open}
                  className={`flex w-full items-center justify-between rounded-lg px-4 py-3 text-sm font-medium transition-colors ${
                    active
                      ? "bg-brand-primary/5 text-brand-primary"
                      : "text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/5"
                  }`}
                >
                  <span>{t(item.ar, item.en)}</span>
                  <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
                </button>

                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    open ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  {/* Indented text rows — the same list the desktop dropdown
                      shows, from the same array, so the two cannot drift. */}
                  <div className="space-y-0.5 px-2 pb-2 pt-1">
                    {subs.map((sub) => {
                      const subActive = isSubActive(sub.href);
                      return (
                        <Link
                          key={sub.key}
                          href={`/${locale}${sub.href}`}
                          onClick={closeDrawer}
                          className={`block rounded-lg px-5 py-2.5 text-sm ${
                            subActive
                              ? "bg-brand-primary/5 font-semibold text-brand-primary"
                              : "text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/5"
                          }`}
                        >
                          {t(sub.ar, sub.en)}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        {/* ── Sign in, for visitors who are not ─────────────────────────────

            The signed-IN half of this used to live here too: an avatar, "My
            account", and the Buying / Selling groups repeated in full. It is
            gone. Every one of those rows is in the profile menu at the top
            right of the bar, which is on screen at this width and one tap
            away — so the drawer was carrying a second copy of a menu that was
            already open beside it, and pushing the nav it exists for up off
            the top of a phone.

            The two buttons below stay, because for someone signed OUT the
            drawer has no avatar to lead them to that menu, and losing the only
            visible way in would not be a tidy-up. */}
        {viewer ? null : (
          <div className="shrink-0 space-y-2 border-t border-gray-100 p-4 dark:border-gray-700">
            <Link
              href={authHref("login")}
              onClick={closeDrawer}
              className="block rounded-lg bg-brand-primary px-4 py-3 text-center text-sm font-medium text-white"
            >
              {t("تسجيل الدخول", "Sign in")}
            </Link>
            <Link
              href={authHref("signup")}
              onClick={closeDrawer}
              className="block rounded-lg border border-gray-200 px-4 py-3 text-center text-sm font-medium text-brand-primary dark:border-gray-700"
            >
              {t("إنشاء حساب", "Create an account")}
            </Link>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The signed-in person's picture, or their initials.
 *
 * MODULE SCOPE — see the note where it is used. Keeping the element identity
 * stable across renders is what stops the browser re-fetching the photo every
 * time the header re-renders, and it is also what makes the onError latch
 * work: a remounted <img> would retry the broken URL forever.
 */
function ViewerAvatar({ size = "h-8 w-8", viewer, broken, onBroken }) {
  const initials = viewer ? initialsOf(viewer.name) : null;

  if (viewer?.avatarUrl && !broken) {
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={viewer.avatarUrl}
        alt=""
        referrerPolicy="no-referrer"
        onError={onBroken}
        className={`${size} shrink-0 rounded-full object-cover ring-1 ring-gray-200 dark:ring-gray-700`}
      />
    );
  }

  return (
    <span
      className={`${size} flex shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white`}
    >
      {initials ?? <User className="h-4 w-4" />}
    </span>
  );
}
