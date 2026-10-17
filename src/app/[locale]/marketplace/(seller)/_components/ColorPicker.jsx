"use client";

/**
 * Colour picker — swatches, not a dropdown.
 *
 * Colour is the one catalog field where the name is the worst way to choose:
 * "Attitude Black" and "Midnight" mean nothing until you see them, and the
 * synced catalog carries 186 of them. A grid of actual colours is scannable in
 * a way a 186-row <select> never is.
 *
 * A seller can also mix a colour that isn't in the catalog, using the native
 * colour input plus a name — an import in a factory-special shade shouldn't
 * force them to pick "Other".
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { Check, Plus, Search, Loader2, X, Palette } from "lucide-react";
import { createCatalogEntry } from "../_apicalls/catalogApi";
import { localized, namePair } from "@/marketplace/lib/listing";

export default function ColorPicker({
  mode = "ar",
  locale = "ar",
  name,
  items = [],
  value = "",
  onChange,
  onCreated,
  vendorId = null,
  /**
   * The model this colour belongs to.
   *
   * A colour belongs to one model the way a trim does, so adding one here
   * attaches it to that model and to no other. See getModelPalette.
   */
  modelId = null,
  // OFF by default, same reasoning as CatalogCombo: colours are shared catalog
  // data, so they are added on the Catalog page rather than invented inside a
  // listing.
  allowCreate = false,
  compact = false,
  /**
   * Closed, with a reason in place of the placeholder.
   *
   * The colour list is scoped to the chosen model, so there is nothing honest
   * to show before one is chosen — and a seller who picks a colour first and
   * the model second would have made their choice against the wrong list.
   */
  disabled = false,
  placeholder = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  /* 'both' mode names each side explicitly instead of guessing from the script
      — the same gap the bilingual dialog in CatalogCombo had. */
  const [newAr, setNewAr] = useState("");
  const [newEn, setNewEn] = useState("");
  const [newHex, setNewHex] = useState("#c0c0c0");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);

  /**
   * A swatch grid cannot carry two lines of text at 10px across six columns,
   * so 'both' mode puts the second language in the tooltip rather than under
   * the swatch. The visible label still follows the store's language.
   */
  /**
   * Which language the LIST is read in — the dashboard's, always.
   *
   * This used to follow the store's field mode, so an Arabic-only store showed
   * Arabic option labels on the English dashboard. Field mode decides which
   * languages a seller WRITES; it has no business deciding which language they
   * READ. A row missing the wanted language still falls back to the other one
   * below rather than rendering blank.
   */
  const primaryLang = isAr ? "ar" : "en";
  const label = (c) => localized(c.name, primaryLang);
  const fullLabel = (c) => {
    const shown = label(c);
    if (mode !== "both") return shown;
    const other = c.name?.[primaryLang === "ar" ? "en" : "ar"];
    return other && other !== shown ? `${shown} — ${other}` : shown;
  };
  const selected = items.find((c) => c.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        String(localized(c.name, "en")).toLowerCase().includes(q) ||
        String(localized(c.name, "ar")).toLowerCase().includes(q)
    );
  }, [items, query]);

  useEffect(() => {
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) {
        setOpen(false);
        setAdding(false);
        setError(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const create = async () => {
    /* In 'both' mode the seller has labelled each box, so namePair is not
       consulted — guessing from the script would overrule what they said.
       With one box it is the only evidence there is. */
    const both = mode === "both";
    const ar = both ? newAr.trim() : namePair(newName.trim()).ar ?? "";
    const en = both ? newEn.trim() : namePair(newName.trim()).en ?? "";
    const text = both ? ar || en : newName.trim();
    if (!text) { setError(t("أدخل اسم اللون", "Enter a colour name")); return; }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/catalog/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "color",
          nameAr: ar,
          nameEn: en,
          hex: newHex,
          vendorId,
          modelId,
        }),
      });
      const json = await res.json();

      if (json?.ok && json.data?.item) {
        onCreated?.({ hex: newHex, ...json.data.item });
        onChange?.(json.data.item.id);
        setOpen(false);
        setAdding(false);
        setNewName("");
        setNewAr("");
        setNewEn("");
      } else {
        setError(json?.error?.message ?? t("تعذّرت الإضافة", "Could not add"));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  /** A hexless catalog colour still needs to render as something. */
  const swatchStyle = (c) =>
    c.hex ? { backgroundColor: c.hex } : { backgroundImage: "linear-gradient(135deg,#e5e5e5 25%,#f5f5f5 25%,#f5f5f5 50%,#e5e5e5 50%,#e5e5e5 75%,#f5f5f5 75%)", backgroundSize: "8px 8px" };

  return (
    <div className="relative" ref={boxRef}>
      <input type="hidden" name={name} value={value ?? ""} />

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className={`flex w-full items-center gap-2.5 rounded-lg border border-gray-300 bg-white px-3 text-start text-sm outline-hidden transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 disabled:bg-gray-50 disabled:text-gray-400 dark:border-gray-600 dark:bg-[#1a1a1a] dark:disabled:bg-[#141414] ${compact ? "h-9" : "h-11"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {selected ? (
          <>
            <span className="h-5 w-5 shrink-0 rounded-full border border-black/10" style={swatchStyle(selected)} />
            <span className="truncate">{label(selected)}</span>
          </>
        ) : (
          <>
            <Palette className="h-4 w-4 shrink-0 text-gray-400" />
            <span className="text-gray-400">{placeholder || t("اختر اللون", "Pick a colour")}</span>
          </>
        )}
      </button>

      {open && !disabled ? (
        <div className="absolute z-50 mt-1 w-[min(30rem,90vw)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-[#1a1a1a]">
          {/* ── Search ─────────────────────────────────────────────────── */}
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 dark:border-gray-700">
            <Search className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("ابحث عن لون…", "Search colours…")}
              className="w-full bg-transparent text-sm outline-hidden"
            />
            {value ? (
              <button
                type="button"
                onClick={() => { onChange?.(""); setOpen(false); }}
                className="shrink-0 text-xs text-gray-500 hover:text-brand-primary"
              >
                {t("مسح", "Clear")}
              </button>
            ) : null}
          </div>

          {/* ── Swatch grid ────────────────────────────────────────────── */}
          <div className="max-h-64 overflow-y-auto p-3">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">{t("لا توجد نتائج", "No matches")}</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { onChange?.(c.id); setOpen(false); }}
                    title={fullLabel(c)}
                    className="group flex flex-col items-center gap-1"
                  >
                    <span
                      className={`relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform group-hover:scale-110 ${
                        c.id === value ? "border-brand-primary" : "border-black/10 dark:border-white/15"
                      }`}
                      style={swatchStyle(c)}
                    >
                      {c.id === value ? (
                        <Check className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" />
                      ) : null}
                    </span>
                    <span className="line-clamp-1 w-full text-center text-[10px] text-gray-600 dark:text-gray-400">
                      {label(c)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Mix your own ───────────────────────────────────────────── */}
          {allowCreate ? (
            <div className="border-t border-gray-100 dark:border-gray-700">
              {adding ? (
                <div className="space-y-2 p-3">
                  {/* Wraps, because the bilingual version puts two name boxes
                      in this row and a phone has no space for both beside the
                      swatch and the buttons. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="color"
                      value={newHex}
                      onChange={(e) => setNewHex(e.target.value)}
                      className="h-9 w-12 shrink-0 cursor-pointer rounded border border-gray-300 bg-transparent dark:border-gray-600"
                      aria-label={t("اختر اللون", "Choose colour")}
                    />
                    {/* One box, or one per language when the store authors in
                        both — so a colour can be named properly on each side
                        rather than landing with the same string twice. */}
                    {mode === "both" ? (
                      <div className="grid w-full gap-2 sm:grid-cols-2">
                        <input
                          value={newAr}
                          onChange={(e) => { setNewAr(e.target.value); setError(null); }}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
                          placeholder={t("الاسم بالعربية", "Arabic name")}
                          dir="rtl"
                          className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-hidden focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]"
                        />
                        <input
                          value={newEn}
                          onChange={(e) => { setNewEn(e.target.value); setError(null); }}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
                          placeholder={t("الاسم بالإنجليزية", "English name")}
                          dir="ltr"
                          className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-hidden focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]"
                        />
                      </div>
                    ) : (
                      <input
                        value={newName}
                        onChange={(e) => { setNewName(e.target.value); setError(null); }}
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
                        placeholder={t("اسم اللون", "Colour name")}
                        className="h-9 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm outline-hidden focus:border-brand-primary dark:border-gray-600 dark:bg-[#141414]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={create}
                      disabled={creating}
                      className="raised-solid flex h-9 shrink-0 items-center gap-1 rounded-lg bg-brand-primary px-3 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {t("إضافة", "Add")}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdding(false); setError(null); }}
                      className="shrink-0"
                      aria-label={t("إلغاء", "Cancel")}
                    >
                      <X className="h-4 w-4 text-gray-400" />
                    </button>
                  </div>
                  {error ? <p className="text-xs text-red-600">{error}</p> : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-medium text-brand-primary transition-colors hover:bg-brand-primary/5"
                >
                  <Plus className="h-4 w-4" />
                  {t("لون غير موجود؟ أضفه", "Colour not listed? Add it")}
                </button>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
