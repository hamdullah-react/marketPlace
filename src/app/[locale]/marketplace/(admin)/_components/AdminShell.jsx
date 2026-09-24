"use client";

/**
 * Admin panel shell — the same shadcn sidebar and header as the seller
 * dashboard, so the two panels feel like one product.
 *
 * Separate from SellerShell because that one is built around a showroom (its
 * header is the vendor, its badge is live leads); this one is the platform.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLiveBoosts } from "./useLiveBoosts";
import {
  LayoutDashboardIcon, UsersIcon, ShieldCheckIcon, SparklesIcon, HomeIcon,
  StoreIcon, BadgeDollarSignIcon, ChevronsUpDownIcon, LogOutIcon, UserIcon,
  LayoutTemplateIcon, ImagesIcon, FileTextIcon, SearchCheckIcon, SettingsIcon, ChevronDownIcon,
  StarIcon, WalletIcon,
} from "lucide-react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem,
  SidebarProvider, SidebarTrigger,
} from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import LanguageSwitcher from "../../_components/LanguageSwitcher";
import { signOut } from "../../(auth)/_actions/auth";

const BOOSTS_HREF = "/marketplace/admin/content/featured";

const NAV_MAIN = [
  { href: "/marketplace/admin", icon: LayoutDashboardIcon, ar: "لوحة الإدارة", en: "Dashboard", exact: true },
  { href: "/marketplace/admin/customers", icon: UsersIcon, ar: "المستخدمون", en: "Users" },
  { href: "/marketplace/admin/settings/staff", icon: ShieldCheckIcon, ar: "المسؤولون", en: "Admins" },
  { href: BOOSTS_HREF, icon: SparklesIcon, ar: "طلبات التمييز", en: "Boost requests" },
  { href: "/marketplace/admin/content/boost-plans", icon: BadgeDollarSignIcon, ar: "خطط التمييز والأسعار", en: "Boost plans & prices" },
  { href: "/marketplace/admin/reviews", icon: StarIcon, ar: "التقييمات", en: "Reviews" },
  { href: "/marketplace/admin/finance", icon: WalletIcon, ar: "المالية", en: "Finance" },
];

/* The "Website content" dropdown in the sidebar. */
const NAV_CONTENT = {
  icon: LayoutTemplateIcon,
  ar: "محتوى الموقع",
  en: "Website content",
  children: [
    { href: "/marketplace/admin/content/banners", icon: ImagesIcon, ar: "شرائح الصفحة الرئيسية", en: "Home carousel" },
    { href: "/marketplace/admin/content/pages", icon: FileTextIcon, ar: "صفحة من نحن", en: "About us" },
    { href: "/marketplace/admin/content/seo", icon: SearchCheckIcon, ar: "تحسين محركات البحث", en: "Pages SEO" },
  ],
};

// exact: /admin/settings/staff is the Admins page, not part of Settings.
const NAV_SETTINGS = { href: "/marketplace/admin/settings", icon: SettingsIcon, ar: "الإعدادات", en: "Settings", exact: true };

export default function AdminShell({ locale = "ar", viewer, pendingBoosts = 0, brand = null, children }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const pathname = usePathname() || "";
  const router = useRouter();

  /* Live pending-request count, with a chime when one arrives. Any change
     re-reads the current admin page, so the Waiting table and the dashboard
     card update in place. */
  const { count: livePending, live } = useLiveBoosts(viewer?.userId ?? null, {
    initial: pendingBoosts,
    onBoost: () => router.refresh(),
    // Admin role removed (or account deleted) by another admin: leave the
    // panel now. replace(), so Back does not return to a page they cannot open,
    // and refresh() so the header drops the Admin badge and link.
    onRevoked: () => {
      router.replace(`/${locale}/marketplace`);
      router.refresh();
    },
  });

  const isActive = (href, exact) => {
    const full = `/${locale}${href}`;
    return exact ? pathname === full : pathname.startsWith(full);
  };

  const secondary = [
    { href: "/marketplace", icon: HomeIcon, ar: "العودة إلى السوق", en: "Back to marketplace", exact: true },
    ...(viewer?.isVendor
      ? [{ href: "/marketplace/seller", icon: StoreIcon, ar: "لوحة البائع", en: "Seller dashboard", exact: true }]
      : []),
  ];

  const current = [...NAV_MAIN, ...NAV_CONTENT.children, NAV_SETTINGS]
    .filter((i) => isActive(i.href, i.exact))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const navCtx = { isActive, t, locale };

  return (
    <SidebarProvider dir={isAr ? "rtl" : "ltr"} className="marketplace-root">
      <Sidebar collapsible="offcanvas" variant="inset" side={isAr ? "right" : "left"}>
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild size="lg" className="data-[slot=sidebar-menu-button]:!p-1.5">
                <Link href={`/${locale}/marketplace/admin`}>
                  {/* The logo from Admin → Settings → Branding. A plain <img>,
                      not next/image: a sidebar chip gains nothing from the
                      optimiser, and a logo must not depend on it to appear. */}
                  {brand?.logoUrl ? (
                    <div className="raised flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={brand.logoUrl}
                        alt={brand?.name || ""}
                        className={`h-full w-full object-contain ${brand.logoDarkUrl ? "dark:hidden" : ""}`}
                      />
                      {brand.logoDarkUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={brand.logoDarkUrl} alt="" className="hidden h-full w-full object-contain dark:block" />
                      ) : null}
                    </div>
                  ) : (
                    <div className="raised-solid flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary text-white">
                      <ShieldCheckIcon className="size-4" />
                    </div>
                  )}
                  <div className="grid flex-1 text-start leading-tight">
                    <span className="truncate text-base font-semibold">{brand?.name || t("سوق الرميح", "Alromaih Marketplace")}</span>
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      {t("لوحة الإدارة", "Admin panel")}
                    </span>
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>

        <SidebarContent>
          <NavGroup
            label={t("الإدارة", "Administration")}
            items={NAV_MAIN}
            badges={{ [BOOSTS_HREF]: livePending }}
            {...navCtx}
          />
          <WebsiteGroup group={NAV_CONTENT} settings={NAV_SETTINGS} {...navCtx} />
          <NavGroup items={secondary} className="mt-auto" {...navCtx} />
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <AccountMenu viewer={viewer} locale={locale} t={t} isAr={isAr} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b">
          <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
            <SidebarTrigger className="-ms-1" />
            <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
            <h1 className="text-base font-medium">
              {current ? t(current.ar, current.en) : t("لوحة الإدارة", "Admin")}
            </h1>
            <span className="rounded-full bg-brand-gold px-1.5 py-0.5 text-[9px] font-bold uppercase leading-none text-[#2a2100]">
              {t("مسؤول", "Admin")}
            </span>
            <span
              title={
                live
                  ? t("الطلبات الجديدة تصل فوراً", "New requests arrive instantly")
                  : t("الاتصال المباشر غير متاح — يتم التحقق كل ٨ ثوانٍ", "Live connection unavailable — checking every 8 seconds")
              }
              aria-label={live ? "live" : "offline"}
              className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-amber-500"}`}
            />
            <div className="ms-auto">
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <div className="flex flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

/* ── Module scope — see SellerShell for why nav pieces are never nested. ── */

function NavGroup({ label, items, className, badges, isActive, t, locale }) {
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
                  <CountBadge n={badges?.[href]} />
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
 * "Website content" as a dropdown (collapsible) with its pages under it, then
 * Settings. Opens on its own when one of its pages is the current one.
 */
function WebsiteGroup({ group, settings, isActive, t, locale }) {
  const GroupIcon = group.icon;
  const SettingsItemIcon = settings.icon;
  const inside = group.children.some((c) => isActive(c.href));

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("الموقع", "Website")}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <Collapsible asChild defaultOpen={inside} className="group/collapsible">
            <SidebarMenuItem>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip={t(group.ar, group.en)} isActive={inside}>
                  <GroupIcon />
                  <span>{t(group.ar, group.en)}</span>
                  <ChevronDownIcon className="ms-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-180" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub>
                  {group.children.map(({ href, icon: ChildIcon, ar, en }) => (
                    <SidebarMenuSubItem key={href}>
                      <SidebarMenuSubButton asChild isActive={isActive(href)}>
                        <Link href={`/${locale}${href}`}>
                          <ChildIcon />
                          <span>{t(ar, en)}</span>
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>

          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive(settings.href, settings.exact)} tooltip={t(settings.ar, settings.en)}>
              <Link href={`/${locale}${settings.href}`}>
                <SettingsItemIcon />
                <span>{t(settings.ar, settings.en)}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function CountBadge({ n }) {
  if (!n) return null;
  return (
    <span className="raised-solid ms-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 text-[11px] font-semibold tabular-nums text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

function Avatar({ url }) {
  if (!url) {
    return (
      <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <UserIcon className="size-4" />
      </div>
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={url} alt="" referrerPolicy="no-referrer" className="aspect-square size-8 shrink-0 rounded-lg object-cover" />
  );
}

function AccountMenu({ viewer, locale, t, isAr }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <Avatar url={viewer?.avatarUrl} />
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">{viewer?.name || t("الحساب", "Account")}</span>
            <span className="truncate text-xs text-muted-foreground">{viewer?.email || ""}</span>
          </div>
          <ChevronsUpDownIcon className="ms-auto size-4 text-muted-foreground" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent side={isAr ? "left" : "right"} align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2 font-normal">
          <Avatar url={viewer?.avatarUrl} />
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">{viewer?.name || t("الحساب", "Account")}</span>
            <span className="truncate text-xs text-muted-foreground">{viewer?.email || ""}</span>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href={`/${locale}/marketplace/account`}>
            <UserIcon className="size-4" />
            {t("حسابي", "My account")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

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
