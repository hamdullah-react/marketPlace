"use client";

/**
 * A catalog dropdown that follows the store's language setting, the same way
 * BilingualField does for text.
 *
 *   mode="ar"    one dropdown, Arabic labels
 *   mode="en"    one dropdown, English labels
 *   mode="both"  one dropdown plus a dialog holding TWO dropdowns — the English
 *                list and the Arabic list, stacked
 *
 * The two dropdowns in the dialog are two VIEWS of one answer, not two answers.
 * A listing stores a single option id; picking "Automatic" in the English list
 * and "أوتوماتيك" in the Arabic list are the same act, so both selects are bound
 * to the same value and either one moves the other. That matters because the
 * labels are not always both present — a catalog option may have only Arabic —
 * and a seller should be able to find the row by whichever language they think
 * in without ending up with two different answers.
 *
 * Built on shadcn Dialog + Select rather than a hand-rolled portal, so focus
 * trapping, escape handling, scroll locking and the overlay all come from Radix
 * and match every other dialog in the dashboard.
 */

import { Languages } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

/**
 * Radix rejects an empty string as a SelectItem value — it reserves "" for
 * "nothing selected" — so the clear row travels under a sentinel and is mapped
 * back to "" on the way out.
 */
const NONE = "__none__";

/**
 * Module scope, not nested below. A component declared inside another is a new
 * type on every render, so React remounts it and the open dropdown closes.
 */
function OptionList({ lang, options, value, onChange, unsetLabel, untranslatedLabel, ariaLabel }) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger dir={lang === "ar" ? "rtl" : "ltr"} aria-label={ariaLabel}>
        <SelectValue placeholder={unsetLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{unsetLabel}</SelectItem>
        {options.map((o) => {
          // Fall back to the other language rather than rendering a blank row —
          // an unlabelled option is unpickable.
          const own = lang === "ar" ? o.name?.ar : o.name?.en;
          const shown = own || o.name?.en || o.name?.ar || o.slug || String(o.value ?? "");
          return (
            <SelectItem key={o.id} value={String(o.value ?? o.id)}>
              {shown}
              {own ? "" : ` ${untranslatedLabel}`}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export default function BilingualSelect({
  name,
  label,
  options = [],
  value,
  onChange,
  mode = "ar",
  locale = "ar",
  required = false,
  labelClass = "",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /**
   * Which language the LIST is read in — the dashboard's, always.
   *
   * This used to follow the store's field mode, so an Arabic-only store showed
   * Arabic option labels on the English dashboard. Field mode decides which
   * languages a seller WRITES; it has no business deciding which language they
   * READ. A row missing the wanted language still falls back to the other one
   * below rather than rendering blank.
   */
  const primary = isAr ? "ar" : "en";
  const unset = t("غير محدد", "Not specified");
  const untranslated = t("(بلا ترجمة)", "(untranslated)");

  return (
    <div>
      {label ? (
        <span className={labelClass}>
          {label} {required ? <span className="text-red-500">*</span> : null}
        </span>
      ) : null}

      {/* Radix Select is not a native control, so the value reaches FormData
          through this. One value goes to the server whichever list picked it. */}
      <input type="hidden" name={name} value={value ?? ""} />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <OptionList
            lang={primary}
            options={options}
            value={value}
            onChange={onChange}
            unsetLabel={unset}
            untranslatedLabel={untranslated}
            ariaLabel={label}
          />
        </div>

        {mode === "both" ? (
          <Dialog>
            {/* asChild so the trigger IS the button — Radix owns open state,
                so no caller has to thread it through. */}
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 px-2.5 text-xs"
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
                  {label || t("اللغتان", "Both languages")}
                </DialogTitle>
                <DialogDescription>
                  {t(
                    "القائمتان تعرضان نفس الخيار بلغتين — الاختيار من أيّهما واحد.",
                    "Both lists hold the same options in two languages — picking from either is the same choice."
                  )}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {["ar", "en"].map((lang) => (
                  <div key={lang}>
                    <span className="mb-1.5 block text-xs font-medium">
                      {lang === "ar" ? t("العربية", "Arabic") : t("الإنجليزية", "English")}
                    </span>
                    <OptionList
                      lang={lang}
                      options={options}
                      value={value}
                      onChange={onChange}
                      unsetLabel={unset}
                      untranslatedLabel={untranslated}
                      ariaLabel={lang === "ar" ? t("العربية", "Arabic") : t("الإنجليزية", "English")}
                    />
                  </div>
                ))}
              </div>

              <DialogClose asChild>
                <Button type="button" className="w-full bg-brand-primary hover:bg-[#5a2363]">
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
