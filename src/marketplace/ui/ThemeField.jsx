"use client";

/**
 * The Appearance editor — used by Admin → Settings and by Seller → Settings.
 *
 * ── Why it lives in marketplace/ui ───────────────────────────────
 *
 * It started under (admin)/_components and is now opened by two dashboards that
 * store their theme in different columns. It takes a value and posts a hidden
 * JSON field — it has never known who was going to save it — so sharing it cost
 * nothing but a move, and the alternative was a second copy that would drift
 * the first time a knob was added.
 *
 * The two differences between the callers are props:
 *
 *   previewSelector  where "preview on the whole page" writes. The platform's
 *                    theme is the document, so the admin leaves it unset and it
 *                    goes on <html>. A showroom's theme is its dashboard, so
 *                    the seller passes the dashboard's wrapper — a preview
 *                    that spilled onto the public header would be showing a
 *                    change that cannot happen when it is saved.
 *   showBadges       the five car-card badges. A showroom's dashboard is tables
 *                    and forms; those pills are painted on the PUBLIC card,
 *                    which this theme deliberately cannot reach. Offering the
 *                    controls there would be offering a setting with no effect.
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
import { useTheme } from "next-themes";
import { RotateCcw, Check } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  THEME_DEFAULTS, RADIUS_STEPS, SHADOW_STEPS, BADGE_SLOTS,
  normalizeTheme, normalizeHex, derive,
} from "@/marketplace/lib/theme";

/**
 * Ready-made palettes. The brand green first, so "put it back" is a click
 * rather than a hex an admin has to have written down.
 *
 * ── A preset may set the SHAPE, not only the colours ────────────────────────
 *
 * `radius` and `shadow` are optional here. Most palettes leave them out,
 * because changing the brand colour should not quietly flatten every card —
 * somebody choosing "Blue" asked for blue.
 *
 * "Simple" is the exception, and it is the reason the fields exist. A plain
 * office-software look is not a colour: it is a blue, square-ish corners and no
 * shadow at all, together. Offering it as a swatch that only recoloured things
 * would leave an admin to find the Corners and Shadow sliders themselves and
 * guess which notch was meant — so the preset carries all four.
 */
const PRESETS = [
  { ar: "الأخضر (الافتراضي)", en: "Green (default)", ...THEME_DEFAULTS },
  { ar: "أزرق", en: "Blue", primary: "#1D4ED8", gold: "#D4AF37", bgLight: "#EAF0FB", bgDark: "#0A0F1B" },
  { ar: "بنفسجي", en: "Purple", primary: "#6D28D9", gold: "#D4AF37", bgLight: "#F1EBFB", bgDark: "#120B1E" },
  { ar: "عنابي", en: "Crimson", primary: "#A81E3C", gold: "#D4AF37", bgLight: "#FBECEF", bgDark: "#1A0A0E" },
  { ar: "فحمي", en: "Charcoal", primary: "#334155", gold: "#C69749", bgLight: "#EEF1F4", bgDark: "#0C0F13" },
  {
    /**
     * The flat, neutral, office-software look — the one people mean by "like
     * Windows" or "like Microsoft 365".
     *
     * Every value is doing a specific job:
     *
     *   primary  #0F6CBD, Fluent 2's own communication blue. Not #1D4ED8 from
     *            the Blue preset above, which is a vivid web blue; this one is
     *            duller on purpose and is what reads as a tool rather than a
     *            brand.
     *   gold     #EAA300, Fluent's marigold, for the offer badges. The brass
     *            #D4AF37 the other palettes use is a luxury-retail accent and
     *            fights a neutral grey shell.
     *   bgLight  #F5F5F5 — the neutral page grey, so white cards read as raised
     *            against it with no shadow needed. A white page with flat white
     *            cards has no visible structure at all, which is the trap when
     *            shadows are turned off.
     *   bgDark   #1F1F1F, the matching dark neutral.
     *   radius   0.5 → `rounded-xl` lands near 6px instead of 12px. Flat and
     *            round together reads as a soft toy; flat wants tight corners.
     *   shadow   0, flat. This is the one that does most of the work.
     */
    ar: "بسيط (مايكروسوفت)", en: "Simple (Microsoft)",
    primary: "#0F6CBD", gold: "#EAA300",
    bgLight: "#F5F5F5", bgDark: "#1F1F1F",
    radius: 0.5, shadow: 0,
  },
];

/**
 * The CSS variables a theme sets, as a React style object.
 *
 * ── Why it takes `dark` ─────────────────────────────────────────────────────
 *
 * These go on an element as INLINE styles, and an inline style beats every
 * rule in the stylesheet — including `.dark`. So a preview that always wrote
 * the light values pushed the light palette onto a dark page: an admin viewing
 * the dashboard at night pressed "preview" and got a half-lit hybrid that no
 * saved theme could ever produce. Since the whole point of the switch is to
 * show the real thing before saving, it has to write whichever half of the
 * theme the page is currently showing.
 */
function styleVars(theme, { dark = false } = {}) {
  const c = derive(theme);

  /* Read by BOTH halves of the stylesheet: the light rules take --surface-from
     and the dark ones take --surface-dark-from, so the whole family travels
     whichever mode the preview is painting. Leaving the dark ones out meant a
     preview in dark mode showed the SAVED surfaces under the new brand. */
  const surfaces = {
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
    "--gold": c.gold,
    "--gold-light": c.goldLight,
    "--app-bg": c.bgLight,
    "--app-bg-dark": c.bgDark,
    "--brand-ink": c.ink,
    "--shadow-strength": String(theme.shadow),
  };

  /* The half that depends on which mode is on screen. Every name here is one
     the stylesheet redefines under .dark, so writing the wrong half inline is
     exactly what produced the half-lit hybrid described above. */
  const mode = dark
    ? {
        "--brand-primary": c.onDark,
        "--brand-dark": c.onDarkHover,
        "--brand-light": c.darkTint,
        "--brand-on-dark": c.onDark,
        "--brand-rgb": c.rgbOnDark,
        "--color-background": c.bgDark,
        "--color-primary": c.onDark,
        "--color-primary-hover": c.onDarkHover,
        "--color-primary-muted": c.darkTint,
        "--color-accent": c.onDark,
        "--color-ring": c.onDark,
        "--primary": c.hslOnDark,
        "--ring": c.hslOnDark,
        "--sidebar": c.sidebar.darkBg,
        "--sidebar-foreground": c.sidebar.darkFg,
        "--sidebar-primary": c.onDark,
        "--sidebar-primary-foreground": c.ink,
        "--sidebar-accent": c.sidebar.darkAccent,
        "--sidebar-accent-foreground": c.onDark,
        "--sidebar-border": c.sidebar.darkBorder,
        "--sidebar-ring": c.onDark,
      }
    : {
        "--brand-primary": c.primary,
        "--brand-dark": c.dark,
        "--brand-light": c.light,
        "--brand-on-dark": c.onDark,
        "--brand-rgb": c.rgb,
        "--color-primary": c.primary,
        "--color-primary-hover": c.dark,
        "--color-primary-muted": c.light,
        "--color-accent": c.primary,
        "--color-ring": c.primary,
        /* shadcn own tokens, as HSL channels — every plain <Button> reads these. */
        "--primary": c.hsl,
        "--ring": c.hsl,
        "--sidebar": c.sidebar.bg,
        "--sidebar-foreground": c.sidebar.fg,
        "--sidebar-primary": c.primary,
        "--sidebar-primary-foreground": "#ffffff",
        "--sidebar-accent": c.sidebar.accent,
        "--sidebar-accent-foreground": c.sidebar.accentFg,
        "--sidebar-border": c.sidebar.border,
        "--sidebar-ring": c.primary,
      };

  const vars = { ...surfaces, ...mode };

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

export default function ThemeField({
  locale = "ar",
  value = null,
  previewSelector = null,
  showBadges = true,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [theme, setTheme] = useState(() => normalizeTheme(value));
  const [live, setLive] = useState(false);

  const set = (key) => (next) => setTheme((prev) => ({ ...prev, [key]: next }));
  const colours = derive(theme);
  /* Which half of the theme the preview must write. See styleVars(): an
     inline style beats `.dark`, so writing the light palette while the page is
     dark produced a hybrid no saved theme could ever match. */
  const { resolvedTheme } = useTheme();
  const vars = styleVars(theme, { dark: resolvedTheme === "dark" });

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
    /* The element the preview paints. <html> for the platform's theme, the
       dashboard wrapper for a showroom's — the same element its saved CSS is
       scoped to, so the preview and the result cover the same pixels.

       Falls back to <html> when the selector matches nothing, which is the
       honest outcome for a preview: showing it somewhere is better than a
       switch that appears to do nothing. */
    const root =
      (previewSelector && document.querySelector(previewSelector)) || document.documentElement;

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
  }, [live, previewSelector, JSON.stringify(vars)]);

  const isDefault = Object.keys(THEME_DEFAULTS).every((k) => theme[k] === THEME_DEFAULTS[k]);
  /**
   * Whether this preset is what is currently set.
   *
   * The shape is compared too, but only where the preset states it. Without
   * that, "Simple" stayed ticked after somebody moved the Shadow slider back
   * to Default — the colours still matched, and the tick is the only thing
   * telling them which palette they are on.
   */
  const matches = (preset) =>
    preset.primary === theme.primary &&
    preset.bgLight === theme.bgLight &&
    preset.gold === theme.gold &&
    (preset.radius == null || preset.radius === theme.radius) &&
    (preset.shadow == null || preset.shadow === theme.shadow);

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
                  /* Only when the preset states them. A palette that is just a
                     colour must leave the corners and the shadows where the
                     admin set them — see the note on PRESETS. Spreading the
                     preset wholesale is what this avoids: the first one is
                     built from THEME_DEFAULTS and carries a `badges` key,
                     which would wipe every badge override. */
                  ...(preset.radius != null ? { radius: preset.radius } : {}),
                  ...(preset.shadow != null ? { shadow: preset.shadow } : {}),
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
      {showBadges ? (
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
      ) : null}

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
