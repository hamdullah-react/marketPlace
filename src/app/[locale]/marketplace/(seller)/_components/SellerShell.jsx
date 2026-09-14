"use client";

/**
 * Seller dashboard shell — dashboard-01's structure, with real routes.
 *
 * Mirrors the block exactly:
 *   SidebarProvider → Sidebar variant="inset" → SidebarInset → header → content
 *
 * Two things that must not be "improved":
 *
 *  1. `dir` goes on SidebarProvider itself. It renders `flex min-h-svh w-full`
 *     and both the fixed sidebar and SidebarInset position against that element —
 *     wrapping it in another div collapses the chain and content slides under
 *     the sidebar.
 *
 *  2. Padding lives on the sections (`px-4 lg:px-6`), not on this container.
 *     The block's cards and table bleed to their own edges; adding p-6 here
 *     double-pads everything and the table stops reaching the card edge.
 */

import { Suspense, use, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboardIcon, CarIcon, PlusIcon, ImagesIcon,
  StarIcon, WalletIcon, SettingsIcon, BarChartIcon, StoreIcon,
  ExternalLinkIcon, HelpCircleIcon, SearchIcon, UserIcon, LibraryIcon,
  ChevronsUpDownIcon, LogOutIcon, BadgeCheckIcon, ClipboardListIcon,
  ChevronDownIcon, UsersIcon, TagIcon,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "../../(auth)/_actions/auth";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import LanguageSwitcher from "../../_components/LanguageSwitcher";
import { useLiveLeads } from "./useLiveLeads";

const NAV_MAIN = [
  { href: "/marketplace/seller", icon: LayoutDashboardIcon, ar: "لوحة التحكم", en: "Dashboard", exact: true },
  { href: "/marketplace/seller/listings", icon: CarIcon, ar: "إعلاناتي", en: "Listings" },
  { href: "/marketplace/seller/listings/new", icon: PlusIcon, ar: "إضافة سيارة", en: "Add a car" },
  { href: "/marketplace/seller/offers", icon: TagIcon, ar: "العروض", en: "Offers" },
  { href: "/marketplace/seller/media", icon: ImagesIcon, ar: "مكتبة الصور", en: "Media" },
  { href: "/marketplace/seller/catalog", icon: LibraryIcon, ar: "الكتالوج", en: "Catalog" },
  { href: "/marketplace/seller/analytics", icon: BarChartIcon, ar: "التحليلات", en: "Analytics" },
];

/**
 * The CRM, folded into one entry.
 *
 * Three items that only make sense together — the leads, the form that shapes
 * them, and the reviews that follow a deal — and a flat sidebar listed them
 * beside Payouts as though they were unrelated. Collapsing them says what they
 * are, and gives back the vertical space a seller needs for the sections they
 * open twenty times a day.
 *
 * Open by default when the current page is inside it, because a nav that hides
 * where you already are is a nav you have to re-open every time.
 */
const NAV_CRM = [
  // ONE inbox. There used to be a Messages entry beside this one, for the chat
  // threads, and a seller with two inboxes checks one of them — so a lead could
  // sit unworked because its owner was watching the other page. Everything a
  // buyer sends is a lead now, and this is where it lands.
  { href: "/marketplace/seller/leads", icon: UsersIcon, ar: "العملاء المحتملون", en: "Leads" },
  // Directly under Leads, because it is the thing that decides what arrives
  // there — a seller wondering why a lead has no budget on it should find the
  // answer one line below the lead.
  { href: "/marketplace/seller/lead-form", icon: ClipboardListIcon, ar: "نموذج الطلب", en: "Lead form" },
  { href: "/marketplace/seller/reviews", icon: StarIcon, ar: "التقييمات", en: "Reviews" },
];

const NAV_CUSTOMERS = [
  { href: "/marketplace/seller/payouts", icon: WalletIcon, ar: "المستحقات", en: "Payouts" },
];

const NAV_SECONDARY = [
  { href: "/marketplace/seller/settings", icon: SettingsIcon, ar: "الإعدادات", en: "Settings" },
  { href: "/marketplace/help", icon: HelpCircleIcon, ar: "المساعدة", en: "Get Help" },
  // The public grid, not /marketplace/search — that route is gone, because
  // search is a modal in the header now.
  { href: "/marketplace/cars", icon: SearchIcon, ar: "تصفّح السوق", en: "Browse marketplace" },
];

/**
 * The sidebar footer is the only part of the shell that needs the database.
 *
 * It takes the vendor as an unresolved promise and unwraps it with use(), so
 * the layout never awaits: the sidebar, the nav and the page content all paint
 * while the vendor lookup is still in flight, and only this one row shows a
 * skeleton. Awaiting in the layout instead would hold back the entire
 * dashboard — layouts sit above loading.js, so nothing can cover for them.
 */
/**
 * The account menu at the foot of the sidebar.
 *
 * It used to be a bare link to the public storefront, which meant the only way
 * out of the dashboard was to know that /marketplace/account existed — and
 * there was no way to sign out at all without going back to the public header.
 *
 * A menu instead: identity on the button, everything a person might want to do
 * with their account behind it. The trigger keeps the same two-line size="lg"
 * footprint the skeleton reserves, so the sidebar does not resize when it
 * resolves.
 */
function VendorIdentity({ vendorPromise, locale, t, isAr }) {
  const vendor = use(vendorPromise);


  const items = [
    { href: "/marketplace/account", icon: UserIcon, ar: "حسابي", en: "My account" },
    { href: "/marketplace/seller/settings", icon: SettingsIcon, ar: "إعدادات المعرض", en: "Showroom settings" },
    ...(vendor.slug
      ? [{
          href: `/marketplace/vendors/${vendor.slug}`,
          icon: ExternalLinkIcon,
          ar: "عرض صفحة المعرض",
          en: "View storefront",
        }]
      : []),
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <VendorAvatar url={vendor.avatarUrl} />
          <div className="grid flex-1 text-start text-sm leading-tight">
            {/* The PERSON here, not the showroom — the showroom is at the top
                of the sidebar now, and printing it twice wasted the line that
                should say who is signed in. */}
            <span className="truncate font-medium">
              {vendor.user || t("الحساب", "Account")}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {vendor.email || ""}
            </span>
          </div>
          <ChevronsUpDownIcon className="ms-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side={isAr ? "left" : "right"}
        align="end"
        className="w-60"
      >
        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <VendorAvatar url={vendor.avatarUrl} />
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">{vendor.user || t("الحساب", "Account")}</span>
            <span className="truncate text-xs text-muted-foreground">{vendor.email || ""}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        {items.map(({ href, icon: Icon, ar, en }) => (
          <DropdownMenuItem key={href} asChild>
            <Link href={`/${locale}${href}`}>
              <Icon className="size-4" />
              {t(ar, en)}
            </Link>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* A form, not a link. A GET that ends your session can be fired by
            anything that prefetches it. */}
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full cursor-pointer text-red-600 focus:text-red-600">
              <LogOutIcon className="size-4" />
              {t("تسجيل الخروج", "Sign out")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The showroom, at the top of the sidebar.
 *
 * This was a hardcoded "Marketplace" with a generic store icon, so every
 * seller's dashboard looked identical and nothing on screen said WHOSE
 * inventory was being edited. That matters most for the people most likely to
 * get it wrong: staff, and anyone who belongs to two showrooms.
 */
function ShopHeader({ vendorPromise, locale, t }) {
  const vendor = use(vendorPromise);

  return (
    <SidebarMenuButton asChild size="lg" className="data-[slot=sidebar-menu-button]:!p-1.5">
      <Link href={`/${locale}/marketplace/seller`}>
        {vendor.logoUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={vendor.logoUrl}
            alt=""
            className="aspect-square size-8 shrink-0 rounded-lg border bg-white object-contain p-0.5"
          />
        ) : (
          <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
            <StoreIcon className="size-4" />
          </div>
        )}
        <div className="grid flex-1 text-start leading-tight">
          <span className="flex items-center gap-1 truncate text-base font-semibold">
            <span className="truncate">{vendor.name || t("سوق الرميح", "Marketplace")}</span>
            {vendor.verified ? (
              <BadgeCheckIcon className="size-3.5 shrink-0 text-blue-500" />
            ) : null}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">
            {t("لوحة البائع", "Seller dashboard")}
          </span>
        </div>
      </Link>
    </SidebarMenuButton>
  );
}

/** Matches ShopHeader's footprint, so the header does not jump. */
function ShopHeaderSkeleton() {
  return (
    <SidebarMenuButton size="lg" className="pointer-events-none !p-1.5">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="grid flex-1 gap-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </SidebarMenuButton>
  );
}

/** Same size="lg" two-line footprint, so the sidebar never resizes. */
function VendorIdentitySkeleton() {
  return (
    <SidebarMenuButton size="lg" className="pointer-events-none">
      <Skeleton className="size-8 shrink-0 rounded-lg" />
      <div className="grid flex-1 gap-1.5">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-2.5 w-20" />
      </div>
    </SidebarMenuButton>
  );
}

export default function SellerShell({ locale = "ar", vendorPromise, children }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const pathname = usePathname() || "";
  const router = useRouter();

  /**
   * The showroom id, without suspending the sidebar on it.
   *
   * `use(vendorPromise)` here would block the whole shell — header, nav and
   * content — on a query the nav does not otherwise need, which is the exact
   * thing the layout comment warns about. So the promise is read in an effect
   * and the subscription starts a moment later than the paint, which for a
   * background listener is free.
   */
  const [vendorId, setVendorId] = useState(null);
  const [unreadSeed, setUnreadSeed] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve(vendorPromise)
      .then((v) => {
        if (cancelled) return;
        setVendorId(v?.id ?? null);
        setUnreadSeed(v?.unreadLeads ?? 0);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [vendorPromise]);

  // `exact` on the dashboard root, or every child route lights it up too.
  const isActive = (href, exact) => {
    const full = `/${locale}${href}`;
    return exact ? pathname === full : pathname.startsWith(full);
  };

  // Header title: deepest matching nav item, so it tracks the route instead of
  // being hardcoded the way the block's "Documents" is.
  const current = [...NAV_MAIN, ...NAV_CRM, ...NAV_CUSTOMERS, ...NAV_SECONDARY]
    .filter((i) => isActive(i.href, i.exact))
    .sort((a, b) => b.href.length - a.href.length)[0];

  /* Both nav components live at module scope and are called directly, with
     what they used to close over passed as props. No local wrapper: a wrapper
     is itself a new component type each render, so React would unmount the
     subtree under it and the hoist would buy nothing — which for
     NavCollapsibleView means its uncontrolled Collapsible snapping back open. */
  const navCtx = { isActive, t, locale };

  // Whether any CRM page is the current one — which is also whether the group
  // starts open.
  const inCrm = NAV_CRM.some((item) => isActive(item.href));

  /**
   * How many leads nobody here has opened — and a chime when one lands.
   *
   * router.refresh() as well as the badge: if the seller happens to BE on the
   * leads page, the row should appear in the table rather than only as a number
   * in the sidebar pointing at the page they are already looking at.
   *
   * ── Landing on the page no longer clears it ───────────────────────────────
   *
   * It used to. That made the badge a lie in the one direction that matters: a
   * seller who clicked Leads, glanced at the top row and went back to work had
   * an empty badge and forty leads nobody had read. "Read" now means somebody
   * opened the lead — or pressed Mark all read on the list, which is a decision
   * rather than a side effect of navigating.
   */
  const onLeadsPage = isActive("/marketplace/seller/leads");

  const { count: unread, live, reason } = useLiveLeads(vendorId, {
    initial: unreadSeed,

    /**
     * Something happened to a lead. What the seller sees depends on where they
     * are standing.
     *
     * The awkward case is a lead being DELETED while its own page is open —
     * which a buyer withdrawing now does. Calling router.refresh() there
     * re-renders the route, getLead() returns null for a row that no longer
     * exists, notFound() fires, and the seller is looking at a 404 they did
     * nothing to deserve. So a delete that names the lead they are reading
     * moves them to the list instead.
     *
     * replace(), not push(): the page they were on is gone, and leaving it in
     * the history means Back returns them to the same 404.
     */
    onLead: (payload) => {
      if (!onLeadsPage) return;

      if (payload?.deleted && payload.id && pathname.endsWith(`/${payload.id}`)) {
        router.replace(`/${locale}/marketplace/seller/leads`);
        return;
      }

      router.refresh();
    },
  });

  const collapsibleCtx = { isActive, t, locale, live, reason, isAr };

  return (
    <SidebarProvider dir={isAr ? "rtl" : "ltr"} className="marketplace-root">
      <Sidebar collapsible="offcanvas" variant="inset" side={isAr ? "right" : "left"}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <Suspense fallback={<ShopHeaderSkeleton />}>
                <ShopHeader vendorPromise={vendorPromise} locale={locale} t={t} />
              </Suspense>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <NavGroupView items={NAV_MAIN} {...navCtx} />
          <NavCollapsibleView
            label={t("إدارة العملاء", "CRM")}
            icon={UsersIcon}
            items={NAV_CRM}
            defaultOpen={inCrm || unread > 0}
            badges={{ "/marketplace/seller/leads": unread }}
            total={unread}
            dot="/marketplace/seller/leads"
            {...collapsibleCtx}
          />
          <NavGroupView label={t("العملاء", "Customers")} items={NAV_CUSTOMERS} {...navCtx} />
          <NavGroupView items={NAV_SECONDARY} className="mt-auto" {...navCtx} />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              {/* The boundary sits outside SidebarMenuButton, not inside it:
                  `asChild` hands its props to the child via Radix Slot, which
                  needs a real element to clone — a <Suspense> there would
                  swallow the styling. Both branches render their own button. */}
              <Suspense fallback={<VendorIdentitySkeleton />}>
                <VendorIdentity vendorPromise={vendorPromise} locale={locale} t={t} isAr={isAr} />
              </Suspense>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
          <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
            <SidebarTrigger className="-ms-1" />
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <h1 className="text-base font-medium">
              {current ? t(current.ar, current.en) : t("لوحة البائع", "Seller")}
            </h1>

            {/* The dashboard has no public header, so the language toggle
                lives here — otherwise there is no way out of a locale once
                you are inside the seller area. */}
            <div className="ms-auto">
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        {/* Block layout: no padding here — each section supplies px-4 lg:px-6. */}
        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/**
 * The unread count beside a nav item.
 *
 * Renders nothing at zero. A permanent "0" is a badge that has stopped meaning
 * anything, and the eye learns to skip it — which is the one thing a badge must
 * not train people to do.
 */
/**
 * Whether new leads will actually arrive on their own.
 *
 * ── Why a seller needs to see this ──────────────────────────────────────────
 *
 * A live feed that has died looks exactly like a quiet afternoon. Both are an
 * empty list and a still badge, and the difference — one means nobody enquired,
 * the other means somebody did and you were not told — is the difference
 * between a slow day and a lost sale.
 *
 * Deliberately small and unlabelled while it is working: a green dot is
 * something you stop noticing, which is correct for the normal case. It turns
 * amber when the socket is not joined, and the title says what to do about it.
 */
function LiveDot({ live, reason, isAr }) {
  return (
    <span
      title={
        live
          ? isAr
            ? "الطلبات الجديدة تصل فوراً"
            : "New requests arrive here instantly"
          : (isAr
              ? "الاتصال المباشر غير متاح — يتم التحقق كل ٨ ثوانٍ بدلاً من ذلك"
              : "Live connection unavailable — checking every 8 seconds instead") +
            (reason ? `
(${reason})` : "")
      }
      className={`h-2 w-2 shrink-0 rounded-full ${
        // Amber, not red, and it does not pulse: leads still arrive on the
        // 8-second poll, so this is "slower than it could be", not "broken".
        live ? "bg-green-500" : "bg-amber-500"
      }`}
      aria-label={live ? "live" : "offline"}
    />
  );
}

function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="raised-solid ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-semibold tabular-nums text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/** The showroom's logo, or a placeholder. Module scope — see its use above. */
function VendorAvatar({ url }) {
  if (!url) {
    return (
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <UserIcon className="size-4" />
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className="aspect-square size-8 shrink-0 rounded-lg object-cover"
    />
  );
}

/**
 * A flat group of sidebar links.
 *
 * MODULE SCOPE. See NavCollapsibleView below for why.
 */
function NavGroupView({ label, items, className, badges, isActive, t, locale }) {
  return (
    <SidebarGroup className={className}>
      {label ? <SidebarGroupLabel>{label}</SidebarGroupLabel> : null}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map(({ href, icon: Icon, ar, en, exact }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild isActive={isActive(href, exact)} tooltip={t(ar, en)}>
                <Link href={`/${locale}${href}`}>
                  <Icon />
                  <span>{t(ar, en)}</span>
                  <Badge n={badges?.[href]} />
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/**
 * A collapsible group of sidebar links.
 *
 * MODULE SCOPE, and this one is not a nicety. The Collapsible inside is
 * UNCONTROLLED — it takes `defaultOpen` and then owns its own state. Declared
 * inside SellerShell it was a new component TYPE on every render, so React
 * unmounted it and mounted a fresh one, and the fresh one started at
 * `defaultOpen` again.
 *
 * This shell re-renders on every realtime lead: the badge count changes and
 * router.refresh() runs. So a seller who collapsed the CRM group watched it
 * spring back open each time a lead arrived — the moment they were least
 * likely to blame the sidebar for it.
 */
function NavCollapsibleView({
  label, icon: Icon, items, defaultOpen, badges, total, dot,
  isActive, t, locale, live, reason, isAr,
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={label}>
                  <Icon />
                  <span>{label}</span>
                  {/* Also on the TRIGGER, because the group can be collapsed —
                      a count nobody can see is a count that does not exist. */}
                  <Badge n={total} />
                  <ChevronDownIcon className="ms-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                </SidebarMenuButton>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <SidebarMenuSub>
                  {items.map(({ href, icon: ItemIcon, ar, en }) => (
                    <SidebarMenuSubItem key={href}>
                      <SidebarMenuSubButton asChild isActive={isActive(href)}>
                        <Link href={`/${locale}${href}`}>
                          <ItemIcon className="h-4 w-4" />
                          <span>{t(ar, en)}</span>
                          {/* One right-aligned group: two separate ms-auto
                              children would split the free space between them
                              and strand the dot in the middle of the row. */}
                          <span className="ms-auto flex items-center gap-1.5">
                            {dot === href && <LiveDot live={live} reason={reason} isAr={isAr} />}
                            <Badge n={badges?.[href]} />
                          </span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
