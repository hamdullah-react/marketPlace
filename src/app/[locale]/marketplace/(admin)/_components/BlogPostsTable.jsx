"use client";

/**
 * Admin → Website content → Blog. Every article in one table, with a 3-dot
 * menu: edit, view, publish or unpublish, delete.
 *
 * ── Filtering and searching happen before paging, not after ─────────────────
 *
 * The rows all arrive at once and the search runs over ALL of them, then the
 * page is sliced off the result. The other order — page on the server, search
 * within the page — is the failure §21.5 of schema.sql describes at length: a
 * search box that quietly searches only what is on screen answers "not found"
 * for an article that exists, which is worse than having no search box.
 *
 * A blog is the right size for this. It is hundreds of rows at the very most,
 * each a title and a slug, and the body is deliberately left out of the query.
 * If it ever becomes thousands, the paging moves to the database and the search
 * has to move with it — both, together, or not at all.
 */

import { startTransition, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ChevronLeft, ChevronRight, Eye, EyeOff, ExternalLink, FileText,
  Loader2, MoreHorizontal, Pencil, Search, Trash2,
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
import { setBlogPostPublished, deleteBlogPost } from "../admin/_actions/blog";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

/* Ten rows is about a screen without scrolling the table itself, which is what
   makes the pager worth having rather than an extra click on the way to work. */
const PER_PAGE = 10;

const FILTERS = {
  all: { ar: "الكل", en: "All" },
  published: { ar: "منشورة", en: "Published" },
  draft: { ar: "مسودات", en: "Drafts" },
};

export default function BlogPostsTable({ locale = "ar", items = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(null);

  const text = (value) => value?.[locale] || value?.[isAr ? "en" : "ar"] || "";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    return items.filter((post) => {
      if (filter === "published" && !post.published) return false;
      if (filter === "draft" && post.published) return false;
      if (!q) return true;

      /* Both languages of the title and the excerpt, the slug and the tags — an
         admin types whichever language they think in, and half the reason to
         search is to find the article they only wrote in the other one. */
      const hay = [
        post.title?.ar, post.title?.en,
        post.excerpt?.ar, post.excerpt?.en,
        post.slug, post.author,
        ...(post.tags ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return hay.includes(q);
    });
  }, [items, filter, query]);

  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));

  /* Narrowing the list can leave the pager pointing past the end — search for
     something on page four and the table would render empty rather than the one
     match. Clamping in an effect rather than during render keeps this a pure
     render and self-corrects whichever input changed. */
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const current = Math.min(page, pages);
  const start = (current - 1) * PER_PAGE;
  const rows = visible.slice(start, start + PER_PAGE);

  const published = items.filter((p) => p.published).length;
  const views = items.reduce((n, p) => n + (p.views ?? 0), 0);
  const nf = new Intl.NumberFormat(isAr ? "ar-SA" : "en");

  const date = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA-u-ca-gregory" : "en-GB", {
          day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Riyadh",
        })
      : "—";

  const Prev = isAr ? ChevronRight : ChevronLeft;
  const Next = isAr ? ChevronLeft : ChevronRight;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("كل المقالات", "All articles")} value={nf.format(items.length)} />
        <Stat label={t("منشورة", "Published")} value={nf.format(published)} />
        <Stat label={t("مسودات", "Drafts")} value={nf.format(items.length - published)} />
        <Stat label={t("مرات القراءة", "Reads")} value={nf.format(views)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(FILTERS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setFilter(key);
                setPage(1);
              }}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                filter === key
                  ? "raised-solid bg-brand-primary text-white"
                  : "raised-hover text-gray-600 dark:text-gray-400"
              }`}
            >
              {t(label.ar, label.en)}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={t("ابحث عن مقال…", "Find an article…")}
            className="h-9 ps-8"
          />
        </div>
      </div>

      <div className="raised-card overflow-x-auto rounded-xl">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-start">{t("المقال", "Article")}</TableHead>
              <TableHead className="text-start">{t("الوسوم", "Tags")}</TableHead>
              <TableHead className="text-start">{t("الحالة", "Status")}</TableHead>
              <TableHead className="text-start">{t("القراءات", "Reads")}</TableHead>
              <TableHead className="text-start">{t("تاريخ النشر", "Published")}</TableHead>
              <TableHead className="text-start">{t("آخر تعديل", "Updated")}</TableHead>
              <TableHead className="w-16 text-end">{t("إجراءات", "Actions")}</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <FileText className="mx-auto h-8 w-8 text-gray-300 dark:text-gray-600" />
                  <p className="mt-2 text-sm font-medium text-brand-primary">
                    {items.length === 0
                      ? t("لا مقالات بعد", "No articles yet")
                      : t("لا مقالات مطابقة", "No matching articles")}
                  </p>
                  {items.length === 0 ? (
                    <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                      {t(
                        "أول مقال يمكن أن يكون «ما الذي تفحصه قبل شراء سيارة مستعملة».",
                        "A good first one is “what to check before buying a used car”."
                      )}
                    </p>
                  ) : null}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((post) => {
                const href = `/${locale}/marketplace/admin/content/blog/${post.slug}`;
                const title = text(post.title) || post.slug;

                return (
                  <TableRow key={post.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {/* A fixed footprint whether or not there is a picture,
                            so the rows do not change height down the table. */}
                        <span className="flex h-10 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
                          {post.cover_url || post.banner_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={post.cover_url || post.banner_url}
                              alt=""
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                        </span>

                        <span className="min-w-0">
                          <Link href={href} className="block font-medium text-brand-primary hover:underline">
                            {title}
                          </Link>
                          <span dir="ltr" className="block font-mono text-[11px] text-muted-foreground">
                            /blog/{post.slug}
                          </span>
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      {post.tags?.length ? (
                        <span className="flex flex-wrap gap-1">
                          {post.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[11px] text-brand-primary"
                            >
                              {tag}
                            </span>
                          ))}
                          {post.tags.length > 2 ? (
                            <span className="text-[11px] text-muted-foreground">
                              +{post.tags.length - 2}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    <TableCell>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                          post.published
                            ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                        }`}
                      >
                        {post.published ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {post.published ? t("منشور", "Live") : t("مسودة", "Draft")}
                      </span>
                    </TableCell>

                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {nf.format(post.views ?? 0)}
                    </TableCell>

                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {post.published ? date(post.published_at) : "—"}
                    </TableCell>

                    <TableCell className="text-xs tabular-nums text-muted-foreground">
                      {date(post.updated_at)}
                    </TableCell>

                    <TableCell className="text-end">
                      <RowActions
                        locale={locale}
                        t={t}
                        isAr={isAr}
                        post={post}
                        href={href}
                        onDelete={() => setConfirming(post)}
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* The pager is shown whenever there is anything to count, even on a
          single page — a control that appears and disappears is one somebody
          has to look for. */}
      {visible.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {t(
              `${start + 1}–${Math.min(start + PER_PAGE, visible.length)} من ${visible.length}`,
              `${start + 1}–${Math.min(start + PER_PAGE, visible.length)} of ${visible.length}`
            )}
            {visible.length !== items.length
              ? t(` (من أصل ${items.length})`, ` (filtered from ${items.length})`)
              : ""}
          </p>

          {pages > 1 ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={current === 1}
                onClick={() => setPage(current - 1)}
                aria-label={t("السابق", "Previous")}
              >
                <Prev className="h-4 w-4" />
              </Button>

              {pageNumbers(current, pages).map((n, i) =>
                n === "…" ? (
                  <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground">
                    …
                  </span>
                ) : (
                  <Button
                    key={n}
                    type="button"
                    variant={n === current ? "default" : "outline"}
                    size="sm"
                    className="min-w-9 tabular-nums"
                    aria-current={n === current ? "page" : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </Button>
                )
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={current === pages}
                onClick={() => setPage(current + 1)}
                aria-label={t("التالي", "Next")}
              >
                <Next className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {confirming ? (
        <DeleteDialog
          key={confirming.id}
          locale={locale}
          post={confirming}
          title={text(confirming.title) || confirming.slug}
          onClose={() => setConfirming(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The window of page buttons: first, last, and the neighbours of the current
 * one, with gaps marked. Forty articles must not produce forty buttons.
 */
function pageNumbers(current, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);

  const out = new Set([1, pages, current, current - 1, current + 1]);
  const list = [...out].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);

  const withGaps = [];
  let previous = 0;
  for (const n of list) {
    if (previous && n - previous > 1) withGaps.push("…");
    withGaps.push(n);
    previous = n;
  }
  return withGaps;
}

function Stat({ label, value }) {
  return (
    <div className="raised-card rounded-xl px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-brand-primary">{value}</p>
    </div>
  );
}

/**
 * Edit, view, publish/unpublish, delete.
 *
 * Publishing happens here rather than only inside the editor, because the one
 * thing an admin does most from a list is take something down — and making them
 * open an article, find a switch and save it is three steps to undo a mistake
 * that is live right now.
 */
function RowActions({ locale, t, isAr, post, href, onDelete }) {
  const router = useRouter();

  const publish = useActionResult(setBlogPostPublished, INITIAL, {
    onSuccess: () => router.refresh(),
  });

  const toggle = () => {
    const body = new FormData();
    body.set("id", post.id);
    body.set("published", post.published ? "false" : "true");
    startTransition(() => publish.formAction(body));
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" aria-label={t("إجراءات", "Actions")}>
          {publish.pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreHorizontal className="h-4 w-4" />
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"} className="w-56">
        <DropdownMenuItem asChild className="gap-2">
          <Link href={href}>
            <Pencil className="h-4 w-4" />
            {t("تعديل المقال", "Edit article")}
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem asChild className="gap-2" disabled={!post.published}>
          <a
            href={`/${locale}/marketplace/blog/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="h-4 w-4" />
            {t("عرض المقال", "View article")}
          </a>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="gap-2" onSelect={toggle}>
          {post.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {post.published ? t("إلغاء النشر", "Unpublish") : t("نشر المقال", "Publish")}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem className="gap-2 text-red-600 focus:text-red-600" onSelect={onDelete}>
          <Trash2 className="h-4 w-4" />
          {t("حذف المقال", "Delete article")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DeleteDialog({ locale, post, title, onClose }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const remove = useActionResult(deleteBlogPost, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => {
      onClose();
      router.refresh();
    },
  });

  const confirm = () => {
    const body = new FormData();
    body.set("id", post.id);
    startTransition(() => remove.formAction(body));
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {t("حذف المقال", "Delete article")}
          </DialogTitle>
          <DialogDescription className="text-start">
            {t(
              `سيُحذف «${title}» نهائياً، ولن يعمل رابطه بعد ذلك. إن كنت تريد إخفاءه فقط، ألغِ نشره بدلاً من حذفه.`,
              `"${title}" is deleted for good and its link stops working. If you only want it out of sight, unpublish it instead.`
            )}
          </DialogDescription>
        </DialogHeader>

        {remove.result?.error ? (
          <p className="text-sm text-red-600">{errorText(remove.result.error, locale, remove.result.params)}</p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            {t("إلغاء", "Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.pending}
            onClick={confirm}
            className="gap-2"
          >
            {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {t("حذف", "Delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
