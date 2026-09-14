"use client";

/**
 * The seller's listings table: search, selection, per-row publish / unpublish /
 * delete, bulk delete, and paging.
 *
 * Search and page live in the URL, not in state. Every filtered view is then
 * shareable and survives a refresh, and the server does the filtering — which
 * matters because the table used to fetch a flat 100 rows and show all of them,
 * so a seller with more than 100 cars simply could not reach the rest.
 *
 * The rows themselves are rendered by the SERVER page and passed in as
 * `children`; this component owns only the chrome around them. That keeps the
 * row markup (prices, dates, localised state labels) on the server where the
 * data already is, instead of shipping a formatter to the browser for it.
 *
 * ── Selection ───────────────────────────────────────────────────────────────
 *
 * Which rows are ticked lives in the DOM, not in React state, and this reads it
 * back off the form. That is the unusual choice here, so: the checkboxes are
 * rendered by the SERVER, inside rows this component never sees. Holding the
 * selection in state would mean shipping every row id to the client and keeping
 * two lists in step — one in state, one in the markup — for no gain. A plain
 * form already knows which of its checkboxes are ticked, and submits exactly
 * those. So the only state kept here is the COUNT, for the label on the button.
 *
 * A consequence worth stating: paging or searching clears the selection,
 * because the rows are replaced. That is the honest behaviour — a delete button
 * that silently carried rows you can no longer see would be a trap.
 */

import { Children, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Loader2, X, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { useActionResult } from "./useActionResult";
import { deleteListings } from "../_actions/listing-crud";
import { errorText } from "@/marketplace/lib/errors";
import { useOnChange } from "@/hooks/use-on-change";

export default function ListingsTable({
  locale = "ar",
  total = 0,
  page = 1,
  pageCount = 1,
  pageSize = 8,
  // Computed on the server from the rows it actually returned — see the
  // _apicalls module for why this is not (page - 1) * pageSize + 1.
  from = 0,
  to = 0,
  vendorId = null,
  children,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  /* ── Selection ─────────────────────────────────────────────────────────── */

  const formRef = useRef(null);
  const [selected, setSelected] = useState(0);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const bulk = useActionResult(deleteListings, { ok: false, error: null }, {
    onAny: () => {
      setConfirmBulk(false);
      setSelected(0);
    },
    onSuccess: () => router.refresh(),
  });

  /**
   * Recount after any tick, and drive the header checkbox.
   *
   * One handler on the form rather than one per row: change events bubble, and
   * the rows are server markup this component cannot attach to anyway. The
   * header box identifies itself with data-select-all, which is also how a tick
   * on it is told apart from a tick on a row.
   */
  const syncSelection = (event) => {
    const form = formRef.current;
    if (!form) return;

    const rows = [...form.querySelectorAll('input[name="listingIds"]')];
    const master = form.querySelector("input[data-select-all]");

    if (event?.target === master) {
      for (const box of rows) box.checked = master.checked;
    }

    const count = rows.filter((box) => box.checked).length;

    if (master) {
      master.checked = count > 0 && count === rows.length;
      // Neither on nor off: some rows are ticked. Only settable in JS, which is
      // why it is here and not an attribute on the server-rendered input.
      master.indeterminate = count > 0 && count < rows.length;
    }

    setSelected(count);
  };

  /**
   * New rows arrived — a page, a tab, a search, or a delete that shortened the
   * list. The fresh checkboxes come back unticked, so the count has to follow
   * them down rather than keep claiming a selection that no longer exists.
   *
   * Keyed on the QUERY plus the row count, not on `children`. `children` is a
   * fresh element tree on every single render, so the old effect fired on every
   * render — tick three rows, let the debounce transition land, and the count
   * silently went back to 0 while the three boxes stayed visibly ticked and the
   * bulk bar vanished. The query identifies which page of rows this is, and the
   * count catches a delete that leaves the URL alone.
   */
  const rowsKey = `${searchParams.toString()}|${Children.count(children)}`;
  useOnChange(rowsKey, () => setSelected(0));

  const setParam = (key, value, opts = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);

    // Searching from page 7 down to 3 results would show an empty table.
    // Only paging itself keeps the page number.
    if (key !== "page") params.delete("page");

    const url = `${pathname}?${params.toString()}`;
    startTransition(() => {
      if (opts.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    });
  };

  // Debounced, so typing filters without an Enter. `replace` keeps the back
  // button useful — one history entry for the search, not one per keystroke.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;

    const id = setTimeout(() => setParam("q", query.trim(), { replace: true }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // The URL changed elsewhere (a state tab, the back button) — resync the box
  // rather than leaving a stale term sitting in it. During render, so the box
  // never shows the previous tab's term for a frame.
  const urlQuery = searchParams.get("q") ?? "";
  useOnChange(`${searchParams.get("state") ?? ""}|${urlQuery}`, () => setQuery(urlQuery));

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────────────────────────
          Same shape as the Catalog toolbar — search on the lead edge, then the
          range, "per page" and the size picker pushed to the far edge by
          ms-auto. Deliberately a copy of that layout rather than a variation:
          the two tables sit next to each other in the sidebar and a seller
          should not have to relearn the controls between them.
          ------------------------------------------------------------------ */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث…", "Search…")}
            className="h-9 w-full rounded-lg border bg-background ps-9 pe-9 text-sm outline-hidden focus:border-brand-primary"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("مسح", "Clear")}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-brand-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        {pending ? <Loader2 className="h-4 w-4 animate-spin text-brand-primary" /> : null}

        <div className="ms-auto flex items-center gap-2">
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {total === 0
              ? t("لا نتائج", "No results")
              : t(`${from}–${to} من ${total}`, `${from}–${to} of ${total}`)}
          </span>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {t("لكل صفحة", "per page")}
          </span>
          <Select value={String(pageSize)} onValueChange={(v) => setParam("size", v)}>
            <SelectTrigger className="h-9 w-auto" aria-label={t("عدد الصفوف في الصفحة", "Rows per page")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[8, 16, 32, 64, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Selection bar ────────────────────────────────────────────────
          Takes the toolbar's place rather than sitting under it, so nothing
          moves when rows are ticked, and what the button will act on is the
          only thing on the line.
          ------------------------------------------------------------------ */}
      {selected > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-brand-primary/20 bg-brand-primary/5 px-3 py-2">
          <span className="text-sm font-medium tabular-nums text-brand-primary">
            {t(`${selected} محدد`, `${selected} selected`)}
          </span>

          <button
            type="button"
            onClick={() => {
              const form = formRef.current;
              for (const box of form?.querySelectorAll("input[type=checkbox]") ?? []) {
                box.checked = false;
                box.indeterminate = false;
              }
              setSelected(0);
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-brand-primary hover:underline"
          >
            {t("إلغاء التحديد", "Clear")}
          </button>

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={bulk.pending}
            onClick={() => setConfirmBulk(true)}
            className="ms-auto gap-1.5 text-red-600 hover:border-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            {bulk.pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {t("حذف المحدد", "Delete selected")}
          </Button>
        </div>
      ) : null}

      {bulk.result?.ok ? (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300">
          {t(
            `تم حذف ${bulk.result.deleted} إعلان` +
              (bulk.result.kept ? `، وتُرك ${bulk.result.kept} مرتبط بطلبات.` : "."),
            `Deleted ${bulk.result.deleted} listing(s)` +
              (bulk.result.kept ? `; ${bulk.result.kept} attached to orders were left alone.` : ".")
          )}
        </div>
      ) : null}

      {bulk.result?.ok === false && bulk.result?.error ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorText(bulk.result.error, locale, bulk.result.params)}
        </div>
      ) : null}

      {/* The rows are server markup; this form is only what collects their
          ticked checkboxes and posts them. */}
      <form ref={formRef} action={bulk.formAction} onChange={syncSelection}>
        <input type="hidden" name="vendorId" value={vendorId ?? ""} />
        {children}
      </form>

      {/* Deleting is not reversible and this one deletes many at once, so it
          asks — and says the number, because "delete selected" a moment after
          a mis-click on the header checkbox is exactly when someone needs to
          see that it means all sixty-four. */}
      <Dialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              {t(`حذف ${selected} إعلان؟`, `Delete ${selected} listing(s)?`)}
            </DialogTitle>
            <DialogDescription>
              {t(
                "لا يمكن التراجع عن هذا. الإعلانات المرتبطة بطلبات لن تُحذف وسيتم إبلاغك بها.",
                "This cannot be undone. Any listing attached to an order is kept, and you will be told which."
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmBulk(false)}>
              {t("إلغاء", "Cancel")}
            </Button>
            {/* The dialog renders in a portal, so it is OUTSIDE the form and a
                submit button here would submit nothing. requestSubmit() fires
                the form itself, action and all. */}
            <Button
              type="button"
              disabled={bulk.pending}
              onClick={() => formRef.current?.requestSubmit()}
              className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
            >
              {bulk.pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              {t("حذف", "Delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Pages ──────────────────────────────────────────────────────────
          `page > 1` is in the condition as well as `pageCount > 1`: a hand-typed
          ?page=9 lands on an empty table, and without the pager there would be
          no Previous button to get back out of it.
          ------------------------------------------------------------------ */}
      {pageCount > 1 || page > 1 ? (
        <nav className="mt-5 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => setParam("page", String(page - 1))}
          >
            {t("السابق", "Previous")}
          </Button>

          <span className="text-xs text-muted-foreground">
            {t(`صفحة ${page} من ${pageCount}`, `Page ${page} of ${pageCount}`)}
          </span>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount || pending}
            onClick={() => setParam("page", String(page + 1))}
          >
            {t("التالي", "Next")}
          </Button>
        </nav>
      ) : null}
    </>
  );
}
