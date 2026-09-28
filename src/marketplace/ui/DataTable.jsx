"use client";

/**
 * The house table: stats, filters, a search box, rows, a pager, and one actions
 * menu per row.
 *
 * ── Why this is shared and not copied a fourth time ─────────────────────────
 *
 * PageSeoTable and BlogPostsTable are the same five hundred lines twice over,
 * and the moment Billing, Finance and Subscriptions became tables too it would
 * have been five. The parts nobody should write again are the ones nobody reads
 * afterwards either — the page-number window, the "1–12 of 40 (filtered from
 * 60)" line, the overflow-x wrapper that stops a wide table taking the whole
 * dashboard sideways, the RTL-aware previous/next arrows. Those live here once.
 *
 * What stays with each page is its COLUMNS, because a column is a rendering
 * decision about that page's data and nothing else. That is also why every
 * caller is itself a client component: `columns` carries functions, and a
 * function cannot cross the server-to-client boundary. A server page hands its
 * rows to a small client wrapper, and the wrapper hands them here.
 *
 * ── A row is a LINK, and the menu is not the only way in ────────────────────
 *
 * `rowHref` turns the FIRST column into a link to the record's own page, which
 * is what a table of records should offer: the detail page is the answer to
 * "what is this", and making people find it inside a menu is a click spent
 * proving they can use a menu. The menu is for the things that ACT, and it also
 * carries the same link, so neither route is the only one.
 *
 * It is the first column and not the row because a row is full of other things
 * that are already clickable — a phone number, a storefront, the menu itself —
 * and an anchor may not contain another.
 *
 * ── Client-side paging, deliberately ────────────────────────────────────────
 *
 * The filtering and the pager run in the browser over a list the server already
 * sent whole. That is right for these three screens and would be wrong for
 * listings: a platform has tens of thousands of cars and one showroom has tens
 * of charges. Paging on the server would mean a round trip per keystroke to
 * search forty rows. If one of these lists ever runs to thousands, this is the
 * component to change, and the callers would not have to move.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, MoreHorizontal, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { matches } from "@/marketplace/lib/search";

export default function DataTable({
  locale = "ar",
  items = [],

  /* [{ key, header, cell: (row) => node, className?, headClassName? }]
     `cell` returns a node, so a column can be a badge, a link or a number —
     the table has no opinion about what a cell contains. */
  columns = [],

  /** Stable identity per row. Falls back to the index, which is correct for a
      list that is never reordered and wrong for one that is — so callers with
      an id should always pass it. */
  getKey = (row, i) => row?.id ?? i,

  /* (row) => the row's searchable text: a string, or an array, or an {ar, en}
      object — matches() flattens all three. Omit it and the search box is not
      rendered at all, which is the honest answer for a table nothing can be
      looked up in. */
  search = null,
  searchPlaceholder = null,

  /* [{ key, label: {ar, en}, test: (row) => boolean, alert?: (row) => boolean }]
     — `all` is added automatically.

     `alert` is the second count: of the rows this tab holds, how many are
     WAITING FOR SOMEBODY. A plain total tells you how big the pile is; it does
     not tell you whether any of it is yours to deal with, and those are
     different questions — a Due tab reading 11 looks the same whether all
     eleven are sitting quietly or one has a receipt somebody sent this morning.

     It clears itself. The count is derived from the rows on every render, so
     the moment an admin records the payment or a seller sends the receipt, the
     row stops matching and the badge goes — there is no "seen" flag to set, and
     therefore none to forget to set. */
  filters = [],

  /** (row) => boolean — the same alert, for the `all` tab. */
  alert = null,

  /** [{ label, value }] across the top. */
  stats = [],

  /** (row) => [{ key, label, href?, onSelect?, icon?, danger?, separator? }] */
  actions = null,

  /** (row) => string — makes the row navigable. */
  rowHref = null,

  perPage = 12,

  /** The width below which the table scrolls rather than crushing its columns. */
  minWidth = "900px",

  /** { icon, title, body, action } — shown in place of the rows. */
  empty = null,

  /** Rendered between the toolbar and the table: a banner, a queue, a note. */
  children = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const active = filters.find((f) => f.key === filter);
    const needle = query.trim();

    return items.filter((row) => {
      if (active?.test && !active.test(row)) return false;
      if (!needle || !search) return true;

      /* matches(), not includes(). Half this marketplace is in Arabic, where a
         typist and a reader do not agree on which letter they used — "الاحمدي"
         and "الأحمدي" are one word to a person and two strings to a
         substring search, which answers "no results" for a row on the screen
         behind the box. lib/search.js folds both sides first, and also matches
         each WORD anywhere in the row, so "riyadh toyota" finds a Riyadh
         showroom's Toyota. */
      return matches(needle, [search(row)]);
    });
  }, [items, filters, filter, query, search]);

  const pages = Math.max(1, Math.ceil(visible.length / perPage));
  /* Clamped rather than reset. Deleting the last row of page four should show
     page three, not throw the reader back to page one. */
  const current = Math.min(page, pages);
  const start = (current - 1) * perPage;
  const rows = visible.slice(start, start + perPage);

  // In RTL "previous" points the other way. Reversing the icons rather than the
  // order keeps the buttons where the hand expects them.
  const Prev = isAr ? ChevronRight : ChevronLeft;
  const Next = isAr ? ChevronLeft : ChevronRight;

  const TABS = filters.length
    ? [{ key: "all", label: { ar: "الكل", en: "All" }, alert }, ...filters]
    : [];

  return (
    <div className="grid gap-4">
      {stats.length ? (
        <div className={`grid gap-3 ${stats.length > 3 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-3"}`}>
          {stats.map((s) => (
            <div key={s.label} className="raised-card rounded-xl px-4 py-3">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-0.5 truncate text-xl font-bold tabular-nums text-brand-primary sm:text-2xl">
                {s.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {TABS.length || search ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {TABS.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => {
                  setFilter(x.key);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  filter === x.key
                    ? "raised-solid bg-brand-primary text-white"
                    : "raised-hover text-gray-600 dark:text-gray-400"
                }`}
              >
                {t(x.label.ar, x.label.en)}

                {/* How many rows. On the tab, so choosing one is never a guess
                    about whether it holds anything, and a zero is shown rather
                    than hidden — "Overdue 0" is the best news on the screen. */}
                <span className="ms-1.5 text-xs tabular-nums opacity-70">
                  {x.test ? items.filter(x.test).length : items.length}
                </span>

                {/* And how many of them are WAITING. Amber and separate, because
                    it is a different fact from the size of the pile: it is the
                    number somebody has to do something about. Hidden at zero —
                    unlike the total, "0 waiting" is not news, it is the normal
                    state, and a permanent badge is a badge nobody reads. */}
                {(() => {
                  if (!x.alert) return null;
                  const waiting = items.filter(
                    (row) => (!x.test || x.test(row)) && x.alert(row)
                  ).length;
                  if (!waiting) return null;

                  return (
                    <span
                      className={`ms-1.5 rounded-full px-1.5 text-[11px] font-bold tabular-nums ${
                        filter === x.key
                          ? "bg-white/25 text-white"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                      }`}
                      title={t("بانتظار إجراء", "Waiting for action")}
                    >
                      {waiting}
                    </span>
                  );
                })()}
              </button>
            ))}
          </div>

          {search ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder ?? t("ابحث…", "Search…")}
                className="h-9 ps-8"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {children}

      <div className="raised-card overflow-x-auto rounded-xl">
        <Table style={{ minWidth }}>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={`text-start ${c.headClassName ?? ""}`}>
                  {c.header}
                </TableHead>
              ))}
              {actions ? (
                <TableHead className="w-16 text-end">{t("إجراءات", "Actions")}</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (actions ? 1 : 0)} className="py-12 text-center">
                  {/* Two different emptinesses, and telling them apart is the
                      whole value of saying anything: a filter that matched
                      nothing is the reader's own doing and is undone by clearing
                      it, while a table with no rows at all needs to say what
                      would put one there. */}
                  {items.length && (query || filter !== "all") ? (
                    <>
                      <p className="text-sm text-muted-foreground">
                        {t("لا نتائج مطابقة", "Nothing matches")}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => {
                          setQuery("");
                          setFilter("all");
                          setPage(1);
                        }}
                      >
                        {t("إظهار الكل", "Show everything")}
                      </Button>
                    </>
                  ) : (
                    <>
                      {empty?.icon ? (
                        <div className="mb-3 flex justify-center text-gray-300 dark:text-gray-600">
                          {empty.icon}
                        </div>
                      ) : null}
                      <p className="font-semibold text-brand-primary">
                        {empty?.title ?? t("لا شيء بعد", "Nothing here yet")}
                      </p>
                      {empty?.body ? (
                        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                          {empty.body}
                        </p>
                      ) : null}
                      {empty?.action ? <div className="mt-3">{empty.action}</div> : null}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => {
                const key = getKey(row, start + i);
                const href = rowHref?.(row) ?? null;
                const menu = actions?.(row) ?? null;

                return (
                  <TableRow key={key}>
                    {columns.map((c, ci) => (
                      <TableCell key={c.key} className={c.className}>
                        {/* ── ONLY the first cell is a link ─────────────────
                            Every cell used to be wrapped, and that is invalid
                            markup the moment a cell has an anchor of its own —
                            a phone number to ring, a storefront to open, the
                            actions menu. React says so out loud: "Invalid
                            <Link> with <a> child".

                            So the link lives in the cell that IDENTIFIES the
                            record and nowhere else. Callers keep that first
                            column free of anchors; every other column may hold
                            whatever it needs, including links that go somewhere
                            different from the row. A row-level onClick was the
                            other option and is worse: it swallows the clicks
                            belonging to those inner controls. */}
                        {href && ci === 0 ? (
                          <Link href={href} className="block hover:underline">
                            {c.cell(row)}
                          </Link>
                        ) : (
                          c.cell(row)
                        )}
                      </TableCell>
                    ))}

                    {actions ? (
                      <TableCell className="text-end">
                        {menu?.length ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={t("إجراءات", "Actions")}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>

                            <DropdownMenuContent align={isAr ? "start" : "end"} className="w-48">
                              {menu.map((a) => (
                                <div key={a.key}>
                                  {a.separator ? <DropdownMenuSeparator /> : null}
                                  <DropdownMenuItem
                                    asChild={Boolean(a.href)}
                                    onSelect={a.onSelect}
                                    disabled={a.disabled}
                                    className={
                                      a.danger
                                        ? "text-red-600 focus:text-red-600 dark:text-red-400"
                                        : undefined
                                    }
                                  >
                                    {a.href ? (
                                      <Link href={a.href} className="flex items-center gap-2">
                                        {a.icon}
                                        {a.label}
                                      </Link>
                                    ) : (
                                      <span className="flex items-center gap-2">
                                        {a.icon}
                                        {a.label}
                                      </span>
                                    )}
                                  </DropdownMenuItem>
                                </div>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Shown whenever there is anything to count, even on a single page — a
          control that appears and disappears is one somebody has to look for. */}
      {visible.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground tabular-nums">
            {t(
              `${start + 1}–${Math.min(start + perPage, visible.length)} من ${visible.length}`,
              `${start + 1}–${Math.min(start + perPage, visible.length)} of ${visible.length}`
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
    </div>
  );
}

/**
 * The window of page buttons: first, last, and the neighbours of the current
 * one, with gaps marked. Forty pages must not produce forty buttons.
 */
export function pageNumbers(current, pages) {
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
