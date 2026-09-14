"use client";

/**
 * The price control, drawn like the main site's RangeSlider
 * (MyComponents/AllCars/types/RangeSlider.jsx):
 *
 *   ┌─────────────────────────────────────────┐
 *   │      ●━━━━━━━━━━━━━━━━━━━●              │  18px gradient thumbs,
 *   │                                         │  white ring, 3px track
 *   │  [−] [ ﷼ 35,000 ] [+]   [−] [ ﷼ 90,000 ] [+]
 *   └─────────────────────────────────────────┘
 *
 * The stepper buttons matter more than they look. Dragging a handle across a
 * range that spans a hundred thousand riyals cannot land on a round number,
 * and "from 87,000" is not a price anybody meant to ask for — the ± buttons
 * are how you say the number you actually had in mind.
 *
 * ── Local state, committed on release ───────────────────────────────────────
 *
 * The handles track the drag locally so they move under the finger, and only
 * the RELEASE writes to the URL. Committing on every value change would be a
 * navigation per pixel.
 */

import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";

export default function RangeSlider({
  min = 0,
  max = 0,
  step = 1000,
  value,
  onCommit,
  locale = "ar",
}) {
  const isAr = locale === "ar";

  /* The URL is the source of truth, but a drag has to move the handles before
     the server answers. So the committed value seeds local state and re-seeds
     it whenever the URL changes underneath — which is what makes "Reset All"
     put the handles back rather than leaving them where they were dragged.

     Re-seeded DURING RENDER rather than from an effect. This is React's
     documented "adjusting state when a prop changes" pattern: compare against
     the last committed value, and if it moved, set both before returning.
     React discards the render it is in the middle of and immediately re-runs
     with the new state, so nothing is painted with the stale handles — whereas
     an effect paints the old positions once, then corrects them, which is a
     visible jump back to where the handles were dragged before Reset All takes
     hold. */
  const seed = clamp(value, min, max);
  const [seenValue, setSeenValue] = useState(seed);
  const [local, setLocal] = useState(seed);

  if (seenValue[0] !== seed[0] || seenValue[1] !== seed[1]) {
    setSeenValue(seed);
    setLocal(seed);
  }

  const [lo, hi] = local;

  const commit = (next) => {
    const safe = clamp(next, min, max);
    setLocal(safe);
    onCommit(safe);
  };

  const nudge = (index, delta) => {
    const next = [...local];
    next[index] = next[index] + delta;
    // Handles may meet but not cross — a minimum above the maximum is a range
    // that cannot contain anything.
    if (index === 0) next[0] = Math.min(next[0], next[1]);
    else next[1] = Math.max(next[1], next[0]);
    commit(next);
  };

  const fmt = (n) => Number(n || 0).toLocaleString(isAr ? "ar-SA" : "en-US");

  const stepper = (onClick, label, children) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-5 w-5 items-center justify-center rounded-xl border-2 border-brand-primary bg-white shadow-xs transition-all duration-75 hover:scale-105 hover:bg-brand-primary/10 hover:shadow-md dark:bg-[#1a1a1a]"
    >
      {children}
    </button>
  );

  const readout = (n) => (
    <div className="mx-1 rounded-xl border border-gray-200 bg-linear-to-r from-gray-50 to-gray-100 px-3 py-1.5 text-center shadow-xs dark:border-white/10 dark:from-white/5 dark:to-white/10">
      <span className="flex items-center justify-center gap-1 text-[10px] font-bold text-brand-primary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/Currency.svg" alt="" className="h-3 w-3" />
        {fmt(n)}
      </span>
    </div>
  );

  return (
    <div
      dir={isAr ? "rtl" : "ltr"}
      className="rounded-2xl bg-white p-4 shadow-[0_4px_16px_rgba(70,25,79,0.08)] dark:bg-[#1a1a1a]"
    >
      <div className="relative mb-4 h-10">
        <div className="absolute inset-x-0 top-5">
          <SliderPrimitive.Root
            min={min}
            max={max}
            step={step}
            value={local}
            onValueChange={setLocal}
            onValueCommit={commit}
            dir={isAr ? "rtl" : "ltr"}
            aria-label={isAr ? "نطاق السعر" : "Price range"}
            className="relative flex h-5 w-full touch-none select-none items-center"
          >
            <SliderPrimitive.Track className="relative h-[3px] grow rounded-full bg-gray-300 shadow-xs dark:bg-white/20">
              <SliderPrimitive.Range className="absolute h-[3px] rounded-full bg-linear-to-r from-brand-primary to-brand-primary/90 shadow-xs transition-all duration-75" />
            </SliderPrimitive.Track>

            <SliderPrimitive.Thumb
              aria-label={isAr ? "الحد الأدنى للسعر" : "Minimum price"}
              className="block h-[18px] w-[18px] cursor-pointer rounded-full border-2 border-white bg-linear-to-r from-brand-primary to-brand-primary/90 shadow-md transition-all duration-75 hover:scale-110 focus:outline-hidden focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-2"
            />
            <SliderPrimitive.Thumb
              aria-label={isAr ? "الحد الأقصى للسعر" : "Maximum price"}
              className="block h-[18px] w-[18px] cursor-pointer rounded-full border-2 border-white bg-linear-to-r from-brand-primary to-brand-primary/90 shadow-md transition-all duration-75 hover:scale-110 focus:outline-hidden focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-2"
            />
          </SliderPrimitive.Root>
        </div>
      </div>

      <div className="mt-4 flex justify-between text-xs">
        <div className="flex items-center">
          {stepper(() => nudge(0, -step), isAr ? "تقليل الحد الأدنى" : "Decrease minimum",
            <Minus size={10} strokeWidth={4} className="text-brand-primary" />)}
          {readout(lo)}
          {stepper(() => nudge(0, step), isAr ? "زيادة الحد الأدنى" : "Increase minimum",
            <Plus size={10} strokeWidth={4} className="text-brand-primary" />)}
        </div>

        <div className="flex items-center">
          {stepper(() => nudge(1, -step), isAr ? "تقليل الحد الأقصى" : "Decrease maximum",
            <Minus size={10} strokeWidth={4} className="text-brand-primary" />)}
          {readout(hi)}
          {stepper(() => nudge(1, step), isAr ? "زيادة الحد الأقصى" : "Increase maximum",
            <Plus size={10} strokeWidth={4} className="text-brand-primary" />)}
        </div>
      </div>
    </div>
  );
}

/** Both ends inside the track, and the low end never above the high one. */
function clamp(value, min, max) {
  const lo = Number.isFinite(Number(value?.[0])) ? Number(value[0]) : min;
  const hi = Number.isFinite(Number(value?.[1])) ? Number(value[1]) : max;
  const a = Math.min(Math.max(lo, min), max);
  const b = Math.min(Math.max(hi, min), max);
  return [Math.min(a, b), Math.max(a, b)];
}
