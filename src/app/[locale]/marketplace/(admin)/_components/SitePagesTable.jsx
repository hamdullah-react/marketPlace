"use client";

/**
 * Admin → Website content → About us (content pages). A table of the editable
 * pages with a 3-dot menu: edit, view, publish/unpublish, SEO.
 */

import { startTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal, Pencil, ExternalLink, Globe, GlobeLock, Search, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { setSitePagePublished } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

export default function SitePagesTable({ locale = "ar", rows = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const date = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh",
        })
      : "—";

  return (
    <div className="raised-card overflow-x-auto rounded-xl">
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow>
            <TableHead className="text-start">{t("الصفحة", "Page")}</TableHead>
            <TableHead className="text-start">{t("العنوان", "Title")}</TableHead>
            <TableHead className="text-start">{t("المحتوى", "Content")}</TableHead>
            <TableHead className="text-start">{t("الحالة", "Status")}</TableHead>
            <TableHead className="text-start">{t("آخر تعديل", "Updated")}</TableHead>
            <TableHead className="w-16 text-end">{t("إجراءات", "Actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.slug}>
              <TableCell>
                <Link
                  href={`/${locale}/marketplace/admin/content/pages/${row.slug}`}
                  className="font-medium text-brand-primary hover:underline"
                >
                  {t(row.label.ar, row.label.en)}
                </Link>
                <p dir="ltr" className="font-mono text-[11px] text-muted-foreground">/marketplace{row.path}</p>
              </TableCell>
              <TableCell className="text-xs">{row.title[locale] || row.title[isAr ? "en" : "ar"] || "—"}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  {["ar", "en"].map((lang) => (
                    <span
                      key={lang}
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                        row.written[lang]
                          ? "bg-brand-primary/10 text-brand-primary"
                          : "bg-gray-100 text-gray-400 line-through dark:bg-gray-800"
                      }`}
                    >
                      {lang}
                    </span>
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    row.published
                      ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400"
                  }`}
                >
                  {row.published ? t("منشورة", "Published") : t("مسودة", "Draft")}
                </span>
              </TableCell>
              <TableCell className="text-xs tabular-nums text-muted-foreground">{date(row.updatedAt)}</TableCell>
              <TableCell className="text-end">
                <PageRowActions locale={locale} row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function PageRowActions({ locale, row }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const publish = useActionResult(setSitePagePublished, INITIAL, { onSuccess: () => router.refresh() });

  const toggle = () => {
    publish.dismiss();
    const body = new FormData();
    body.set("slug", row.slug);
    body.set("published", String(!row.published));
    startTransition(() => publish.formAction(body));
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {publish.result?.error ? (
        <span className="me-2 text-xs text-red-600">{errorText(publish.result.error, locale)}</span>
      ) : null}
      {publish.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" /> : null}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" aria-label={t("إجراءات", "Actions")} disabled={publish.pending}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"} className="w-52">
          <DropdownMenuItem asChild className="gap-2">
            <Link href={`/${locale}/marketplace/admin/content/pages/${row.slug}`}>
              <Pencil className="h-4 w-4" />
              {t("تعديل المحتوى", "Edit content")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2">
            <a href={`/${locale}/marketplace${row.path}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" />
              {t("عرض الصفحة", "View page")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="gap-2">
            <Link href={`/${locale}/marketplace/admin/content/seo/${row.seoKey}`}>
              <Search className="h-4 w-4" />
              {t("إعدادات SEO", "SEO settings")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onSelect={toggle}>
            {row.published ? <GlobeLock className="h-4 w-4" /> : <Globe className="h-4 w-4" />}
            {row.published ? t("إلغاء النشر", "Unpublish") : t("نشر", "Publish")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
