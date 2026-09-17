"use client";

/**
 * Which countries' phone numbers the marketplace accepts.
 *
 * Every form that asks for a number — signing up, a showroom's contact details,
 * a promotion request, a buyer's enquiry — is checked against what is picked
 * here. Before this existed the rule was a Saudi mobile, written out in five
 * places, so a buyer with a Pakistani number could not finish signing up.
 *
 * ── "Any country" is a choice, not an empty state ───────────────────────────
 *
 * Ticking nothing means no country rule at all, and that reads as a mistake —
 * so it is a switch that says so, and the country list is hidden while it is
 * on. What is stored is the same either way: an empty list.
 */

import { useState } from "react";
import { Check, Globe } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PHONE_COUNTRIES } from "@/marketplace/lib/phone";

export default function PhoneCountriesField({ locale = "ar", value = ["SA"], name = "phoneCountries" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const initial = Array.isArray(value) ? value.map((c) => String(c).toUpperCase()) : ["SA"];
  const [picked, setPicked] = useState(initial);
  const [any, setAny] = useState(initial.length === 0);

  // Empty means any country — see the note above.
  const stored = any ? [] : picked;

  const toggle = (code) =>
    setPicked((list) => (list.includes(code) ? list.filter((c) => c !== code) : [...list, code]));

  return (
    <div className="grid gap-3">
      <input type="hidden" name={name} value={JSON.stringify(stored)} />

      <label className="raised flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <Globe className="h-4 w-4 text-brand-primary" aria-hidden="true" />
          <span>
            {t("قبول أرقام من أي دولة", "Accept numbers from any country")}
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {t(
                "بدون التحقق من الدولة — أي رقم من ٧ إلى ١٥ خانة.",
                "No country check — any number of 7 to 15 digits."
              )}
            </span>
          </span>
        </span>
        <Switch checked={any} onCheckedChange={setAny} />
      </label>

      {any ? null : (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {PHONE_COUNTRIES.map((country) => {
              const on = picked.includes(country.code);
              return (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => toggle(country.code)}
                  aria-pressed={on}
                  className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition-colors ${
                    on ? "raised-solid bg-brand-primary text-white" : "raised-hover"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {isAr ? country.ar : country.en}
                    <span className={`ms-1 text-xs tabular-nums ${on ? "text-white/75" : "text-muted-foreground"}`} dir="ltr">
                      +{country.dial}
                    </span>
                  </span>
                  {on ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>

          {picked.length === 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {t(
                "لم تختر أي دولة — لن يُقبل أي رقم. اختر دولة واحدة على الأقل، أو فعّل «أي دولة».",
                "No country picked — no number will be accepted. Choose at least one, or turn on “any country”."
              )}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
