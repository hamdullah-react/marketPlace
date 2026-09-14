"use client";

/**
 * The specification section, in the SAME two blocks the main site's car page
 * renders (MyComponents/Car-Details-page/car-overview.jsx):
 *
 *   1. "Car Information" — a card with a purple gradient header bar, holding a
 *      2/3/4/6-column grid of key-spec tiles: white icon box, label, value.
 *   2. "Car Specifications" — a white card holding a TWO-COLUMN grid of
 *      category accordions. A closed header is a grey-to-white gradient; an
 *      open one turns purple-to-brand-dark with white text, and its chevron
 *      flips up. Inside, specs render as tiles two across.
 *
 * Matched band for band rather than reinterpreted: a buyer moving between
 * alromaihcars.com and the marketplace should not be able to tell that the
 * second one is a different application.
 *
 * ONE deliberate difference: no fallback icon. The main site points a broken or
 * missing icon at /icons/spec-default.svg; here the icon box is simply omitted.
 * A stand-in mark reads as a real icon that happens to be wrong, and it hides
 * the gap from the only person who can fill it. `premium-card` is carried over
 * as a hook but has no CSS on either side.
 *
 * Client only because the categories collapse. Labels, units and values are all
 * resolved on the server — this ships markup and a toggle, not a formatter.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Check, X, Sparkles } from "lucide-react";

/**
 * Categories open on arrival.
 *
 * The main site opens all of them. Past a handful that turns the page into a
 * wall of tiles, so the tail starts closed — the sheet is still one click from
 * complete, and nothing is hidden that a buyer did not choose to hide.
 */
const OPEN_BY_DEFAULT = 4;

/**
 * Values that mean "this car does not have it" — filtered out of the key-spec
 * strip, exactly as the main site does. A tile reading "Sunroof — No" spends a
 * slot in a six-wide row saying nothing.
 */
const EMPTY_VALUES = new Set(["no", "none", "n/a", "لا", "-", "0", ""]);

export default function SpecSheet({ sheet = [], keySpecs = [], locale = "ar" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [open, setOpen] = useState(() =>
    new Set(sheet.slice(0, OPEN_BY_DEFAULT).map((g) => g.key))
  );

  const toggle = (key) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!sheet.length) return null;

  /**
   * A yes/no spec is NOT a boolean upstream — each such attribute owns four
   * options (Yes, No, Available, Not Available), because "this car has no
   * sunroof" and "this trim does not offer one" are different answers. Only a
   * genuinely stored boolean gets a tick or a cross.
   */
  const isYesNo = (item) =>
    item.boolean ||
    item.displayType === "yesno" ||
    ["yes", "no", "نعم", "لا"].includes(String(item.value ?? "").trim().toLowerCase());

  /**
   * A spec the car answers SEVERAL times — driving modes, safety features —
   * renders as a ticked list, not a comma-separated sentence.
   *
   * `values` is populated by the query layer only when there is genuinely more
   * than one answer, so this branch cannot dress a plain value up as a choice.
   * A buyer scanning for "does it have Sport Mode" finds a row to run an eye
   * down instead of a paragraph to read.
   */
  const renderList = (values) => (
    <ul className="space-y-1 text-start">
      {values.map((v) => (
        <li key={v} className="flex items-start gap-1.5">
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-600" />
          <span className="font-medium text-gray-800 dark:text-gray-200">{v}</span>
        </li>
      ))}
    </ul>
  );

  const renderValue = (item) => {
    if (item.values?.length) return renderList(item.values);

    if (isYesNo(item)) {
      const yes =
        item.value === true ||
        ["true", "yes", "نعم"].includes(String(item.value ?? "").trim().toLowerCase());
      return yes ? (
        <Check className="h-5 w-5 text-green-600" />
      ) : (
        <X className="h-5 w-5 text-red-500" />
      );
    }
    return (
      <>
        {item.value}
        {item.unit ? <span className="text-gray-500"> ({item.unit})</span> : null}
      </>
    );
  };

  const shownKeySpecs = keySpecs.filter(
    (s) => !EMPTY_VALUES.has(String(s.value ?? "").trim().toLowerCase())
  );

  return (
    <div className="mt-12 space-y-6 sm:space-y-8">
      {/* ── Car Information ─────────────────────────────────────────────── */}
      {shownKeySpecs.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-brand-primary/10 bg-linear-to-br from-white to-brand-light/30 shadow-lg transition-all duration-300 hover:shadow-xl dark:border-white/10 dark:from-[#161616] dark:to-[#1c1420]">
          <div className="pb-6 pt-6 sm:pb-8 sm:pt-8">
            <div className="relative mx-3 mb-5 rounded-xl bg-linear-to-r from-brand-primary to-brand-dark p-4 shadow-md sm:mx-6 sm:mb-6">
              <h2 className="flex items-center text-lg font-bold text-white sm:text-xl">
                <Sparkles className={`h-5 w-5 ${isAr ? "ml-2" : "mr-2"}`} />
                {t("معلومات السيارة", "Car Information")}
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-2 px-3 py-3 sm:grid-cols-3 sm:gap-3 sm:px-4 sm:py-4 md:gap-4 md:px-6 lg:grid-cols-4 xl:grid-cols-6">
              {shownKeySpecs.map((item) => (
                <div
                  key={item.id}
                  className="premium-card flex flex-col items-center rounded-xl border border-brand-primary/5 bg-linear-to-br from-white to-brand-light/20 p-3 text-center shadow-xs transition-all hover:border-brand-primary/20 hover:shadow-md sm:p-4 dark:border-white/5 dark:from-[#1c1c1c] dark:to-[#221a26]"
                >
                  {item.icon ? (
                    <div className="raised-card mb-2 shrink-0 rounded-xl p-2 sm:mb-3 sm:p-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.icon}
                        alt=""
                        loading="lazy"
                        className="h-5 w-5 object-contain sm:h-6 sm:w-6"
                      />
                    </div>
                  ) : null}

                  <div className="w-full">
                    <div className="mb-1 line-clamp-2 flex min-h-8 items-center justify-center text-xs text-gray-500 dark:text-gray-400">
                      {item.label}
                    </div>
                    {/* A tile is one line tall by design, so a multi-answer
                        spec left-aligns its ticked list rather than trying to
                        centre a ragged column. */}
                    <div
                      className={`flex text-xs font-bold text-brand-primary ${
                        item.values?.length ? "justify-start" : "items-center justify-center"
                      }`}
                    >
                      {renderValue(item)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Car Specifications ──────────────────────────────────────────── */}
      <div className="raised-card overflow-hidden rounded-xl">
        <div className="pb-6 pt-6">
          <div className="mb-5 px-4 sm:mb-6 sm:px-6">
            <h2 className="flex items-center text-lg font-semibold text-gray-900 dark:text-gray-100">
              <Sparkles className={`h-5 w-5 text-brand-primary ${isAr ? "ml-2" : "mr-2"}`} />
              {t("صفات السيارة", "Car Specifications")}
            </h2>
          </div>

          {/* Two columns from lg, so a long sheet reads as two short ones. */}
          <div className="grid grid-cols-1 gap-3 px-4 sm:px-6 lg:grid-cols-2">
            {sheet.map((group) => {
              const isExpanded = open.has(group.key);

              return (
                <div
                  key={group.key}
                  className="raised-card h-fit overflow-hidden rounded-xl"
                >
                  <button
                    type="button"
                    onClick={() => toggle(group.key)}
                    aria-expanded={isExpanded}
                    className={`relative flex w-full items-center justify-between p-4 transition-all ${
                      isExpanded
                        ? "bg-linear-to-r from-brand-primary to-brand-dark text-white"
                        : "bg-linear-to-r from-gray-50 to-white hover:from-brand-light/10 hover:to-white dark:from-[#1c1c1c] dark:to-[#161616]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {group.icon ? (
                        <span
                          className={`rounded-xl border p-2 sm:p-3 ${
                            isExpanded
                              ? "border-white/30 bg-white/20"
                              : "border-gray-200 bg-white dark:border-white/10 dark:bg-[#252525]"
                          }`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={group.icon}
                            alt=""
                            loading="lazy"
                            className="h-4 w-4 object-contain sm:h-5 sm:w-5"
                          />
                        </span>
                      ) : null}

                      <span className={isAr ? "text-right" : "text-left"}>
                        <span
                          className={`text-sm font-medium ${
                            isExpanded ? "text-white" : "text-gray-900 dark:text-gray-100"
                          }`}
                        >
                          {group.name}
                        </span>
                      </span>
                    </div>

                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 shrink-0 text-white" />
                    ) : (
                      <ChevronDown className="h-5 w-5 shrink-0 text-gray-400" />
                    )}
                  </button>

                  {isExpanded ? (
                    <div className="raised-card border-t-0">
                      <div className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-2 sm:gap-3 sm:px-4 sm:py-4 md:px-6">
                        {group.items.map((item) => {
                          const yesNo = isYesNo(item);

                          return (
                            <div
                              key={item.id}
                              className={`premium-card flex gap-2 rounded-xl border border-brand-primary/5 bg-linear-to-br from-white to-brand-light/20 p-3 shadow-xs transition-all hover:border-brand-primary/20 hover:shadow-md sm:gap-3 sm:p-4 dark:border-white/5 dark:from-[#1c1c1c] dark:to-[#221a26] ${
                                item.values?.length ? "items-start" : "items-center"
                              }`}
                            >
                              {/* No icon box on a yes/no row — the tick or the
                                  cross IS the mark, and two glyphs on one line
                                  read as a contradiction. Same rule as the main
                                  site. */}
                              {!yesNo && item.icon ? (
                                <div className="raised-card flex shrink-0 items-center justify-center rounded-xl p-2">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={item.icon}
                                    alt=""
                                    loading="lazy"
                                    className="h-5 w-5 object-contain"
                                  />
                                </div>
                              ) : null}

                              <div className="min-w-0 flex-1">
                                <div className="line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                                  {item.label}
                                </div>
                                <div
                                  className={`mt-0.5 text-sm font-bold text-brand-primary ${
                                    item.values?.length ? "" : "flex items-center"
                                  }`}
                                >
                                  {renderValue(item)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
