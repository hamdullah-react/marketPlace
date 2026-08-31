"use client";

/**
 * One field, two languages.
 *
 * Mode comes from settings.default_locale:
 *   'ar'   → a single Arabic box. Nothing else.
 *   'en'   → a single English box. Nothing else.
 *   'both' → one box plus a popup holding both languages.
 *
 * A seller who has chosen to work in one language should not be nagged about
 * the other on every field; only "both" opts into the two-language popup.
 *
 * Whatever the mode, BOTH values are always submitted via hidden inputs, so
 * switching the authoring language later never discards a translation that was
 * already written.
 */

import { useState } from "react";
import { Languages } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const BASE =
  "w-full rounded-lg border bg-background px-3 text-sm outline-hidden transition-colors focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20";

/**
 * Defined at module scope on purpose.
 *
 * Declaring this inside BilingualField would create a NEW component type on
 * every render, so React would unmount and remount the input on each keystroke
 * — the caret jumps out and only the first character lands. That was the
 * "input not working" bug.
 */
function LangInput({ lang, value, onChange, textarea, rows, placeholder, autoFocus, maxLength }) {
  const Tag = textarea ? "textarea" : "input";
  return (
    <Tag
      dir={lang === "ar" ? "rtl" : "ltr"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={textarea ? rows : undefined}
      maxLength={maxLength}
      autoFocus={autoFocus}
      className={textarea ? `${BASE} py-2.5` : `${BASE} h-10`}
    />
  );
}

export default function BilingualField({
  id,
  label,
  ar = "",
  en = "",
  mode = "ar",
  locale = "ar",
  textarea = false,
  rows = 3,
  phAr = "",
  phEn = "",
  maxLength,
  required = false,
  error,
  // A line under the box: what the field is for, or how long it may be.
  hint,
  // Optional. Fires with {ar, en} on every keystroke, in either language, so a
  // caller can derive something from the name — an auto slug, a live preview.
  // The field still owns its state; this is a read-out, not a controlled prop.
  onChange,
}) {
  const isAr = locale === "ar";
  const t = (a, e) => (isAr ? a : e);

  const [values, setValues] = useState({ ar: ar ?? "", en: en ?? "" });

  // Computed outside the updater on purpose: onChange is a side effect and a
  // setState updater must stay pure, or StrictMode's double-invoke would fire
  // it twice per keystroke.
  const set = (lang) => (v) => {
    const next = { ...values, [lang]: v };
    setValues(next);
    onChange?.(next);
  };

  // In single-language mode the visible box IS that language.
  //
  // In 'both' it follows the DASHBOARD language rather than always being
  // Arabic, which is what put an Arabic box and an Arabic placeholder in front
  // of English users on a page whose every label was English. The popup still
  // carries the pair, so nothing is lost either way.
  const primary = mode === "en" ? "en" : mode === "ar" ? "ar" : isAr ? "ar" : "en";
  const ph = (lang) => (lang === "ar" ? phAr || "بالعربية" : phEn || "In English");
  const langLabel = (l) => (l === "ar" ? t("العربية", "Arabic") : t("الإنجليزية", "English"));

  return (
    <div>
      {label ? (
        <span className="mb-1.5 block text-sm font-medium">
          {label} {required ? <span className="text-red-500">*</span> : null}
        </span>
      ) : null}

      <input type="hidden" name={`${id}Ar`} value={values.ar} />
      <input type="hidden" name={`${id}En`} value={values.en} />

      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <LangInput
            lang={primary}
            value={values[primary]}
            onChange={set(primary)}
            textarea={textarea}
            rows={rows}
            maxLength={maxLength}
            placeholder={ph(primary)}
          />
        </div>

        {/* Only 'both' offers the two-language dialog. shadcn Dialog rather
            than a hand-rolled portal, so focus trapping, Escape and scroll
            locking behave like every other dialog in the dashboard. */}
        {mode === "both" ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 shrink-0 gap-1.5 px-2.5 text-xs"
                title={t("تحرير اللغتين", "Edit both languages")}
              >
                <Languages className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t("اللغتان", "Both")}</span>
              </Button>
            </DialogTrigger>

            <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-brand-primary">
                  <Languages className="h-4 w-4" />
                  {label || t("تحرير اللغتين", "Edit both languages")}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4">
                {["ar", "en"].map((lang) => (
                  <div key={lang}>
                    <span className="mb-1 block text-xs font-medium">{langLabel(lang)}</span>
                    <LangInput
                      lang={lang}
                      value={values[lang]}
                      onChange={set(lang)}
                      textarea={textarea}
                      rows={rows}
                      maxLength={maxLength}
                      placeholder={ph(lang)}
                      autoFocus={lang === "ar"}
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

      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}

    </div>
  );
}
