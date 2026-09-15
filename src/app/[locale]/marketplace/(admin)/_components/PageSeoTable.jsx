"use client";

/**
 * Admin → Website content → Pages SEO. Every public page in one table, with
 * what search engines see for it, and a 3-dot menu: edit, view, reset.
 */

import { startTransition, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal, Pencil, ExternalLink, RotateCcw, Loader2, Search, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { resetPageSeo } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";
import { PAGE_GROUPS } from "@/marketplace/lib/sitePages";

const INITIAL = { ok: false, error: null };

export default function PageSeoTable({ locale = "ar", items = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [group, setGroup] = useState("all");
  const [query, setQuery] = useState("");
  const [resetting, setResetting] = useState(null);

  const q = query.trim().toLowerCase();
  const visible = items.filter(
    (i) =>
      (group === "all" || i.group === group) &&
      (!q || `${i.label.ar} ${i.label.en} ${i.path} ${i.title.ar} ${i.title.en}`.toLowerCase().includes(q))
  );

  const customised = items.filter((i) => i.customised).length;
  const indexed = items.filter((i) => i.index).length;

  const date = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh",
        })
      : "—";

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label={t("كل الصفحات", "All pages")} value={items.length} />
        <Stat label={t("مخصّصة", "Customised")} value={customised} />
        <Stat label={t("تظهر في البحث", "Shown in search")} value={indexed} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {["all", ...Object.keys(PAGE_GROUPS)].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGroup(g)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                group === g ? "raised-solid bg-brand-primary text-white" : "raised-hover text-gray-600 dark:text-gray-400"
              }`}
            >
              {g === "all" ? t("الكل", "All") : t(PAGE_GROUPS[g].ar, PAGE_GROUPS[g].en)}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث عن صفحة…", "Find a page…")}
            className="h-9 ps-8"
          />
        </div>
      </div>

      <div className="raised-card overflow-x-auto rounded-xl">
        <Table className="min-w-[860px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("الصفحة", "Page")}</TableHead>
              <TableHead className="text-start">{t("القسم", "Section")}</TableHead>
              <TableHead className="text-start">{t("عنوان البحث", "Search title")}</TableHead>
              <TableHead className="text-start">{t("الفهرسة", "Indexing")}</TableHead>
              <TableHead className="text-start">{t("الحالة", "Status")}</TableHead>
              <TableHead className="text-start">{t("آخر تعديل", "Updated")}</TableHead>
              <TableHead className="w-16 text-end">{t("إجراءات", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  {t("لا توجد صفحات مطابقة", "No matching pages")}
                </TableCell>
              </TableRow>
            ) : (
              visible.map((item) => (
                <TableRow key={item.key}>
                  <TableCell>
                    <Link
                      href={`/${locale}/marketplace/admin/content/seo/${item.key}`}
                      className="font-medium text-brand-primary hover:underline"
                    >
                      {t(item.label.ar, item.label.en)}
                    </Link>
                    <p dir="ltr" className="font-mono text-[11px] text-muted-foreground">
                      /marketplace{item.path || "/"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs">{t(PAGE_GROUPS[item.group].ar, PAGE_GROUPS[item.group].en)}</TableCell>
                  <TableCell className="max-w-xs whitespace-normal text-xs">{item.title[locale]}</TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        item.index
                          ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {item.index ? t("تظهر", "Indexed") : t("مخفية (noindex)", "Hidden (noindex)")}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        item.customised
                          ? "bg-brand-primary/10 text-brand-primary"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      }`}
                    >
                      {item.customised ? t("مخصّصة", "Custom") : t("افتراضية", "Default")}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs tabular-nums text-muted-foreground">{date(item.updatedAt)}</TableCell>
                  <TableCell className="text-end">
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" aria-label={t("إجراءات", "Actions")}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"} className="w-52">
                        <DropdownMenuItem asChild className="gap-2">
                          <Link href={`/${locale}/marketplace/admin/content/seo/${item.key}`}>
                            <Pencil className="h-4 w-4" />
                            {t("تعديل SEO", "Edit SEO")}
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild className="gap-2">
                          <a href={`/${locale}/marketplace${item.path}`} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            {t("عرض الصفحة", "View page")}
                          </a>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-red-600 focus:text-red-600"
                          disabled={!item.customised}
                          onSelect={() => setResetting(item)}
                        >
                          <RotateCcw className="h-4 w-4" />
                          {t("إرجاع للافتراضي", "Reset to default")}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {resetting ? (
        <ResetDialog key={resetting.key} locale={locale} item={resetting} onClose={() => setResetting(null)} />
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="raised-card rounded-xl px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-brand-primary">{value}</p>
    </div>
  );
}

function ResetDialog({ locale, item, onClose }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const reset = useActionResult(resetPageSeo, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  const confirm = () => {
    const body = new FormData();
    body.set("pageKey", item.key);
    startTransition(() => reset.formAction(body));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {t("إرجاع للإعدادات الافتراضية", "Reset to default")}
          </DialogTitle>
          <DialogDescription className="text-start">
            {t(
              `ستُحذف كل إعدادات SEO المخصّصة لصفحة «${item.label.ar}» وتعود للنصوص الافتراضية.`,
              `Every custom SEO setting for "${item.label.en}" is removed and the page goes back to its default text.`
            )}
          </DialogDescription>
        </DialogHeader>
        {reset.result?.error ? <p className="text-sm text-red-600">{errorText(reset.result.error, locale)}</p> : null}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("إلغاء", "Cancel")}
          </Button>
          <Button type="button" variant="destructive" disabled={reset.pending} onClick={confirm} className="gap-2">
            {reset.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            {t("إرجاع", "Reset")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
