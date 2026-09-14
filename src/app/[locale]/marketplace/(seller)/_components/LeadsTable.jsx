"use client";

/**
 * The leads table — a small CRM, and the reason the lead form exists.
 *
 * ── The columns are not fixed ───────────────────────────────────────────────
 *
 * They are built from THIS showroom's own form. A finance broker's table has
 * Employer and Monthly income; a used-car dealer's has Trade-in and Budget.
 * Neither column exists in the schema — both are keys in `answers`, and the
 * field definitions are the header row.
 *
 * That is why the table is generated rather than written out: a seller adding a
 * question in Dashboard → Lead form gets a column here on the next page load,
 * with no code change and no migration.
 *
 * ── Why a table and not the card list ───────────────────────────────────────
 *
 * A card list answers "what did this one person say". A seller with forty leads
 * is asking a different question — who is worth calling first — and that is a
 * comparison across rows, which is what a table is for. The card view still
 * exists one click away, on the lead page.
 *
 * Columns can be switched off and the choice is remembered, because eight
 * custom fields is a table nobody can read on a laptop.
 */

import { useMemo, useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useOnChange } from "@/hooks/use-on-change";
import {
  ChevronDown, Columns3, Phone, ExternalLink, Search, X, CheckCheck, Loader2, RotateCcw,
  Trash2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { readAnswers } from "@/marketplace/lib/form-fields";
import { SELLER_STAGES } from "@/marketplace/lib/lead-stages";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useActionResult } from "./useActionResult";
import { markAllLeadsRead, deleteLead, restoreLead } from "../_actions/leads";

/* The labels live in lib/lead-stages so the table and the lead workspace
   cannot drift apart — they had already begun to. */
const STAGES = SELLER_STAGES;
const STAGE = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/**
 * How many of the seller's own answers the table shows before they say
 * otherwise. Three fits beside Buyer, Car, Stage and Received on a laptop
 * without a horizontal scrollbar, which is the actual constraint.
 */
const DEFAULT_COLUMNS = 3;

export default function LeadsTable({
  locale = "ar",
  rows = [],
  fields = [],
  basePath,
  // Needed by Mark all read. The action re-derives it from the session anyway —
  // this is which of several showrooms, not proof of anything.
  vendorId = null,
  // Real totals per stage for the WHOLE pipeline, from the page. They have to
  // survive the filter: tabs that all read 0 except the one you are on are
  // tabs that have stopped being navigation.
  counts: serverCounts = null,
  /**
   * Whether this table draws its own pipeline tabs.
   *
   * Off for any page that already filters by stage itself. Two rows of tabs
   * doing the same job, one of which silently overrides the other, is worse
   * than either.
   */
  showStages = true,

  /* ── The view, as the SERVER resolved it ─────────────────────────────────
     Every one of these came out of the URL and was applied by the database.
     They are echoed back so the controls show what is actually on screen —
     a table whose search box and rows disagree is one nobody trusts. */
  stage = "",
  query: serverQuery = "",
  unread = false,
  total = 0,
  page = 1,
  pageCount = 1,
  pageSize = 20,
  pageSizes = [8, 16, 32, 64, 100],
  from = 0,
  to = 0,
  // §21.5 has not been run, so there is no search_text column to match on.
  searchUnavailable = false,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const text = (obj) => obj?.[locale] || obj?.en || obj?.ar || "";

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // The box is local so typing is instant; the URL is written on submit. A
  // param per keystroke would be a database query per keystroke.
  const [box, setBox] = useState(serverQuery);

  // The server's term wins whenever it changes — clearing the filter from
  // anywhere else must empty the box rather than leave a stale word sitting in
  // it, implying a filter that is no longer applied. Applied during render, so
  // the box never shows the cleared-away term for a frame.
  useOnChange(serverQuery, (next) => setBox(next));

  /**
   * Coming BACK to this list, with the browser button.
   *
   * ── The bug this fixes ──────────────────────────────────────────────────
   *
   * A seller opens a lead, which marks it read in the database, and presses
   * Back. The row is still bold, still dotted, still counted under Unread —
   * because Next restored the page it had cached rather than asking the server
   * again. The lead WAS read; the list is simply showing a snapshot from
   * before it was.
   *
   * This is not a caching mistake to correct elsewhere. Next's own docs are
   * explicit that staleTimes "doesn't change back/forward caching behavior to
   * prevent layout shift and to prevent losing the browser scroll position" —
   * back/forward is served from the client cache by design, and no config
   * changes it. A forward navigation, including clicking Leads in the sidebar,
   * already refetches because the `dynamic` stale time defaults to 0.
   *
   * So the page asks for itself again when it is restored. router.refresh()
   * keeps the scroll position and the React state that back/forward caching
   * exists to protect, and replaces only the server-rendered data — which is
   * exactly the half that went stale.
   *
   * It fires for any restore, not only after reading a lead: a stage a
   * colleague moved and a request the buyer withdrew go stale the same way.
   *
   * pageshow with `persisted` covers the other restore — the browser's bfcache,
   * when the seller left the site entirely and came back.
   */
  useEffect(() => {
    const onRestore = () => router.refresh();
    const onPageShow = (e) => { if (e.persisted) router.refresh(); };

    window.addEventListener("popstate", onRestore);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onRestore);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  /**
   * One writer for the whole view.
   *
   * Anything other than `page` resets it: narrowing from page 7 down to three
   * results would otherwise land on an empty table with no way back but the
   * browser's Back button.
   */
  const setParams = (changes) => {
    const params = new URLSearchParams(searchParams.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    // Anything other than paging resets the page.
    if (!("page" in changes)) params.delete("page");

    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  /**
   * Takes an OBJECT, not a key and a value.
   *
   * Two calls in a row do not compose: both build their URL from the same
   * `searchParams` snapshot, so the second push silently undoes the first. The
   * All tab clears two params at once and was doing exactly that — leaving the
   * stage filter on while appearing to clear it.
   */
  const setParam = (key, value) => setParams({ [key]: value });

  /**
   * Unread — leads nobody at this showroom has opened yet.
   *
   * `read_at` is null until somebody actually opens one (schema.sql §21.3), and
   * rows that predate the column read as unread, which is the truthful answer
   * for leads nobody can prove was looked at.
   *
   * Counted for the whole pipeline by the page, not from `rows`: with paging in
   * place `rows` is one screenful, so counting here would say "3 unread" on a
   * pipeline with sixty.
   */
  const unreadCount = serverCounts?.unread ?? rows.filter((r) => !r.read_at).length;

  /**
   * The row awaiting confirmation, or null.
   *
   * The ROW rather than a boolean, and ONE dialog for the whole table rather
   * than one per line — the same shape the catalog table uses. Holding the row
   * is what lets the dialog name the person being deleted, which is the
   * difference between "Delete?" and "Delete Arman khan's request?".
   */
  const [confirmDelete, setConfirmDelete] = useState(null);

  const del = useActionResult(deleteLead, { ok: false, error: null }, {
    autoClearMs: 0,
    onSuccess: () => setConfirmDelete(null),
  });

  /**
   * Putting a lead back.
   *
   * No optimistic removal from the list: the row leaving the Deleted view IS
   * the confirmation, and it happens when the server says so. Being shown a
   * restore that then silently failed is the one outcome this whole feature
   * exists to prevent.
   */
  const [restoringId, setRestoringId] = useState(null);

  const restore = useActionResult(restoreLead, { ok: false, error: null }, {
    autoClearMs: 4000,
    onAny: (result) => {
      setRestoringId(null);
      if (result?.ok) router.refresh();
    },
  });

  const readAll = useActionResult(markAllLeadsRead, { ok: false, error: null }, {
    // Same reason as MarkLeadRead: the badge is in the layout, which a page
    // revalidate does not re-render.
    onSuccess: () =>
      window.dispatchEvent(
        new CustomEvent("marketplace:leads-read", { detail: { all: true } })
      ),
  });
  const [hidden, setHidden] = useState(() => new Set());
  const [hasChosen, setHasChosen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  /**
   * Which columns are switched off, remembered per showroom.
   *
   * ── Why the default is THREE and not all of them ──────────────────────────
   *
   * The starter form asks ten questions, and a column each turns this into a
   * table that scrolls sideways twice before it reaches Received. A seller
   * scanning their pipeline is answering one question — who do I ring first —
   * and that is decided by three or four answers, not by everything a buyer
   * typed. The rest are one click away on the lead itself, laid out to be read
   * rather than truncated into a 200px cell.
   *
   * The seller's OWN order decides which three: whatever they put at the top of
   * the form is what they said matters most, so the table takes them at their
   * word rather than picking for them.
   *
   * Only a default. Every column is still in the picker, and the moment a
   * seller changes anything their choice is stored and this stops applying —
   * `hasChosen` is what separates "they have not decided yet" from "they
   * decided to see one column".
   */
  const storageKey = `leads-hidden:${basePath}`;
  const seeded = useRef(false);

  /** Stores whatever set it is handed, and records that the seller chose it. */
  const commitHidden = (next) => {
    setHidden(next);
    setHasChosen(true);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch { /* see above */ }
  };

  const toggleColumn = (key) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commitHidden(next);
  };

  /**
   * The dynamic half of the header.
   *
   * Built from the seller's ACTIVE fields, then extended with any key that
   * appears in the data but no longer has a definition — a question they asked
   * last month and have since deleted. Dropping those columns would quietly
   * hide answers people actually gave.
   */
  /**
   * The columns on offer: the questions this showroom CURRENTLY asks.
   *
   * Deleted and switched-off questions used to appear here too, gathered from
   * the answers themselves and tagged "removed". The reasoning was that the
   * data still exists — which is true — but it made the picker a graveyard:
   * every question the seller had ever tried was listed for ever, and the
   * longer the showroom traded the less the list resembled its form.
   *
   * Nothing is hidden by removing them. Those answers are still on the lead
   * page in full, still counted by the +N badge on Open, and still searchable
   * from the box above — the search runs over every answer, not just the
   * visible columns. What goes is only the offer to put a dead question in a
   * table header.
   */
  const columns = useMemo(
    () =>
      fields
        .filter((f) => f.active)
        .map((f) => ({ key: f.field_key, label: text(f.label) || f.field_key })),
    [fields, locale]
  );

  /**
   * The seller's saved column choice, read once per table.
   *
   * Placed AFTER `columns` deliberately: it reads it, and a closure written
   * above the declaration is one the lint cannot reason about — it cannot tell
   * that the effect will not re-run when the column list changes, which is the
   * whole intent here. Reading it below says the same thing in an order that is
   * true on the page as well as at runtime.
   *
   * Still an effect rather than a lazy useState initialiser, and still guarded
   * by `seeded`: localStorage does not exist on the server, so this genuinely
   * cannot be read during the first render, and re-running it on every change
   * to `columns` would overwrite the seller's own choices every time they edit
   * a question.
   */
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;

    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) {
        // Same reason as every other localStorage seed in this app: unreadable
        // on the server, so it cannot be a render-time value. Guarded by
        // `seeded` so it happens once per table.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHidden(new Set(JSON.parse(saved)));
        setHasChosen(true);
        return;
      }
    } catch {
      // A blocked or full localStorage is not a reason to fail to render a
      // table — it just means the default applies every time.
    }

    // Nothing stored: hide everything past the first few.
    setHidden(new Set(columns.slice(DEFAULT_COLUMNS).map((c) => c.key)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const visible = columns.filter((c) => !hidden.has(c.key));

  const prepared = useMemo(
    () =>
      rows.map((row) => {
        const answers = readAnswers(row.answers, fields, locale);
        return {
          row,
          byKey: Object.fromEntries(answers.map((a) => [a.key, a.value])),
        };
      }),
    [rows, fields, locale]
  );

  // The keys currently drawn as columns. Everything else a buyer answered is
  // what the +N badge on each row counts.
  const shown = new Set(visible.map((c) => c.key));

  /**
   * The rows ARE the result now.
   *
   * Stage, unread and the search term are applied by the database (see
   * getVendorLeads), so there is nothing left to filter here — and filtering
   * again would be actively wrong: it would narrow a page that has already been
   * narrowed, and the "1–20 of 340" line would stop matching what is drawn.
   */
  const filtered = prepared;

  // Always the page's totals when it supplies them: `rows` is one screenful
  // now, so counting it would show "Won 0" on any page that happens not to
  // contain a won lead.
  const counts = useMemo(() => {
    if (serverCounts) return serverCounts;
    const out = { all: rows.length };
    for (const s of STAGES) out[s.key] = rows.filter((r) => r.stage === s.key).length;
    return out;
  }, [rows, serverCounts]);

  return (
    <div className="flex flex-col gap-3">
      {/* ── Pipeline ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {showStages ? (
          <>
            {/* Every tab is a URL. Unread is a SEPARATE param, not a stage,
                because it cuts across them — a lead can be unread and already
                Quoted if a colleague moved it from their phone. Selecting a
                stage therefore does not clear it, and vice versa. */}
            <Tab
              active={!stage && !unread}
              onClick={() => setParams({ stage: "", unread: "" })}
              label={t("الكل", "All")}
              count={counts.all}
            />

            {/* Only while there are any. A permanent "Unread 0" is a tab that
                has stopped meaning anything, and it pushes the pipeline — the
                thing a seller is actually here for — one place along. */}
            {unreadCount || unread ? (
              <Tab
                active={unread}
                onClick={() => setParam("unread", unread ? "" : "1")}
                label={t("غير مقروء", "Unread")}
                count={unreadCount}
                accent
              />
            ) : null}

            {STAGES.filter(
              (st) => !st.onlyWhenPresent || counts[st.key] || stage === st.key
            ).map((st) => (
              <Tab
                key={st.key}
                active={stage === st.key}
                onClick={() => setParam("stage", stage === st.key ? "" : st.key)}
                label={t(st.ar, st.en)}
                count={counts[st.key]}
                hint={t(st.hintAr, st.hintEn)}
              />
            ))}

            {/* The bin.
                Last, and only while something is in it — a permanent "Deleted 0"
                would sit beside the pipeline advertising a place nobody needs to
                go. It is not a stage: a lead in here kept whichever stage it had,
                which is what makes Restore give a seller their work back rather
                than a fresh row. */}
            {counts.deleted || stage === "deleted" ? (
              <Tab
                active={stage === "deleted"}
                onClick={() =>
                  setParams({ stage: stage === "deleted" ? "" : "deleted", unread: "" })
                }
                label={t("المحذوفة", "Deleted")}
                count={counts.deleted}
                hint={t(
                  "محذوفة خلال آخر ٣٠ يوماً. يمكنك استعادتها.",
                  "Deleted in the last 30 days. You can put them back."
                )}
              />
            ) : null}

            {pending ? <Loader2 className="h-4 w-4 animate-spin text-brand-primary" /> : null}
          </>
        ) : null}

        <div className="ms-auto flex items-center gap-2">
          {/* Its own form, not a button inside one — nothing on this page is
              wrapped in a form, and an inner one would be discarded by the HTML
              parser with its button left submitting the outer action. */}
          {unreadCount && vendorId ? (
            <form action={readAll.formAction}>
              <input type="hidden" name="vendorId" value={vendorId} />
              <button
                type="submit"
                disabled={readAll.pending}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand-primary hover:text-brand-primary disabled:opacity-50 dark:border-white/10"
              >
                {readAll.pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCheck className="h-3.5 w-3.5" />
                )}
                {t("تعليم الكل كمقروء", "Mark all read")}
              </button>
            </form>
          ) : null}

          {/* A form, so Enter searches. The database runs this one — searching
              on every keystroke would be a query per keystroke, and the term
              has to reach the URL for the result to be shareable. */}
          <form
            onSubmit={(e) => { e.preventDefault(); setParam("q", box.trim()); }}
            className="relative"
          >
            <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={box}
              onChange={(e) => setBox(e.target.value)}
              placeholder={t("ابحث ثم Enter", "Search, then Enter")}
              aria-label={t("ابحث في العملاء والردود", "Search leads and answers")}
              className="w-44 rounded-lg border border-gray-200 py-1.5 ps-8 pe-7 text-xs outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5"
            />
            {box ? (
              <button
                type="button"
                onClick={() => { setBox(""); setParam("q", ""); }}
                aria-label={t("مسح", "Clear")}
                className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </form>

          {columns.length ? (
            /* shadcn's DropdownMenu, not a hand-rolled absolute div.
               The hand-rolled one had no outside-click close, no Escape, no
               focus management and no arrow-key navigation — four things a
               menu is expected to do that nobody notices until the menu is the
               one thing left open on the screen. */
            <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus-visible:border-brand-primary dark:border-white/10"
                >
                  <Columns3 className="h-3.5 w-3.5" />
                  {t("الأعمدة", "Columns")}
                  {/* The ratio, not just the word. "Columns" gives no hint that
                      seven answers are switched off; "3/10" does. */}
                  <span className="tabular-nums text-muted-foreground">
                    {visible.length}/{columns.length}
                  </span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-60">
                <div className="flex items-center gap-1 px-1 py-0.5">
                  <DropdownMenuItem
                    // onSelect preventDefault: these two set the whole
                    // selection, and a menu that shuts on the first press makes
                    // "show all, then hide two" a three-trip job.
                    onSelect={(e) => { e.preventDefault(); commitHidden(new Set()); }}
                    className="text-[11px] font-medium text-brand-primary"
                  >
                    {t("أظهر الكل", "Show all")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      commitHidden(new Set(columns.slice(DEFAULT_COLUMNS).map((c) => c.key)));
                    }}
                    className="text-[11px] text-muted-foreground"
                  >
                    {t(`أول ${DEFAULT_COLUMNS}`, `First ${DEFAULT_COLUMNS}`)}
                  </DropdownMenuItem>
                </div>

                <DropdownMenuSeparator />

                {columns.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!hidden.has(c.key)}
                    onCheckedChange={() => toggleColumn(c.key)}
                    onSelect={(e) => e.preventDefault()}
                    className="text-xs"
                  >
                    <span className="truncate">{c.label}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {/* Same shape as the Listings and Catalog toolbars — the range, then
              "per page", then the size picker. Deliberately a copy rather than
              a variation: the three tables sit next to each other in the
              sidebar and a seller should not relearn the controls between
              them. */}
          <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {total === 0
              ? t("لا نتائج", "No results")
              : t(`${from}–${to} من ${total}`, `${from}–${to} of ${total}`)}
          </span>

          <Select value={String(pageSize)} onValueChange={(v) => setParam("size", v)}>
            <SelectTrigger
              className="h-8 w-auto text-xs"
              aria-label={t("عدد الصفوف في الصفحة", "Rows per page")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* §21.5 has not been run, so there is no column to search. Said plainly
          rather than returning nothing, which would read as "no such lead". */}
      {searchUnavailable ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t(
            "البحث غير مفعّل بعد — شغّل schema.sql (القسم 21.5).",
            "Search is not switched on yet — run schema.sql (section 21.5)."
          )}
        </p>
      ) : null}

      {/* A failure has to be visible: the button is the only way to clear a
          badge, and one that silently does nothing is worse than none. */}
      {readAll.result?.error ? (
        <p className="text-xs text-red-600">
          {readAll.result.error === "LEADS_NOT_MIGRATED"
            ? t(
                "شغّل schema.sql (القسم 21.3) لتفعيل حالة القراءة.",
                "Run schema.sql (section 21.3) to switch read state on."
              )
            : t("تعذّر التعليم كمقروء.", "Could not mark these as read.")}
        </p>
      ) : null}

      {/* ── The table ────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-white/15">
          <p className="text-sm text-muted-foreground">
            {/* `rows` is one page now, so "no rows" no longer means "no leads".
                The filter is what distinguishes an empty pipeline from an empty
                RESULT, and telling someone "no leads yet" when they have four
                hundred behind a search term is the confusing version. */}
            {serverQuery || stage || unread
              ? t("لا نتائج لهذا الفلتر.", "Nothing matches that filter.")
              : t("لا عملاء بعد.", "No leads yet.")}
          </p>

          {serverQuery || stage || unread ? (
            <button
              type="button"
              onClick={() => {
                setBox("");
                setParams({ q: "", stage: "", unread: "" });
              }}
              className="mt-3 text-xs font-medium text-brand-primary underline-offset-4 hover:underline"
            >
              {t("امسح الفلاتر", "Clear filters")}
            </button>
          ) : null}
        </div>
      ) : (
        // The wrapper scrolls, not the page: a showroom with eight custom
        // fields would otherwise push the whole dashboard sideways.
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
          <table className="w-full min-w-max text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-muted-foreground dark:bg-white/5">
              <tr>
                <Th>{t("المشتري", "Buyer")}</Th>
                <Th>{t("السيارة", "Car")}</Th>
                <Th>{t("المرحلة", "Stage")}</Th>
                {visible.map((c) => (
                  <Th key={c.key}>{c.label}</Th>
                ))}
                <Th>{t("وصل", "Received")}</Th>
                <Th />
                <Th />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {filtered.map(({ row, byKey }) => {
                const tone = STAGE[row.stage] ?? STAGE.new;
                const isUnread = !row.read_at;
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-gray-50/60 dark:hover:bg-white/5 ${
                      // A tint AND a dot AND weight, because one signal is one
                      // signal: the tint is invisible to a colourblind seller,
                      // the dot is easy to miss on a full screen, and weight
                      // alone reads as emphasis rather than as state.
                      isUnread ? "bg-brand-primary/[0.035] dark:bg-brand-primary/10" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <p
                        className={`flex items-center gap-1.5 ${
                          isUnread
                            ? "font-semibold text-gray-900 dark:text-white"
                            : "font-medium text-gray-900 dark:text-gray-100"
                        }`}
                      >
                        {isUnread ? (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-primary"
                            // Named, not decorative. A screen reader gets the
                            // state; a dot on its own is silence.
                            role="img"
                            aria-label={t("غير مقروء", "Unread")}
                          />
                        ) : null}
                        {row.contact_name || t("مشترٍ", "Buyer")}
                      </p>
                      {row.contact_phone ? (
                        <a
                          href={`tel:${row.contact_phone}`}
                          dir="ltr"
                          className="mt-0.5 flex items-center gap-1 text-xs text-brand-primary hover:underline"
                        >
                          <Phone className="h-3 w-3" />
                          {row.contact_phone}
                        </a>
                      ) : null}
                    </td>

                    {/* The title snapshotted onto the lead, so the row still
                        reads after the car is sold and the listing is gone. */}
                    <td className="max-w-[180px] truncate px-3 py-2.5 text-muted-foreground">
                      {row.listing_title?.[locale] || row.listing_title?.en || "—"}
                    </td>

                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.tone}`}>
                        {t(tone.ar, tone.en)}
                      </span>
                    </td>

                    {visible.map((c) => (
                      <td key={c.key} className="max-w-[200px] truncate px-3 py-2.5">
                        {byKey[c.key] !== undefined && byKey[c.key] !== "" ? (
                          String(byKey[c.key])
                        ) : (
                          // An em dash, not a blank cell: "they were not asked"
                          // and "the row is still loading" look identical when
                          // the cell is empty.
                          <span className="text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>
                    ))}

                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                      {when(row.created_at, locale)}
                    </td>

                    {/* No Open in the bin.
                        getLead() refuses a deleted lead on purpose — a seller
                        must not work a row they believe they deleted — so the
                        link led straight to a 404. A link that cannot go
                        anywhere is worse than no link: it reads as a broken
                        page rather than as a deliberate rule. Restore first,
                        then open it. */}
                    <td className="px-3 py-2.5">
                      {stage === "deleted" ? null : (
                      <Link
                        href={`${basePath}/${row.id}`}
                        className="flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline"
                      >
                        {t("فتح", "Open")}
                        {/* How many answers this buyer gave that the table is
                            not showing. Without it a seller has no way of
                            knowing the row is a summary rather than the whole
                            of what was said. */}
                        {(() => {
                          // Against `shown`, not against `hidden`: a retired
                          // question is in neither set now, and counting by
                          // `hidden` would silently stop counting exactly the
                          // answers this badge exists to point at.
                          const more = Object.keys(byKey).filter(
                            (k) => !shown.has(k) && byKey[k] !== "" && byKey[k] != null
                          ).length;
                          return more ? (
                            <span className="rounded-full bg-gray-100 px-1.5 text-[10px] tabular-nums text-gray-500 dark:bg-white/10">
                              +{more}
                            </span>
                          ) : null;
                        })()}
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                      )}
                    </td>

                    {/* ── Restore, in the bin. Delete, on a dead row. ──────
                        In the Deleted view every row is restorable and nothing
                        else applies — Open would 404, because getLead() refuses
                        a binned lead on purpose.
                        Elsewhere the trash icon stays limited to a withdrawn
                        request: a delete on every line is a mis-tap away from a
                        live opportunity, and although that mis-tap is now
                        recoverable, "recoverable" is not a reason to make it
                        easier to make. */}
                    <td className="px-2 py-2.5">
                      {stage === "deleted" && vendorId ? (
                        <form
                          action={restore.formAction}
                          /* One hook serves every row, so the id is recorded on
                             submit — otherwise `pending` would spin all of them
                             at once and none of them would mean anything. */
                          onSubmit={() => setRestoringId(row.id)}
                        >
                          <input type="hidden" name="leadId" value={row.id} />
                          <input type="hidden" name="vendorId" value={vendorId} />
                          <button
                            type="submit"
                            disabled={restoringId === row.id}
                            aria-label={t("استعادة", "Restore")}
                            title={t(
                              "أعد هذا الطلب إلى القائمة بحالته السابقة",
                              "Put this back in the pipeline, exactly as it was"
                            )}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:opacity-60"
                          >
                            {/* The icon IS the spinner. RotateCcw is already a
                                circular arrow, so spinning the same glyph reads
                                as "putting it back" rather than swapping in a
                                generic loader and losing what the button was. */}
                            <RotateCcw
                              className={`h-3.5 w-3.5 ${
                                restoringId === row.id ? "animate-spin" : ""
                              }`}
                            />
                            {restoringId === row.id
                              ? t("جارٍ الاستعادة…", "Restoring…")
                              : t("استعادة", "Restore")}
                          </button>
                        </form>
                      ) : row.stage === "cancelled" && vendorId ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          aria-label={t("احذف الطلب", "Delete this request")}
                          title={t("احذف الطلب الملغى", "Delete this cancelled request")}
                          className="rounded p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* `page > 1` is in the condition as well as `pageCount > 1`: a
          hand-typed ?page=9 lands on an empty table, and without the pager
          there would be no Previous button to get back out of it. */}
      {/* ── Delete confirm ──────────────────────────────────────────────────
          Same shape as the Catalog and Listings tables: shadcn Dialog, red
          title with a warning icon, what actually happens spelled out, then
          Cancel and a destructive button.

          The form lives INSIDE DialogContent, so `type="submit"` reaches it.
          The Listings table needs a formRef and requestSubmit() because its
          form is out in the page and the dialog renders in a portal — here
          there is nothing to reach across.
          ------------------------------------------------------------------ */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        {confirmDelete ? (
          <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {t("حذف طلب", "Delete request")}{" "}
                “{confirmDelete.contact_name || t("مشترٍ", "Buyer")}”
              </DialogTitle>
              <DialogDescription>
                {t(
                  "سيختفي من قائمتك ومن حساب المشتري. يبقى في تبويب «المحذوفة» ٣٠ يوماً ويمكنك استعادته خلالها.",
                  "It leaves your list and the buyer's account. It stays in the Deleted tab for 30 days, and you can put it back from there."
                )}
              </DialogDescription>
            </DialogHeader>

            {/* What is about to be lost, so the decision is made against the
                thing itself rather than against a name. */}
            <div className="rounded-lg border border-gray-200 p-3 text-xs dark:border-white/10">
              <p className="text-muted-foreground">
                {confirmDelete.listing_title?.[locale] ||
                  confirmDelete.listing_title?.en ||
                  t("سيارة محذوفة", "Car no longer listed")}
              </p>
              {confirmDelete.contact_phone ? (
                <p dir="ltr" className="mt-1 tabular-nums text-gray-700 dark:text-gray-300">
                  {confirmDelete.contact_phone}
                </p>
              ) : null}
              <p className="mt-1 text-muted-foreground">
                {t("وصل", "Received")} {when(confirmDelete.created_at, locale)}
              </p>
            </div>

            {del.result?.error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {del.result.error === "LEADS_NOT_MIGRATED"
                  ? t(
                      "جدول العملاء غير موجود — شغّل schema.sql.",
                      "The leads table does not exist — run schema.sql."
                    )
                  : del.result.error === "NOT_FOUND"
                    ? t("لم يعد هذا الطلب موجوداً.", "That request no longer exists.")
                    : t("تعذّر الحذف.", "Could not delete it.")}
              </p>
            ) : null}

            <form action={del.formAction} className="flex justify-end gap-3">
              <input type="hidden" name="vendorId" value={vendorId ?? ""} />
              <input type="hidden" name="leadId" value={confirmDelete.id} />
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={del.pending} className="gap-2">
                {del.pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {t("حذف", "Delete")}
              </Button>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      {pageCount > 1 || page > 1 ? (
        <nav className="mt-2 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || pending}
            onClick={() => setParam("page", String(page - 1))}
          >
            {t("السابق", "Previous")}
          </Button>

          <span className="text-xs tabular-nums text-muted-foreground">
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
    </div>
  );
}

/* ── Bits ──────────────────────────────────────────────────────────────── */

function Th({ children }) {
  return <th className="whitespace-nowrap px-3 py-2 text-start font-medium">{children}</th>;
}

/**
 * `accent` is for Unread: an outlined tab in the brand colour rather than a
 * grey one, so the count reads as something to deal with instead of as one more
 * filter. It still goes solid when selected, like every other tab — the accent
 * says what it is, the fill says where you are, and collapsing those two into
 * one style makes the selected tab ambiguous.
 */
function Tab({ active, onClick, label, count, accent = false, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      // A plain title attribute, not a tooltip component. It is a sentence of
      // help on a control that is already understandable — worth having on
      // hover, not worth a portal, a delay and a focus trap.
      title={hint}
      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-brand-primary text-white"
          : accent
            ? "border border-brand-primary/40 text-brand-primary hover:bg-brand-primary/5"
            : "border border-gray-200 text-gray-600 hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-400"
      }`}
    >
      {label}
      {count ? <span className={active ? "ms-1.5 opacity-80" : "ms-1.5 text-muted-foreground"}>{count}</span> : null}
    </button>
  );
}

/** Relative for the recent past, a date once "3 weeks ago" stops helping. */
function when(iso, locale) {
  if (!iso) return "—";
  const then = new Date(iso);
  const mins = Math.round((Date.now() - then.getTime()) / 60000);

  if (mins < 1) return locale === "ar" ? "الآن" : "just now";
  if (mins < 60) return locale === "ar" ? `قبل ${mins} د` : `${mins}m ago`;

  const hours = Math.round(mins / 60);
  if (hours < 24) return locale === "ar" ? `قبل ${hours} س` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 14) return locale === "ar" ? `قبل ${days} ي` : `${days}d ago`;

  return then.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-GB", {
    day: "numeric", month: "short",
  });
}
