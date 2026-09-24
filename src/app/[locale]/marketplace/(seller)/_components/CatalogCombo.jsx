"use client";

/**
 * Searchable catalog picker that can also create.
 *
 * Replaces a plain <select> for brand / model / trim / year / colour. Type to
 * filter; if nothing matches, offer to add it.
 *
 * The search-before-create order is deliberate and load-bearing: a seller who
 * cannot find "Toyota" and types it fresh would otherwise create a second
 * Toyota, and every filter that groups by brand quietly splits in two. Matching
 * is case-insensitive here, and the create API repeats the check server-side in
 * case this UI is ever bypassed. It cannot be a database constraint: the real
 * catalog legitimately holds the same model name twice under one brand (K4,
 * Territory, Altima …) for different generations.
 */

import { useState, useMemo } from "react";
import { ChevronDown, Plus, Loader2, Check, Languages } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createCatalogEntry } from "../_apicalls/catalogApi";
import { localized } from "@/marketplace/lib/listing";

export default function CatalogCombo({
  mode = "ar",
  locale = "ar",
  kind,
  name,
  items = [],
  value = "",
  onChange,
  onCreated,
  parentId = null,
  vendorId = null,
  disabled = false,
  required = false,
  placeholder = "",
  // OFF by default. Letting a seller invent a brand mid-listing is how the
  // catalog filled up with models filed as brands ("Camry", "RAV4") and rows
  // whose English name was the Arabic one. The catalog is shared reference
  // data — every seller sees it — so entries are created on the Catalog page,
  // deliberately, not as a side effect of typing into a picker.
  allowCreate = false,
  labelOf,
  /**
   * (item) => string | null. A reason this row cannot be chosen.
   *
   * Returning a reason both DISABLES the row and prints it beside the name, so
   * the picker answers "why not?" where the question is asked. Offers use it
   * for a car that already has one running: hiding it instead would read as
   * the car having been deleted.
   */
  unavailable,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Names are {ar, en} jsonb; `value` covers years, which are plain numbers.
   *
   * The visible list follows the store's language. A 'both' store additionally
   * gets a dialog with one list per language — see the bottom of this file.
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
  const otherLang = primaryLang === "ar" ? "en" : "ar";

  const label =
    labelOf ?? ((row) => localized(row.name, primaryLang) || String(row.value ?? ""));


  const selected = items.find((i) => i.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 80);
    return items
      .filter((i) => {
        const en = String(localized(i.name, "en") || i.value || "").toLowerCase();
        const ar = String(localized(i.name, "ar") || "").toLowerCase();
        return en.includes(q) || ar.includes(q);
      })
      .slice(0, 80);
  }, [items, query]);

  // An exact match means "create" must not be offered — that is the duplicate
  // we are trying to prevent.
  const exact = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return items.some(
      (i) =>
        String(localized(i.name, "en") || i.value || "").toLowerCase() === q ||
        String(localized(i.name, "ar") || "").toLowerCase() === q
    );
  }, [items, query]);

  // No outside-click or autofocus effect here: Popover and Command handle
  // dismissal, focus and keyboard navigation. The hand-rolled versions also
  // could not see clicks inside a portal, which is why the picker stayed open
  // behind other overlays.

  const create = async () => {
    const text = query.trim();
    if (!text) return;

    setCreating(true);
    setError(null);
    try {
      const payload = kind === "year"
        ? { kind, value: text, vendorId }
        : { kind, nameAr: isAr ? text : text, nameEn: isAr ? text : text, parentId, vendorId };

      const { item, created } = await createCatalogEntry(payload);
      onCreated?.(item, created);
      onChange?.(item.id);
      setOpen(false);
      setQuery("");
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      {/* The real form value — the visible control is a button, so the value
          still has to reach FormData. */}
      <input type="hidden" name={name} value={value ?? ""} required={required} />

      <div className="flex items-start gap-2">
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQuery(""); setError(null); } }}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              role="combobox"
              aria-expanded={open}
              className="h-11 w-full justify-between gap-2 px-3 text-start font-normal"
            >
              <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>
                {selected ? label(selected) : placeholder || t("اختر", "Select")}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 opacity-50 transition-transform ${open ? "rotate-180" : ""}`} />
            </Button>
          </PopoverTrigger>

          {/*
            Width tracks the trigger, so the list is as wide as the field on a
            desktop form and as narrow as it on a phone.

            The bracketed var() form is deliberate, not stylistic. This used to
            use Tailwind v4's parenthesis shorthand, and PopoverContent's own
            base class carries a fixed w-72; cn() leans on tailwind-merge to
            drop the loser, but tailwind-merge 2.6.0 does not recognise that
            shorthand as a width utility and let BOTH through. Tailwind then
            resolved the tie by stylesheet order, where w-72 lands later and
            wins — so the dropdown sat at a flat 288px however wide the field
            was. The bracket form IS recognised, so w-72 is dropped before it
            reaches the DOM.

            max-w keeps it inside a small viewport when the field itself is
            wider than the screen.
          */}
          <PopoverContent
            /* The portal renders on document.body, OUTSIDE this page's markup,
               so it inherits <html dir> — and the root layout hardcodes
               dir="rtl". That is why the English picker came up right-aligned
               with its scrollbar on the left and its placeholder reading
               "…Search". Every DialogContent in the dashboard already sets this
               for the same reason; the popover was the one that did not. */
            dir={isAr ? "rtl" : "ltr"}
            className="w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-2rem)] p-0"
            align="start"
          >
            {/* shouldFilter={false} because `filtered` already searches BOTH
                languages. Command matches on the RENDERED label only, so it
                would miss an Arabic query on a row showing its English name. */}
            <Command shouldFilter={false}>
              <CommandInput
                value={query}
                onValueChange={(v) => { setQuery(v); setError(null); }}
                placeholder={
                  allowCreate
                    ? t("ابحث أو اكتب اسماً جديداً…", "Search, or type a new name…")
                    : t("ابحث…", "Search…")
                }
              />
              {/*
                CommandList ships a flat max-h-[300px], which is taller than a
                phone in landscape — the search box scrolls off and the list
                cannot be reached. Radix measures the room between the trigger
                and the viewport edge and publishes it, so the list takes the
                smaller of the two. The 300px fallback inside var() keeps a
                sane cap if the variable is ever absent.
              */}
              <CommandList className="max-h-[min(300px,var(--radix-popover-content-available-height,300px))]">
                <CommandEmpty>{t("لا توجد نتائج", "No matches")}</CommandEmpty>

                <CommandGroup>
                  {filtered.map((item) => {
                    const blocked = unavailable?.(item) ?? null;

                    return (
                      <CommandItem
                        key={item.id}
                        value={item.id}
                        disabled={Boolean(blocked)}
                        onSelect={() => {
                          if (blocked) return;
                          onChange?.(item.id);
                          setOpen(false);
                          setQuery("");
                        }}
                        className="justify-between gap-2"
                      >
                        <span className="truncate">
                          {label(item)}
                          {item.is_custom ? (
                            <span className="ms-2 rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                              {t("مضاف", "custom")}
                            </span>
                          ) : null}
                        </span>
                        {blocked ? (
                          <span className="shrink-0 whitespace-nowrap rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {blocked}
                          </span>
                        ) : item.id === value ? (
                          <Check className="h-4 w-4 shrink-0" />
                        ) : null}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>

                {allowCreate && query.trim() && !exact ? (
                  <CommandGroup className="border-t">
                    <CommandItem value="__create__" onSelect={create} disabled={creating}>
                      {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      <span className="font-medium text-brand-primary">
                        {t(`إضافة "${query.trim()}"`, `Add "${query.trim()}"`)}
                      </span>
                    </CommandItem>
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>

            {error ? (
              <p className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900 dark:bg-red-950/40">
                {error}
              </p>
            ) : null}
          </PopoverContent>
        </Popover>

        {/* Same affordance as the bilingual TEXT fields: one control inline,
            and a dialog holding both languages when the store authors in both. */}
        {mode === "both" && !disabled ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-11 shrink-0 gap-1.5 px-2.5 text-xs font-normal"
                title={t("عرض اللغتين", "See both languages")}
              >
                <Languages className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("اللغتان", "Both")}</span>
              </Button>
            </DialogTrigger>

            <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-brand-primary">
                  <Languages className="h-4 w-4" />
                  {placeholder || t("اللغتان", "Both languages")}
                </DialogTitle>
              </DialogHeader>

              {/* TWO dropdowns, Arabic and English — two views of ONE answer.
                  A listing stores a single catalog id, so both are bound to
                  `value` and picking in either moves the other. The catalog
                  holds rows labelled in only one language, so finding a row in
                  the Arabic list and watching the English list land on the same
                  row is the whole point. */}
              <div className="space-y-4">
                {["ar", "en"].map((lang) => (
                  <div key={lang}>
                    <span className="mb-1.5 block text-xs font-medium">
                      {lang === "ar" ? t("العربية", "Arabic") : t("الإنجليزية", "English")}
                    </span>
                    <Select value={value || undefined} onValueChange={(v) => onChange?.(v)}>
                      <SelectTrigger dir={lang === "ar" ? "rtl" : "ltr"}>
                        <SelectValue placeholder={placeholder || t("اختر", "Select")} />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map((item) => {
                          // Years carry a number, not a name. A row missing this
                          // language falls back rather than rendering blank and
                          // unpickable, and says so.
                          const own = item.value != null ? String(item.value) : item.name?.[lang];
                          const shown = own || localized(item.name, lang) || String(item.value ?? "");
                          return (
                            <SelectItem key={item.id} value={item.id}>
                              {shown}{own ? "" : ` ${t("(بلا ترجمة)", "(untranslated)")}`}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <DialogClose asChild>
                <Button type="button" className="w-full bg-brand-primary hover:bg-[var(--brand-dark)]">
                  {t("تم", "Done")}
                </Button>
              </DialogClose>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}
