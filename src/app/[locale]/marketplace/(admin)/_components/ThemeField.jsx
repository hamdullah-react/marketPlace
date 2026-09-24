"use client";

/**
 * Admin → Settings → Appearance.
 *
 * Five controls — brand colour, accent, the two page backgrounds, corner
 * roundness, shadow strength — posted as one JSON field. Everything else in the
 * palette is derived from the brand colour by theme.js, and the swatches under
 * the picker show exactly what it will derive, so a choice is not a guess.
 *
 * ── Preview, not description ────────────────────────────────────────────────
 *
 * The panel underneath is built from the same utilities the marketplace uses —
 * raised, raised-card, raised-solid, bg-brand-primary — with the theme's
 * variables set inline on its wrapper. It IS the components, so it cannot
 * describe a look the app does not have.
 *
 * "Preview on the whole page" puts the same variables on <html>, which every
 * screen in the dashboard already reads. It is deliberately temporary: it is
 * cleared when the switch goes off, when the component unmounts, and it is
 * never what gets stored — only Save writes.
 */

import { useState, useEffect, useRef } from "react";
import { RotateCcw, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  THEME_DEFAULTS, RADIUS_STEPS, SHADOW_STEPS, BADGE_SLOTS,
  normalizeTheme, normalizeHex, derive,
} from "@/marketplace/lib/theme";

/* Ready-made palettes. The brand green first, so "put it back" is a click
   rather than a hex an admin has to have written down. */
const PRESETS = [
  { ar: "الأخضر (الافتراضي)", en: "Green (default)", ...THEME_DEFAULTS },
  { ar: "أزرق", en: "Blue", primary: "#1D4ED8", gold: "#D4AF37", bgLight: "#EAF0FB", bgDark: "#0A0F1B" },
  { ar: "بنفسجي", en: "Purple", primary: "#6D28D9", gold: "#D4AF37", bgLight: "#F1EBFB", bgDark: "#120B1E" },
  { ar: "عنابي", en: "Crimson", primary: "#A81E3C", gold: "#D4AF37", bgLight: "#FBECEF", bgDark: "#1A0A0E" },
  { ar: "فحمي", en: "Charcoal", primary: "#334155", gold: "#C69749", bgLight: "#EEF1F4", bgDark: "#0C0F13" },
];

/** The CSS variables a theme sets, as a React style object. */
function styleVars(theme) {
  const c = derive(theme);
  const vars = {
    "--brand-primary": c.primary,
    "--brand-dark": c.dark,
    "--brand-light": c.light,
    "--brand-on-dark": c.onDark,
    "--brand-ink": c.ink,
    "--brand-rgb": c.rgb,
    "--gold": c.gold,
    "--gold-light": c.goldLight,
    "--app-bg": c.bgLight,
    "--app-bg-dark": c.bgDark,
    "--color-primary": c.primary,
    "--color-primary-hover": c.dark,
    "--color-primary-muted": c.light,
    "--color-accent": c.primary,
    "--color-ring": c.primary,
    /* shadcn's own tokens, as HSL channels — what every plain <Button> reads. */
    "--primary": c.hsl,
    "--ring": c.hsl,
    "--shadow-strength": String(theme.shadow),
    /* The lit surfaces, so the preview panel and the whole-page preview show
       the tinted buttons and cards rather than the stylesheet's greens. */
    "--surface-from": c.surface.from,
    "--surface-to": c.surface.to,
    "--surface-header-from": c.surface.headerFrom,
    "--surface-header-to": c.surface.headerTo,
    "--surface-hover-from": c.surface.hoverFrom,
    "--surface-hover-to": c.surface.hoverTo,
    "--surface-card-from": c.surface.cardFrom,
    "--surface-card-to": c.surface.cardTo,
    "--surface-dark-from": c.surface.darkFrom,
    "--surface-dark-to": c.surface.darkTo,
    "--surface-dark-hover-from": c.surface.darkHoverFrom,
    "--surface-dark-hover-to": c.surface.darkHoverTo,
    "--surface-dark-card-from": c.surface.darkCardFrom,
    "--surface-dark-card-to": c.surface.darkCardTo,
  };

  for (const slot of BADGE_SLOTS) {
    vars[`--badge-${slot.key}-bg`] = c.badges[slot.key].bg;
    vars[`--badge-${slot.key}-fg`] = c.badges[slot.key].fg;
  }

  for (const [name, rem] of Object.entries({
    xs: 0.125, sm: 0.25, md: 0.375, lg: 0.5, xl: 0.75, "2xl": 1, "3xl": 1.5, "4xl": 2,
  })) {
    vars[`--radius-${name}`] = `${+(rem * theme.radius).toFixed(4)}rem`;
  }
  vars["--radius"] = `${+(0.5 * theme.radius).toFixed(4)}rem`;

  return vars;
}

function ColourRow({ id, label, hint, value, onChange }) {
  return (
    <div className="flex items-center gap-3">
      {/* The native picker IS the swatch — a separate preview square beside it
          would be the same colour twice. */}
      <input
        id={id}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        aria-label={label}
      />
      <div className="min-w-0 flex-1">
        <Label htmlFor={id} className="text-sm">{label}</Label>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onChange(normalizeHex(e.target.value, value))}
        spellCheck={false}
        dir="ltr"
        className="h-9 w-24 shrink-0 rounded-md border bg-background px-2 text-center font-mono text-xs uppercase"
      />
    </div>
  );
}

function Steps({ label, hint, steps, value, onChange, isAr }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap gap-1.5">
        {steps.map((step) => (
          <button
            key={step.value}
            type="button"
            onClick={() => onChange(step.value)}
            aria-pressed={value === step.value}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              value === step.value
                ? "raised-solid bg-brand-primary text-white"
                : "raised-hover text-muted-foreground"
            }`}
          >
            {isAr ? step.ar : step.en}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ThemeField({ locale = "ar", value = null }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [theme, setTheme] = useState(() => normalizeTheme(value));
  const [live, setLive] = useState(false);

  const set = (key) => (next) => setTheme((prev) => ({ ...prev, [key]: next }));
  const colours = derive(theme);
  const vars = styleVars(theme);

  /**
   * The whole dashboard, temporarily.
   *
   * Written straight onto <html> rather than through state, because the target
   * is the document — an external system, which is what an effect is for. Every
   * property this sets is removed on the way out, so switching the preview off
   * (or leaving the page) restores the saved theme exactly.
   */
  const applied = useRef([]);
  useEffect(() => {
    const root = document.documentElement;

    const clear = () => {
      for (const name of applied.current) root.style.removeProperty(name);
      applied.current = [];
    };

    clear();
    if (live) {
      for (const [name, v] of Object.entries(vars)) root.style.setProperty(name, v);
      applied.current = Object.keys(vars);
    }

    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, JSON.stringify(vars)]);

  const isDefault = Object.keys(THEME_DEFAULTS).every((k) => theme[k] === THEME_DEFAULTS[k]);
  const matches = (preset) =>
    preset.primary === theme.primary && preset.bgLight === theme.bgLight && preset.gold === theme.gold;

  return (
    <div className="space-y-5">
      {/* What the action reads. The controls are React state, so the value has
          to travel as a real input. */}
      <input type="hidden" name="theme" value={JSON.stringify(theme)} />

      {/* ── Presets ─────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <Label className="text-sm">{t("لوحات جاهزة", "Palettes")}</Label>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.en}
              type="button"
              onClick={() =>
                setTheme((prev) => ({
                  ...prev,
                  primary: preset.primary,
                  gold: preset.gold,
                  bgLight: preset.bgLight,
                  bgDark: preset.bgDark,
                }))
              }
              className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                matches(preset) ? "border-brand-primary" : "border-transparent raised-hover"
              }`}
            >
              <span
                aria-hidden="true"
                className="h-4 w-4 rounded-full border border-black/10"
                style={{ background: preset.primary }}
              />
              {t(preset.ar, preset.en)}
              {matches(preset) ? <Check className="h-3 w-3 text-brand-primary" /> : null}
            </button>
          ))}
        </div>
      </div>

      {/* ── Colours ─────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <ColourRow
          id="theme-primary"
          label={t("اللون الأساسي", "Brand colour")}
          hint={t(
            "الأزرار والروابط والعناوين وظل البطاقات.",
            "Buttons, links, headings and the tint of every card shadow."
          )}
          value={theme.primary}
          onChange={set("primary")}
        />

        {/* What that one colour becomes. Shown because four of the five are
            never chosen by hand, and an admin picking a very light or very dark
            brand should see the consequence before saving. */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5">
          {[
            { key: "dark", ar: "عند الضغط", en: "Pressed" },
            { key: "light", ar: "خلفية فاتحة", en: "Tint" },
            { key: "onDark", ar: "الوضع الداكن", en: "Dark mode" },
            { key: "ink", ar: "الأسطح الداكنة", en: "Dark surface" },
          ].map((shade) => (
            <span key={shade.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span
                aria-hidden="true"
                className="h-5 w-5 rounded-md border border-black/10"
                style={{ background: colours[shade.key] }}
              />
              {t(shade.ar, shade.en)}
            </span>
          ))}
          <span className="text-[11px] text-muted-foreground">
            {t("مشتقة تلقائياً", "Derived automatically")}
          </span>
        </div>

        <ColourRow
          id="theme-gold"
          label={t("لون العروض", "Offer accent")}
          hint={t("شارات الخصم و«مميز».", 'The "Save %" and "Featured" badges.')}
          value={theme.gold}
          onChange={set("gold")}
        />
        <ColourRow
          id="theme-bg-light"
          label={t("خلفية الصفحة", "Page background")}
          hint={t("الوضع الفاتح.", "Light mode.")}
          value={theme.bgLight}
          onChange={set("bgLight")}
        />
        <ColourRow
          id="theme-bg-dark"
          label={t("خلفية الوضع الداكن", "Dark page background")}
          value={theme.bgDark}
          onChange={set("bgDark")}
        />
      </div>

      {/* ── Promotion badges ─────────────────────────────────────────────
          The five pills a car card can carry. Each is one background and one
          ink, and the ink paints the icon too — they are drawn in
          currentColor, so a separate icon colour would only be a way to make
          the icon disagree with its own label.

          "Follow the theme" is a real state, not a colour: New tracks the
          brand colour and the two deal pills track the accent, so changing the
          brand does not leave a green badge on a blue site. Setting a colour
          here opts that one badge out of it. */}
      <div className="space-y-2">
        <Label className="text-sm">{t("شارات العروض", "Promotion badges")}</Label>
        <p className="text-xs text-muted-foreground">
          {t(
            "خمس شارات تظهر على بطاقة السيارة. اللون الثاني للنص والأيقونة معاً.",
            "The five badges a car card can show. The second colour paints the text and its icon."
          )}
        </p>

        <div className="space-y-2 rounded-lg border p-3">
          {BADGE_SLOTS.map((slot) => {
            const pair = colours.badges[slot.key];
            const custom = theme.badges?.[slot.key] ?? null;

            const setPart = (part) => (next) =>
              setTheme((prev) => ({
                ...prev,
                badges: {
                  ...prev.badges,
                  [slot.key]: { ...(prev.badges?.[slot.key] ?? {}), [part]: next },
                },
              }));

            const follow = () =>
              setTheme((prev) => {
                const rest = { ...prev.badges };
                delete rest[slot.key];
                return { ...prev, badges: rest };
              });

            return (
              <div key={slot.key} className="flex flex-wrap items-center gap-2">
                {/* The badge itself, painted with what is currently chosen. */}
                <span
                  className="flex min-w-20 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold shadow-sm"
                  style={{ background: pair.bg, color: pair.fg }}
                >
                  {t(slot.ar, slot.en)}
                </span>

                <input
                  type="color"
                  value={pair.bg}
                  onChange={(e) => setPart("bg")(e.target.value)}
                  aria-label={`${t(slot.ar, slot.en)} — ${t("الخلفية", "background")}`}
                  title={t("الخلفية", "Background")}
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                />
                <input
                  type="color"
                  value={pair.fg}
                  onChange={(e) => setPart("fg")(e.target.value)}
                  aria-label={`${t(slot.ar, slot.en)} — ${t("النص والأيقونة", "text and icon")}`}
                  title={t("النص والأيقونة", "Text and icon")}
                  className="h-7 w-9 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                />

                {custom ? (
                  <button
                    type="button"
                    onClick={follow}
                    className="text-[11px] text-muted-foreground hover:text-brand-primary"
                  >
                    {t("اتبع الثيم", "Follow the theme")}
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {t("يتبع الثيم", "Follows the theme")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Shape ───────────────────────────────────────────────────────── */}
      <Steps
        label={t("انحناء الزوايا", "Corner roundness")}
        hint={t(
          "يسري على البطاقات والأزرار والحقول في كل الصفحات.",
          "Applies to cards, buttons and fields across every page."
        )}
        steps={RADIUS_STEPS}
        value={theme.radius}
        onChange={set("radius")}
        isAr={isAr}
      />
      <Steps
        label={t("قوة الظل", "Shadow strength")}
        hint={t("عمق الإضاءة تحت البطاقات والأزرار.", "How deeply cards and buttons are lit.")}
        steps={SHADOW_STEPS}
        value={theme.shadow}
        onChange={set("shadow")}
        isAr={isAr}
      />

      {/* ── Preview ─────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Label className="text-sm">{t("معاينة", "Preview")}</Label>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Switch checked={live} onCheckedChange={setLive} />
            {t("طبّقها على الصفحة كلها مؤقتاً", "Preview on the whole page")}
          </label>
        </div>

        <div
          style={{ ...vars, background: theme.bgLight }}
          className="space-y-3 rounded-xl border p-4"
        >
          <div className="raised-card space-y-2 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[10px] font-bold text-[#2a2100]">
                {t("وفّر ١٠٪", "Save 10%")}
              </span>
              <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-bold text-white">
                {t("جديد", "New")}
              </span>
            </div>
            <p className="text-sm font-bold text-brand-primary">
              {t("عنوان بطاقة", "A card heading")}
            </p>
            <p className="text-xs text-neutral-500">
              {t("نص صغير تحت العنوان.", "Small text under the heading.")}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <span className="raised-solid inline-flex items-center rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-bold text-white">
                {t("زر أساسي", "Primary button")}
              </span>
              <span className="raised inline-flex items-center rounded-lg px-3 py-1.5 text-xs font-bold">
                {t("زر ثانوي", "Secondary")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {!isDefault ? (
        <button
          type="button"
          onClick={() => setTheme(normalizeTheme(null))}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-brand-primary"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("إرجاع الألوان الافتراضية", "Reset to the default theme")}
        </button>
      ) : null}
    </div>
  );
}
