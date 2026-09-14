"use client";

/**
 * One candidate palette, wrapped around whatever is rendered inside it.
 *
 * ── Why this works at all ───────────────────────────────────────────────────
 *
 * Because the brand is a CSS VARIABLE, not a hex typed into components.
 * globals.css declares `text-brand-primary`, `bg-brand-primary` and friends as
 * @utility rules that read var(--brand-primary), so re-declaring that variable
 * on any ancestor recolours everything beneath it — including the real
 * ListingCard, unmodified, with its real props.
 *
 * That is the whole point of this page: the cards below are not mock-ups drawn
 * to look like the card. They ARE the card, the same component the cars grid
 * renders, sitting in three different variable scopes.
 *
 * ── The five variables ──────────────────────────────────────────────────────
 *
 *   --brand-primary   the colour itself
 *   --brand-light     its pale tint, for selected chips and subtle fills
 *   --brand-on-dark   the same brand, lightened enough to read on near-black
 *   --brand-rgb       the same colour as three numbers, for tinted shadows
 *   --gold            the accent — offers, deals, anything flagged
 *
 * Change those five and the theme changes. Everything on this page is a
 * demonstration of that claim rather than an assertion of it.
 */

import { useState } from "react";

export default function PaletteSpecimen({ palette, children, locale = "ar" }) {
  const isEnglish = locale === "en";
  const [dark, setDark] = useState(false);

  return (
    <section className="flex flex-col gap-3">
      {/* ── Identity ───────────────────────────────────────────────────── */}
      <header className="flex items-baseline gap-2">
        <span
          className="shrink-0 rounded border px-1.5 py-px font-mono text-[11px] font-medium"
          style={{ color: palette.primary, borderColor: palette.primary }}
        >
          {palette.key}
        </span>
        <h2 className="text-base font-bold tracking-tight text-neutral-900 dark:text-neutral-50">
          {isEnglish ? palette.nameEn : palette.nameAr}
        </h2>
      </header>

      <p className="-mt-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
        {isEnglish ? palette.noteEn : palette.noteAr}
      </p>

      {/* ── The ramp ─────────────────────────────────────────────────────
          Widths weighted by how much of the UI each role actually owns, so
          the strip reads as a palette in use rather than six equal chips. */}
      <div className="grid h-12 overflow-hidden rounded-lg" style={{ gridTemplateColumns: "2fr 1fr 1fr 1.1fr 1.4fr 1fr" }}>
        {[palette.primary, palette.hover, palette.onDark, palette.tint, palette.gold, palette.goldLight].map((c) => (
          <span key={c} style={{ background: c }} />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
        {[
          [palette.primary, "primary"],
          [palette.hover, "hover"],
          [palette.onDark, "on-dark"],
          [palette.tint, "tint"],
          [palette.gold, "gold"],
          [palette.goldLight, "gold lt"],
        ].map(([hex, role]) => (
          <span key={role} className="whitespace-nowrap">
            <b className="font-medium text-neutral-700 dark:text-neutral-300">{hex.replace("#", "")}</b> {role}
          </span>
        ))}
      </div>

      {/* ── Light / dark for this column only ─────────────────────────────
          Per-column rather than one switch for the page: the value most
          likely to disappoint is --brand-on-dark, and comparing three of
          those at once is exactly what this page is for. */}
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        aria-pressed={dark}
        className="self-start rounded-full border border-neutral-300 px-3 py-1 text-[11px] font-semibold text-neutral-600 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-white/5"
      >
        {dark
          ? isEnglish ? "On dark ✓" : "على داكن ✓"
          : isEnglish ? "On light" : "على فاتح"}
      </button>

      {/* ── The real card, in this palette ────────────────────────────────
          `dark` here is the class the ThemeProvider would set on <html>;
          scoping it to this box lets one column preview dark mode without
          the other two following it. */}
      <div
        className={dark ? "dark rounded-2xl bg-[#0a0a0a] p-3" : "rounded-2xl bg-neutral-50 p-3"}
        style={{
          "--brand-primary": dark ? palette.onDark : palette.primary,
          "--brand-light": dark ? "#1f2a24" : palette.tint,
          "--brand-dark": palette.hover,
          "--brand-on-dark": palette.onDark,
          "--brand-rgb": dark ? palette.onDarkRgb : palette.rgb,
          "--gold": dark ? palette.goldLight : palette.gold,
          "--gold-light": palette.goldLight,
        }}
      >
        {children}
      </div>
    </section>
  );
}
