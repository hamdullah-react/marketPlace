"use client";

/**
 * Catalog manager — one table and one editor for every reference list.
 *
 * Brands, models, trims, years, colours, options and spec definitions all share
 * a shape, so they share a component. Adding a list means adding an entry to
 * the entity registry, not writing a seventh page.
 *
 * Editing shared reference data is not the same as editing your own listing: a
 * rename here changes what every seller sees. That is why delete is guarded by
 * a reference count and deactivate is offered as the softer path.
 */

import { useState, useEffect, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Plus, Pencil, Trash2, Search, X, Loader2, Check, EyeOff, Eye,
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useOnChange } from "@/hooks/use-on-change";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ENTITIES, nameFieldOf, iconFieldOf, sequenceFieldOf } from "@/marketplace/lib/catalog-entities";
import { localized } from "@/marketplace/lib/listing";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";
import {
  saveCatalogEntry, deleteCatalogEntry, toggleCatalogActive, approveCatalogEntry, bulkDeleteCatalog,
  deleteCatalogKind,
} from "../_actions/catalog-crud";
import BilingualField from "./BilingualField";
import { useActionResult } from "./useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import ImagePicker from "./ImagePicker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const INITIAL = { ok: false, error: null };

/**
 * Radix rejects an empty string as a SelectItem value — it reserves "" for
 * "nothing selected" — so the "All …" rows travel under this sentinel and are
 * mapped back to "" when the filter is written to the URL.
 */
const ALL = "__all__";

/** Same reasoning as ALL: "create a new one" needs a non-empty value. */
const NEW_CATEGORY = "__new__";

/** Ditto for the kind picker. */
const NEW_KIND = "__new_kind__";

/**
 * One of the entity registry's `extra` select fields.
 *
 * Module scope, not nested in CatalogManager — a component declared inside
 * another is a new type on every render, so React would remount it and the
 * open dropdown would close on each keystroke elsewhere in the form.
 *
 * Uncontrolled unless the caller passes `value`, which keeps display_type
 * (whose change reveals the options editor) reactive without forcing every
 * other extra field into parent state.
 */
function ExtraSelect({ name, options, value, defaultValue, onValueChange }) {
  const [own, setOwn] = useState(defaultValue ?? options[0]);
  const current = value ?? own;

  return (
    <>
      <input type="hidden" name={name} value={current} />
      <Select
        value={current}
        onValueChange={(v) => { setOwn(v); onValueChange?.(v); }}
      >
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );
}


export default function CatalogManager({
  locale = "ar",
  entity: entityKey,
  items = [],
  total = 0,
  page = 1,
  pageSize = 8,
  pageCount = 1,
  parents = [],
  kinds = [],
  categories = [],
  vendorId = null,
  assets = [],
  fieldMode = "ar",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const entity = ENTITIES[entityKey];
  const nameField = nameFieldOf(entityKey);
  const iconField = iconFieldOf(entityKey);
  const seqField = sequenceFieldOf(entityKey);

  const [editing, setEditingRaw] = useState(null); // null | {} for new | row for edit
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [selected, setSelected] = useState(() => new Set());
  const [confirmBulk, setConfirmBulk] = useState(false);

  // Spec editor only: which half of the form is showing.
  const [modalTab, setModalTab] = useState("attribute");

  // Spec category: which existing one is chosen, or whether a new one is being
  // typed. Both reset on every open — see setEditing below.
  const [categoryKey, setCategoryKey] = useState("");
  const [newCategory, setNewCategory] = useState(false);
  const picked = categories.find((c) => c.key === categoryKey) ?? null;

  // Parent (brand for a model, model for a trim). State because Radix Select
  // is controlled and the value reaches the action via a hidden input.
  const [editorParent, setEditorParent] = useState("");

  /**
   * The option kind. Like the spec category, `kind` is a denormalised text
   * column with no table of its own, so the same three moves apply: pick an
   * existing one, rename it (which rewrites every option carrying it), or
   * create a new one. It used to be a free-text box with a datalist, which is
   * how "fuel", "Fuel" and "feul" all became separate kinds.
   */
  const [kindValue, setKindValue] = useState("");
  const [newKind, setNewKind] = useState(false);
  const [confirmKind, setConfirmKind] = useState(null);

  /**
   * `kinds` now carries a bilingual name alongside the slug, so the picker can
   * show "Body type" instead of `body_type`. The SLUG stays the stored value —
   * it is what car_attributes.kind holds and what the listing form looks up.
   * Tolerates a plain string list too, in case a caller has not been updated.
   */
  const kindSlugs = kinds.map((k) => (typeof k === "string" ? k : k.kind));
  const kindLabel = (slug) => {
    const row = kinds.find((k) => (typeof k === "string" ? k : k.kind) === slug);
    return (typeof row === "string" ? null : localized(row?.name, locale)) || slug;
  };

  // Spec option list. `display_type` is tracked in state rather than read off
  // the select on submit, because the options editor has to appear the moment
  // the type is switched to a choice type.
  const [specType, setSpecType] = useState("text");
  const [options, setOptions] = useState([]);
  const CHOICE_TYPES = ["select", "multi"];
  const needsOptions = entityKey === "specs" && CHOICE_TYPES.includes(specType);

  const save = useActionResult(saveCatalogEntry, INITIAL, {
    onSuccess: () => { setEditingRaw(null); router.refresh(); },
  });

  // Every open/close clears the last result. A save error from the previous row
  // was still sitting in the modal when the next one opened, which reads as
  // "this row is broken too".
  const setEditing = (next) => {
    save.dismiss();
    setModalTab("attribute");

    // Seed the category picker from the row being edited. A new spec starts on
    // the first existing category, because that is nearly always the intent —
    // and only falls back to "create one" when there are none yet.
    const rowKey = next?.category_name?.en || next?.category_name?.ar || "";
    const known = categories.some((c) => c.key === rowKey);
    setCategoryKey(known ? rowKey : categories[0]?.key ?? "");
    setNewCategory(categories.length === 0 || (!!rowKey && !known));

    setEditorParent(entity.parent ? (next?.[entity.parent.key] ?? "") : "");

    const rowKind = next?.kind ?? "";
    const knownKind = kindSlugs.includes(rowKind);
    setKindValue(knownKind ? rowKind : kindSlugs[0] ?? "");
    setNewKind(kindSlugs.length === 0 || (!!rowKind && !knownKind));
    setSpecType(next?.display_type ?? "text");
    setOptions(
      (next?.options ?? []).map((o) => ({ id: o.id, ar: o.name?.ar ?? "", en: o.name?.en ?? "" }))
    );

    setEditingRaw(next);
  };
  const del = useActionResult(deleteCatalogEntry, INITIAL, {
    onSuccess: () => { setConfirmDelete(null); router.refresh(); },
  });
  const act = useActionResult(toggleCatalogActive, INITIAL, { onSuccess: () => router.refresh() });
  const app = useActionResult(approveCatalogEntry, INITIAL, { onSuccess: () => router.refresh() });
  const killKind = useActionResult(deleteCatalogKind, INITIAL, {
    onSuccess: () => { setConfirmKind(null); router.refresh(); },
  });
  const bulk = useActionResult(bulkDeleteCatalog, INITIAL, {
    onSuccess: () => { setSelected(new Set()); setConfirmBulk(false); router.refresh(); },
  });

  /**
   * Rows differ per tab and per filter, so a selection carried across them
   * would point at ids no longer on screen.
   *
   * Keyed on the ids themselves rather than on `items`, which is a new array on
   * every render — so the old effect cleared the selection on EVERY render, and
   * ticking a few rows then letting anything else re-render (the search
   * debounce, a router transition) emptied the set while the boxes still looked
   * ticked. A page is at most pageSize rows, so joining the ids is cheap and it
   * is exact: same rows, same key, selection kept.
   */
  const rowsKey = `${entityKey}|${items.map((r) => r.id).join(",")}`;
  useOnChange(rowsKey, () => setSelected(new Set()));

  const allChecked = items.length > 0 && selected.size === items.length;
  const toggleRow = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(items.map((r) => r.id)));

  // Errors are codes; the wording is chosen here, in one language only.
  const msg = (r) => (r?.error ? errorText(r.error, locale, r.params) : null);

  const setParam = (key, value, opts = {}) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);

    // Filtering from page 7 down to 12 results would otherwise show an empty
    // table. Only paging itself keeps the page number.
    if (key !== "page") params.delete("page");

    const url = `${pathname}?${params.toString()}`;
    if (opts.replace) router.replace(url, { scroll: false });
    else router.push(url);
  };

  // Debounced search — typing filters on its own, no Enter needed. `replace`
  // keeps the back button useful: one entry for the search, not one per letter.
  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (query === current) return;

    const id = setTimeout(() => setParam("q", query.trim(), { replace: true }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Someone else changed the URL (tab switch, back button) — resync the box,
  // during render so it never shows the previous tab's term for a frame.
  useOnChange(entityKey, () => setQuery(searchParams.get("q") ?? ""));

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Window of page numbers around the current one; 53 pages of trims will not
  // fit on a toolbar.
  const pageWindow = (() => {
    const span = 2;
    const out = [];
    for (let p = Math.max(1, page - span); p <= Math.min(pageCount, page + span); p++) out.push(p);
    if (out[0] > 1) out.unshift(1, out[0] > 2 ? "…" : 2);
    if (out[out.length - 1] < pageCount) {
      out.push(out[out.length - 1] < pageCount - 1 ? "…" : pageCount - 1, pageCount);
    }
    return [...new Set(out)];
  })();

  const parentName = useMemo(() => {
    const map = new Map(parents.map((p) => [p.id, localized(p.name, locale) || p.slug]));
    return (id) => map.get(id) ?? "—";
  }, [parents, locale]);

  const displayName = (row) =>
    entity.numericOnly ? String(row.value) : localized(row[nameField], locale) || row.slug || "—";

  /**
   * True when the row will not actually read in the language on screen.
   *
   * Two ways that happens, and both need flagging because both look identical
   * to a user — Arabic text in an English table:
   *
   *   1. the field is empty, so localized() falls back to the other language;
   *   2. the field is filled with the WRONG script. A quarter of the synced
   *      brands have their Arabic name copied into `name.en`, so nothing is
   *      missing and nothing falls back — the English name simply is Arabic.
   *      Only a script check catches that one.
   *
   * Reads the raw jsonb, since localized() is what performs the fallback.
   */
  const needsTranslation = (row, loc) => {
    if (entity.numericOnly) return false;
    const value = row[nameField];
    if (!value || typeof value !== "object") return false;

    const want = loc === "en" ? "en" : "ar";
    const legacy = want === "en" ? "en_US" : "ar_001";
    const text = String(value[want] ?? value[legacy] ?? "").trim();

    if (!text) return true;
    const hasArabic = /[؀-ۿ]/.test(text);
    return want === "en" ? hasArabic : !hasArabic;
  };

  // Form fields inside the modals: full width, comfortable height.
  const field =
    "h-10 w-full rounded-lg border bg-background px-3 text-sm outline-hidden transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";
  const label = "mb-1.5 block text-sm font-medium";

  // Toolbar filters size themselves to their content and must NOT reuse
  // `field`. Appending `w-auto h-9` to a string containing `w-full h-10` does
  // not override anything: Tailwind emits both utilities and the one that
  // comes later in the generated stylesheet wins, whatever order they sit in
  // on the element. The result was a full-width, 40px-tall dropdown.
  const filterSelect =
    "h-9 w-auto rounded-lg border bg-background px-2.5 text-sm outline-hidden transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {/* Add sits first: it is the primary action, and burying it past a
          search box and two filters made it the last thing found. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setEditing({})}
          className="raised-solid flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white"
        >
          <Plus className="h-4 w-4" />
          {t("إضافة", "Add")}
        </button>

        {selected.size > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmBulk(true)}
            className="flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/40"
          >
            <Trash2 className="h-4 w-4" />
            {t(`حذف ${selected.size}`, `Delete ${selected.size}`)}
          </button>
        ) : null}

        {/* Fixed width — a flex-1 search box swallowed the whole toolbar. */}
        <div className="flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border px-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("ابحث…", "Search…")}
            className="w-full bg-transparent text-sm outline-hidden"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} aria-label={t("مسح", "Clear")}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ) : null}
        </div>

        {entity.parent ? (
          <Select
            value={searchParams.get("parent") || ALL}
            onValueChange={(v) => setParam("parent", v === ALL ? "" : v)}
          >
            <SelectTrigger className="h-9 w-auto min-w-[140px] max-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {t(`كل ${entity.parent.ar}`, `All ${entity.parent.en.toLowerCase()}s`)}
              </SelectItem>
              {parents.map((p) => (
                <SelectItem key={p.id} value={p.id}>{localized(p.name, locale) || p.slug}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {entity.categorized ? (
          <Select
            value={searchParams.get("category") || ALL}
            onValueChange={(v) => setParam("category", v === ALL ? "" : v)}
          >
            <SelectTrigger className="h-9 w-auto min-w-[150px] max-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("كل المجموعات", "All categories")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.key} value={c.key}>{localized(c.name, locale) || c.key}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {entity.kinded ? (
          <Select
            value={searchParams.get("kind") || ALL}
            onValueChange={(v) => setParam("kind", v === ALL ? "" : v)}
          >
            <SelectTrigger className="h-9 w-auto min-w-[120px] max-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("كل الأنواع", "All kinds")}</SelectItem>
              {kindSlugs.map((k) => (
                <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        {/* Deleting a kind only makes sense once one is chosen — a kind is not
            a row, so "delete it" means "delete every option under it", and
            that needs to be aimed at something specific. */}
        {entity.kinded && searchParams.get("kind") ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmKind(searchParams.get("kind"))}
            className="h-9 gap-1.5 text-xs text-red-600 hover:border-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("حذف النوع", "Delete kind")}
          </Button>
        ) : null}

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

      {/* Amber, not red: a partial bulk delete is a warning, not a failure —
          rows were removed, some were held back. */}
      {msg(bulk.result) ? (
        <p
          className={`mb-3 rounded-lg border p-3 text-xs ${
            bulk.result.ok
              ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
          }`}
        >
          {msg(bulk.result)}
        </p>
      ) : null}

      {(msg(del.result) || msg(act.result) || msg(app.result)) ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {msg(del.result) || msg(act.result) || msg(app.result)}
        </p>
      ) : null}

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              {t("لا توجد عناصر.", "Nothing here.")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input type="checkbox" checked={allChecked} onChange={toggleAll}
                        aria-label={t("تحديد الكل", "Select all")}
                        className="h-4 w-4 accent-[var(--brand-primary)]" />
                    </TableHead>
                    <TableHead className="text-start">{t("الاسم", "Name")}</TableHead>
                    {entity.parent ? (
                      <TableHead className="text-start">{t(entity.parent.ar, entity.parent.en)}</TableHead>
                    ) : null}
                    {entity.kinded ? <TableHead className="text-start">{t("النوع", "Kind")}</TableHead> : null}
                    {entity.categorized ? (
                      <TableHead className="text-start">{t("المجموعة", "Category")}</TableHead>
                    ) : null}
                    <TableHead className="text-start">{t("المعرّف", "Slug")}</TableHead>
                    <TableHead className="text-start">{t("الترتيب", "Order")}</TableHead>
                    <TableHead className="text-start">{t("الحالة", "Status")}</TableHead>
                    <TableHead className="text-end">{t("إجراءات", "Actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id} data-selected={selected.has(row.id) || undefined}
                      className={selected.has(row.id) ? "bg-brand-primary/5" : undefined}>
                      <TableCell>
                        <input type="checkbox" checked={selected.has(row.id)}
                          onChange={() => toggleRow(row.id)}
                          aria-label={displayName(row)}
                          className="h-4 w-4 accent-[var(--brand-primary)]" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          {row[iconField] || row.logo_url ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={thumbUrl(row[iconField] || row.logo_url, THUMB.icon)} alt=""
                              className="h-7 w-7 shrink-0 rounded object-contain" />
                          ) : row.hex ? (
                            <span className="h-7 w-7 shrink-0 rounded border" style={{ backgroundColor: row.hex }} />
                          ) : null}
                          <div className="min-w-0">
                            <p className="truncate font-medium text-brand-primary">{displayName(row)}</p>
                            {/* This line used to print the row's OTHER language, which
                                filled an English catalog with Arabic subtitles.
                                What is worth surfacing is the gap, not the translation.

                                Read the raw jsonb, not localized() — localized() falls
                                back to the other language precisely so the row stays
                                identifiable, which means it can never report a miss. */}
                            {needsTranslation(row, locale) ? (
                              <p className="truncate text-xs text-amber-600 dark:text-amber-500">
                                {t("يحتاج اسماً عربياً", "Needs an English name")}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>

                      {entity.parent ? (
                        <TableCell className="text-sm text-muted-foreground">
                          {parentName(row[entity.parent.key])}
                        </TableCell>
                      ) : null}

                      {entity.kinded ? (
                        <TableCell><Badge variant="secondary">{row.kind}</Badge></TableCell>
                      ) : null}

                      {entity.categorized ? (
                        <TableCell className="text-sm text-muted-foreground">
                          {localized(row.category_name, locale) || "—"}
                        </TableCell>
                      ) : null}
                      <TableCell className="font-mono text-xs text-muted-foreground">{row.slug ?? "—"}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">{row[seqField] ?? 0}</TableCell>

                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {entity.hasActive ? (
                            <Badge variant={row.active ? "default" : "outline"}>
                              {row.active ? t("مفعّل", "Active") : t("معطّل", "Off")}
                            </Badge>
                          ) : null}
                          {row.is_custom ? (
                            <Badge variant="secondary" className="gap-1">
                              {row.approved === false ? <AlertTriangle className="h-3 w-3" /> : null}
                              {row.approved === false ? t("بانتظار المراجعة", "Unreviewed") : t("مضاف", "Custom")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          {row.is_custom && row.approved === false ? (
                            <form action={app.formAction}>
                              <input type="hidden" name="entity" value={entityKey} />
                              <input type="hidden" name="id" value={row.id} />
                              <button type="submit" className="text-xs text-green-600 hover:underline">
                                {t("اعتماد", "Approve")}
                              </button>
                            </form>
                          ) : null}

                          {entity.hasActive ? (
                            <form action={act.formAction}>
                              <input type="hidden" name="entity" value={entityKey} />
                              <input type="hidden" name="id" value={row.id} />
                              <input type="hidden" name="active" value={String(!row.active)} />
                              <button type="submit" title={row.active ? t("تعطيل", "Deactivate") : t("تفعيل", "Activate")}
                                className="text-muted-foreground hover:text-brand-primary">
                                {row.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                              </button>
                            </form>
                          ) : null}

                          <button type="button" onClick={() => setEditing(row)}
                            title={t("تعديل", "Edit")} className="text-muted-foreground hover:text-brand-primary">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button type="button" onClick={() => setConfirmDelete(row)}
                            title={t("حذف", "Delete")} className="text-muted-foreground hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pager ────────────────────────────────────────────────────────── */}
      {pageCount > 1 ? (
        <nav className="mt-4 flex flex-wrap items-center justify-center gap-1.5 border-t pt-4">
          <span className="me-auto hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground sm:block">
            {t(`صفحة ${page} من ${pageCount}`, `Page ${page} of ${pageCount}`)}
          </span>
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setParam("page", String(page - 1))}
            className="flex h-9 items-center gap-1 rounded-lg border px-3 text-sm transition-colors hover:border-brand-primary disabled:opacity-40"
          >
            {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            <span className="hidden sm:inline">{t("السابق", "Previous")}</span>
          </button>

          {pageWindow.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-sm text-muted-foreground">…</span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => setParam("page", String(p))}
                aria-current={p === page ? "page" : undefined}
                className={`h-9 min-w-9 rounded-lg border px-2 text-sm tabular-nums transition-colors ${
                  p === page
                    ? "border-brand-primary bg-brand-primary text-white"
                    : "hover:border-brand-primary"
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            type="button"
            disabled={page >= pageCount}
            onClick={() => setParam("page", String(page + 1))}
            className="flex h-9 items-center gap-1 rounded-lg border px-3 text-sm transition-colors hover:border-brand-primary disabled:opacity-40"
          >
            <span className="hidden sm:inline">{t("التالي", "Next")}</span>
            {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          {/* Mirrors the page counter so the number buttons stay visually
              centred rather than shunted to one side. */}
          <span className="ms-auto hidden w-[1px] sm:block" aria-hidden="true" />
        </nav>
      ) : null}

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      {/* Controlled Dialog — `editing` holds the row being edited, so it
          doubles as the open flag. onOpenChange routes through setEditing,
          which also clears the previous save error, so Escape and the overlay
          behave exactly like Cancel rather than leaving stale state behind. */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        {editing ? (
          <DialogContent
            dir={isAr ? "rtl" : "ltr"}
            className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
          >
            <DialogHeader>
              <DialogTitle className="text-brand-primary">
                {editing.id ? t("تعديل", "Edit") : t("إضافة", "Add")} · {t(entity.ar, entity.en)}
              </DialogTitle>
            </DialogHeader>

            {/* key forces a full remount per row.
                ImagePicker and BilingualField seed useState from their props
                ONCE. Without a key, editing row B reuses row A's component
                instances — so the modal showed A's image and A's text while
                editing B, and saving wrote A's values back. */}
            <form
              key={editing.id ?? "new"}
              action={save.formAction}
              className="space-y-4"
            >
              <input type="hidden" name="entity" value={entityKey} />
              {editing.id ? <input type="hidden" name="id" value={editing.id} /> : null}

              {/* A spec is two things at once: the attribute itself, and the
                  category it groups under. Stacked in one column they read as
                  one long list of near-identical name/icon/order fields, and it
                  is genuinely unclear which icon belongs to which. */}
              {entity.categorized ? (
                <div className="flex gap-1 border-b" role="tablist">
                  {[
                    { id: "attribute", ar: "المواصفة", en: "Attribute" },
                    { id: "category", ar: "المجموعة", en: "Category" },
                  ].map((tb) => (
                    <button
                      key={tb.id}
                      type="button"
                      role="tab"
                      aria-selected={modalTab === tb.id}
                      onClick={() => setModalTab(tb.id)}
                      className={`border-b-2 px-3 py-2 text-sm transition-colors ${
                        modalTab === tb.id
                          ? "border-brand-primary text-brand-primary"
                          : "border-transparent text-muted-foreground hover:text-brand-primary"
                      }`}
                    >
                      {t(tb.ar, tb.en)}
                    </button>
                  ))}
                </div>
              ) : null}

              {entity.parent ? (
                <div>
                  <label className={label}>{t(entity.parent.ar, entity.parent.en)} *</label>
                  {/* Hidden input because Radix Select is not a native
                      control and the form action reads FormData. */}
                  <input type="hidden" name="parentId" value={editorParent} />
                  <Select value={editorParent || undefined} onValueChange={setEditorParent}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder={t("اختر", "Select")} />
                    </SelectTrigger>
                    <SelectContent>
                      {parents.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{localized(p.name, locale) || p.slug}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {entity.kinded ? (
                <div className="space-y-3">
                  <div>
                    <label className={label} htmlFor="kindPick">{t("النوع", "Kind")} *</label>
                    <Select
                      value={newKind ? NEW_KIND : (kindValue || NEW_KIND)}
                      onValueChange={(v) => {
                        setNewKind(v === NEW_KIND);
                        if (v !== NEW_KIND) setKindValue(v);
                      }}
                    >
                      <SelectTrigger id="kindPick" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {kindSlugs.map((k) => (
                          <SelectItem key={k} value={k}>{kindLabel(k)}</SelectItem>
                        ))}
                        <SelectItem value={NEW_KIND}>{t("＋ نوع جديد…", "＋ New kind…")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Renaming an existing kind rewrites it on every option that
                      carries it, so the original travels along for matching. */}
                  {!newKind && kindValue ? (
                    <input type="hidden" name="kindOriginal" value={kindValue} />
                  ) : null}

                  <div>
                    <label className={label} htmlFor="kind">
                      {newKind ? t("اسم النوع الجديد", "New kind name") : t("إعادة تسمية", "Rename")}
                    </label>
                    <input
                      id="kind" name="kind" required dir="ltr"
                      key={newKind ? "new" : kindValue}
                      defaultValue={newKind ? "" : kindValue}
                      placeholder="fuel / transmission / condition"
                      className={`${field} font-mono text-xs`}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {newKind
                        ? t(
                            "حروف إنجليزية صغيرة بلا مسافات — مثل body_type.",
                            "Lower-case, no spaces — e.g. body_type."
                          )
                        : t(
                            "تغيير الاسم هنا يغيّره لكل الخيارات تحت هذا النوع.",
                            "Renaming here changes it for every option under this kind."
                          )}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Panels stay MOUNTED and hide with `hidden`. Unmounting the
                  inactive tab drops its inputs from the DOM, and a native form
                  action only submits what is actually there — switching tabs
                  would silently wipe the other half. */}
              <div hidden={entity.categorized && modalTab !== "attribute"} role="tabpanel" className="space-y-4">
              {entity.numericOnly ? (
                <div>
                  <label className={label}>{t("السنة", "Year")} *</label>
                  <input name="value" type="number" required min="1950" max="2100"
                    defaultValue={editing.value ?? ""} className={field} />
                </div>
              ) : (
                <>
                  <BilingualField id="name" label={t("الاسم", "Name")} required
                    ar={editing[nameField]?.ar} en={editing[nameField]?.en}
                    mode={fieldMode} locale={locale} />

                  {entity.hasDescription ? (
                    <BilingualField id="description" label={t("الوصف", "Description")} textarea rows={3}
                      ar={editing.description?.ar} en={editing.description?.en}
                      mode={fieldMode} locale={locale} />
                  ) : null}
                </>
              )}


              {/* flex, not grid. A grid stretches each cell to the column width,
                  so three ~80px thumbnails ended up marooned with huge gaps
                  between them. flex-wrap keeps them shoulder to shoulder. */}
              {(entity.hasIcon || entity.iconField || entity.hasImage || entity.hasLogo) ? (
                <div className="flex flex-wrap gap-4 rounded-lg border p-3">
                  {entity.hasLogo ? (
                    <ImagePicker locale={locale} name="logoUrl" vendorId={vendorId} assets={assets}
                      value={editing.logo_url} kind="logo" size="md" label={t("الشعار", "Logo")} />
                  ) : null}
                  {entity.hasIcon || entity.iconField ? (
                    <ImagePicker locale={locale} name="iconUrl" vendorId={vendorId} assets={assets}
                      value={editing[iconField]} kind="icon" size="md" label={t("الأيقونة", "Icon")} />
                  ) : null}
                  {entity.hasImage ? (
                    <ImagePicker locale={locale} name="imageUrl" vendorId={vendorId} assets={assets}
                      value={editing.image_url} size="wide" label={t("الصورة", "Image")} />
                  ) : null}
                </div>
              ) : null}

              {/* `value` is already drawn by the numericOnly branch above, and
                  it only lives in `extra` so the column is selected and
                  searchable. Without this filter the Years dialog asked for the
                  year twice — one required box and one empty one below it,
                  both named `value`. */}
              {(entity.extra ?? [])
                .filter((x) => !(entity.numericOnly && x.key === "value"))
                .map((x) => (
                <div key={x.key}>
                  {x.type === "i18n" ? (
                    /* Bilingual like every other translatable field, so a unit
                       can be "L" in English and "لتر" in Arabic. Submits
                       <key>Ar / <key>En, which buildRow recombines. */
                    <BilingualField
                      id={x.key}
                      label={t(x.ar, x.en)}
                      ar={localized(editing[x.key], "ar")}
                      en={localized(editing[x.key], "en")}
                      mode={fieldMode}
                      locale={locale}
                    />
                  ) : x.type === "boolean" ? (
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm">
                      <input type="checkbox" name={x.key} defaultChecked={!!editing[x.key]}
                        className="h-4 w-4 accent-[var(--brand-primary)]" />
                      {t(x.ar, x.en)}
                    </label>
                  ) : x.type === "select" ? (
                    <>
                      <label className={label}>{t(x.ar, x.en)}</label>
                      {/* display_type is controlled so the options editor can
                          appear as soon as it is switched to select/multi. */}
                      {/* display_type is controlled so the options editor can
                          appear the moment it becomes a choice type; the rest
                          keep their own local state. Either way the value
                          reaches the action through the hidden input, since
                          Radix Select is not a native form control. */}
                      <ExtraSelect
                        name={x.key}
                        options={x.options}
                        value={x.key === "display_type" ? specType : undefined}
                        defaultValue={editing[x.key] ?? x.options[0]}
                        onValueChange={x.key === "display_type" ? setSpecType : undefined}
                      />
                    </>
                  ) : x.type === "color" ? (
                    <>
                      <label className={label}>{t(x.ar, x.en)}</label>
                      <div className="flex gap-2">
                        <input type="color" name={x.key} defaultValue={editing[x.key] || "#0B6B3A"}
                          className="h-10 w-14 rounded-lg border bg-background" />
                        <input defaultValue={editing[x.key] ?? ""} readOnly
                          className={`${field} font-mono text-xs`} placeholder="#0B6B3A" />
                      </div>
                    </>
                  ) : (
                    <>
                      <label className={label}>{t(x.ar, x.en)}</label>
                      <input name={x.key} type={x.type === "number" ? "number" : "text"}
                        required={x.required} defaultValue={editing[x.key] ?? ""} className={field} />
                    </>
                  )}
                </div>
              ))}

              {/* ── Option list ──────────────────────────────────────────────
                  Only a choice type has options. Without this editor a spec
                  could be SET to "select" in the catalog and then had nowhere
                  to define what could be selected, so the listing form showed
                  a text box and the field type looked broken. */}
              {needsOptions ? (
                <div className="rounded-lg border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t("الخيارات", "Options")}</p>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "ما يمكن للبائع اختياره في هذا الحقل.",
                          "What a seller can choose for this field."
                        )}
                      </p>
                    </div>
                    <button type="button"
                      onClick={() => setOptions((prev) => [...prev, { ar: "", en: "" }])}
                      className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors hover:border-brand-primary">
                      <Plus className="h-3.5 w-3.5" />
                      {t("إضافة خيار", "Add option")}
                    </button>
                  </div>

                  {options.length === 0 ? (
                    <p className="rounded-lg border border-dashed py-4 text-center text-xs text-muted-foreground">
                      {t("لا خيارات بعد — أضف واحداً.", "No options yet — add one.")}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {options.map((opt, i) => (
                        <div key={opt.id ?? `new-${i}`} className="flex items-center gap-2">
                          <input
                            dir="rtl"
                            value={opt.ar}
                            onChange={(e) =>
                              setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, ar: e.target.value } : o)))
                            }
                            placeholder={t("بالعربية", "Arabic")}
                            className={`${field} h-9`}
                          />
                          <input
                            dir="ltr"
                            value={opt.en}
                            onChange={(e) =>
                              setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, en: e.target.value } : o)))
                            }
                            placeholder={t("بالإنجليزية", "English")}
                            className={`${field} h-9`}
                          />
                          <button type="button"
                            onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                            aria-label={t("حذف", "Remove")}
                            className="shrink-0 rounded-lg border p-2 text-red-600 transition-colors hover:border-red-300">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* One JSON field rather than 2N inputs; the action replaces
                      the list wholesale and keeps ids so listings still resolve. */}
                  <input type="hidden" name="options" value={JSON.stringify(options)} />
                </div>
              ) : null}

              {(entity.hasSequence || entity.sequenceField) ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className={label}>{t("الترتيب", "Sort order")}</label>
                    <input name="sequence" type="number" defaultValue={editing[seqField] ?? 0} className={field} />
                  </div>
                  {entity.hasActive ? (
                    <label className="flex cursor-pointer items-end gap-2.5 pb-2 text-sm">
                      <input type="checkbox" name="active" defaultChecked={editing.id ? !!editing.active : true}
                        className="h-4 w-4 accent-[var(--brand-primary)]" />
                      {t("مفعّل", "Active")}
                    </label>
                  ) : null}
                </div>
              ) : null}

              </div>

              {/* ── Category panel ─────────────────────────────────────────── */}
              {entity.categorized ? (
                <div hidden={modalTab !== "category"} role="tabpanel" className="space-y-4">
                  {/* The "a category is shared by every spec with the same
                      name" warning stood here. It was written when the catalog
                      was shared platform-wide and renaming a category really
                      did reach other showrooms' specs. Since schema.sql §30 the
                      rows are yours alone, so it warned about something that
                      can no longer happen — and a standing amber banner above a
                      form teaches people to ignore amber banners. */}

                  {/* Pick an existing category, or create one. Typing the same
                      category name by hand on every spec is how "Engine",
                      "engine " and "Enigne" become three categories. */}
                  <div>
                    <label className={label} htmlFor="categoryPick">
                      {t("المجموعة", "Category")}
                    </label>
                    <Select
                      value={newCategory ? NEW_CATEGORY : (categoryKey || NEW_CATEGORY)}
                      onValueChange={(v) => {
                        setNewCategory(v === NEW_CATEGORY);
                        if (v !== NEW_CATEGORY) setCategoryKey(v);
                      }}
                    >
                      <SelectTrigger id="categoryPick" className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {localized(c.name, locale) || c.key}
                          </SelectItem>
                        ))}
                        <SelectItem value={NEW_CATEGORY}>
                          {t("＋ مجموعة جديدة…", "＋ New category…")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* The chosen category is editable in place. Renaming it, or
                      changing its icon or order, rewrites EVERY spec that
                      shares the name — categoryKeyOriginal tells the action
                      which rows those are, since the name it matches on is the
                      very thing being changed. */}
                  {!newCategory && picked ? (
                    <>
                      <input type="hidden" name="categoryKeyOriginal" value={picked.key} />
                      {/* What the category looked like on open, so the action
                          can tell an actual edit from an untouched field and
                          skip rewriting the siblings when nothing changed. */}
                      <input type="hidden" name="categoryIconWas" value={picked.icon ?? ""} />
                      <input type="hidden" name="categorySequenceWas" value={picked.sequence ?? 0} />
                    </>
                  ) : null}

                  {/* key= forces a remount when the picked category changes:
                      BilingualField keeps its values in state, so without it
                      the previous category's name stays in the box. */}
                  <BilingualField
                    key={newCategory ? "new" : picked?.key ?? "none"}
                    id="categoryName"
                    label={t("اسم المجموعة", "Category name")}
                    ar={newCategory ? editing.category_name?.ar : picked?.name?.ar}
                    en={newCategory ? editing.category_name?.en : picked?.name?.en}
                    mode={fieldMode}
                    locale={locale}
                  />

                  <div className="flex flex-wrap items-end gap-4">
                    <ImagePicker
                      key={newCategory ? "new" : picked?.key ?? "none"}
                      locale={locale} name="categoryIconUrl" vendorId={vendorId} assets={assets}
                      value={newCategory ? editing.category_icon_url : picked?.icon}
                      kind="icon" size="md"
                      label={t("أيقونة المجموعة", "Category icon")}
                    />
                    <div className="min-w-[140px] flex-1">
                      <label className={label}>{t("ترتيب المجموعة", "Category order")}</label>
                      <input
                        key={newCategory ? "new" : picked?.key ?? "none"}
                        name="categorySequence" type="number"
                        defaultValue={(newCategory ? editing.category_sequence : picked?.sequence) ?? 0}
                        className={field}
                      />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("يحدد ترتيب ظهورها في صفحة السيارة.", "Sets where it appears on the car page.")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {msg(save.result) ? <p className="text-xs text-red-600">{msg(save.result)}</p> : null}

              <div className="flex justify-end gap-3 border-t pt-4">
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  {t("إلغاء", "Cancel")}
                </Button>
                <Button type="submit" disabled={save.pending}
                  className="gap-2 bg-brand-primary hover:bg-[var(--brand-dark)]">
                  {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {t("حفظ", "Save")}
                </Button>
              </div>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        {confirmDelete ? (
          <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {t("حذف", "Delete")} “{displayName(confirmDelete)}”
              </DialogTitle>
              <DialogDescription>
                {t(
                  "لا يمكن التراجع. إذا كان مستخدماً في إعلانات فسيُرفض الحذف — عطّله بدلاً من ذلك.",
                  "This cannot be undone. If it is used by listings the delete is refused — deactivate it instead."
                )}
              </DialogDescription>
            </DialogHeader>

            {msg(del.result) ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {msg(del.result)}
              </p>
            ) : null}

            <form action={del.formAction} className="mt-4 flex justify-end gap-3">
              <input type="hidden" name="entity" value={entityKey} />
              <input type="hidden" name="id" value={confirmDelete.id} />
              {del.result?.needsCascadeConfirm ? <input type="hidden" name="confirmCascade" value="true" /> : null}
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(null)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={del.pending} className="gap-2">
                {del.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {del.result?.needsCascadeConfirm ? t("حذف مع التوابع", "Delete with dependents") : t("حذف", "Delete")}
              </Button>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>
      {/* ── Bulk delete confirm ──────────────────────────────────────────── */}
      {/* ── Delete a whole kind ─────────────────────────────────────────── */}
      <Dialog open={!!confirmKind} onOpenChange={(o) => { if (!o) setConfirmKind(null); }}>
        {confirmKind ? (
          <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {t("حذف النوع", "Delete kind")} “{confirmKind}”
              </DialogTitle>
              <DialogDescription>
                {t(
                  "النوع ليس صفاً في الجدول — حذفه يعني حذف كل الخيارات تحته. إن كان أيٌّ منها مستخدماً في إعلان فسيُرفض الحذف بالكامل.",
                  "A kind is not a row — deleting it deletes every option under it. If any of them is used by a listing the whole delete is refused."
                )}
              </DialogDescription>
            </DialogHeader>

            {msg(killKind.result) ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {msg(killKind.result)}
              </p>
            ) : null}

            <form action={killKind.formAction} className="mt-2 flex justify-end gap-3">
              <input type="hidden" name="kind" value={confirmKind} />
              <Button type="button" variant="outline" onClick={() => setConfirmKind(null)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={killKind.pending} className="gap-2">
                {killKind.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("حذف", "Delete")}
              </Button>
            </form>
          </DialogContent>
        ) : null}
      </Dialog>

      <Dialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {t(`حذف ${selected.size} عنصراً`, `Delete ${selected.size} item(s)`)}
            </DialogTitle>
            <DialogDescription>
              {t(
                "العناصر المستخدمة في إعلانات لن تُحذف، وسيُبلَّغ عنها.",
                "Anything still used by a listing is kept and reported back."
              )}
            </DialogDescription>
          </DialogHeader>

          <form action={bulk.formAction} className="mt-4 flex justify-end gap-3">
            <input type="hidden" name="entity" value={entityKey} />
            <input type="hidden" name="ids" value={[...selected].join(",")} />
            <Button type="button" variant="outline" onClick={() => setConfirmBulk(false)}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={bulk.pending} className="gap-2">
              {bulk.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("حذف", "Delete")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

    </>
  );
}
