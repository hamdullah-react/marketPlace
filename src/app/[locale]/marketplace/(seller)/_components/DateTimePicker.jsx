"use client";

/**
 * A date-and-time picker, in a popover.
 *
 * Replaces `<input type="datetime-local">`, which looked like a different
 * control in every browser, ignored the dashboard's styling entirely, and gave
 * an Arabic seller a Gregorian widget in whatever language their OS is in.
 *
 * ── Built on the primitives, not on react-day-picker ────────────────────────
 *
 * shadcn's own DatePicker is Popover + Calendar, and its Calendar is a wrapper
 * around react-day-picker — which this project does not have installed and
 * nothing else needs. A month grid is thirty lines of date-fns, which is
 * already a dependency, so the popover, the trigger button and the styling are
 * shadcn's and only the grid is ours. Adding a library to render 42 buttons is
 * not a trade worth making.
 *
 * ── Why the time is here at all ─────────────────────────────────────────────
 *
 * An offer that ends "on Friday" ends at a moment, and that moment decides
 * whether a car is still discounted at nine in the evening. The date is the
 * decision; the time defaults to the start or end of the day so nobody has to
 * think about it, and is there when somebody does.
 */

import { useState } from "react";
import {
  addMonths, endOfMonth, format, isSameDay, isSameMonth,
  startOfDay, startOfMonth, startOfWeek, addDays, endOfWeek,
} from "date-fns";
import { ar as arLocale, enGB } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

/** "YYYY-MM-DDTHH:mm" in LOCAL time — what the server action parses. */
function toLocalValue(date) {
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export default function DateTimePicker({
  name,
  value,
  onChange,
  locale = "ar",
  placeholder,
  // Where the clock starts when a day is picked and no time has been set.
  // An offer STARTS at 00:00 and ENDS at 23:59 — the two ends of the day a
  // seller means when they name one.
  defaultTime = "00:00",
  invalid = false,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const fns = isAr ? arLocale : enGB;

  const selected = value ? new Date(value) : null;
  const valid = selected && !Number.isNaN(selected.getTime());

  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(valid ? startOfMonth(selected) : startOfMonth(new Date()));

  /* Six weeks, always. A grid that is five rows one month and six the next
     makes the popover jump as you page through it. */
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: isAr ? 6 : 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: isAr ? 6 : 1 });
  const days = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  while (days.length < 42) days.push(addDays(days[days.length - 1], 1));

  const today = startOfDay(new Date());

  const pickDay = (day) => {
    const [h, m] = (valid ? format(selected, "HH:mm") : defaultTime).split(":");
    const next = new Date(day);
    next.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    onChange?.(toLocalValue(next));
  };

  const pickTime = (hhmm) => {
    const [h, m] = hhmm.split(":");
    const base = valid ? new Date(selected) : new Date();
    base.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    onChange?.(toLocalValue(base));
  };

  return (
    <div className="relative">
      {/* The form reads this, not the popover. */}
      <input type="hidden" name={name} value={value ?? ""} />

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={`w-full justify-start gap-2 font-normal ${
              invalid ? "border-red-400 dark:border-red-500" : ""
            } ${valid ? "" : "text-muted-foreground"}`}
          >
            <CalendarIcon className="h-4 w-4 shrink-0" />
            {valid
              ? format(selected, "d MMMM yyyy — HH:mm", { locale: fns })
              : placeholder || t("اختر تاريخاً", "Pick a date")}
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-3" align="start">
          {/* ── Month header ──────────────────────────────────────────────── */}
          <div className="mb-2 flex items-center justify-between gap-2">
            <Button
              type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setCursor(addMonths(cursor, -1))}
              aria-label={t("الشهر السابق", "Previous month")}
            >
              {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>

            <span className="text-sm font-semibold">
              {format(cursor, "MMMM yyyy", { locale: fns })}
            </span>

            <Button
              type="button" variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => setCursor(addMonths(cursor, 1))}
              aria-label={t("الشهر التالي", "Next month")}
            >
              {isAr ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>

          {/* ── Weekday row ───────────────────────────────────────────────── */}
          <div className="grid grid-cols-7 gap-0.5">
            {days.slice(0, 7).map((d) => (
              <div
                key={`h-${d.toISOString()}`}
                className="py-1 text-center text-[11px] font-medium text-muted-foreground"
              >
                {format(d, "EEEEE", { locale: fns })}
              </div>
            ))}

            {/* ── The days ────────────────────────────────────────────────── */}
            {days.map((d) => {
              const outside = !isSameMonth(d, cursor);
              const isSelected = valid && isSameDay(d, selected);
              const isToday = isSameDay(d, today);

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => pickDay(d)}
                  className={`h-8 w-8 rounded-md text-sm tabular-nums transition-colors ${
                    isSelected
                      ? "bg-brand-primary font-semibold text-white"
                      : outside
                        ? "text-muted-foreground/40 hover:bg-gray-100 dark:hover:bg-white/10"
                        : "hover:bg-gray-100 dark:hover:bg-white/10"
                  } ${isToday && !isSelected ? "ring-1 ring-brand-primary/40" : ""}`}
                >
                  {format(d, "d", { locale: fns })}
                </button>
              );
            })}
          </div>

          {/* ── The time, and the way out ─────────────────────────────────── */}
          <div className="mt-3 flex items-center gap-2 border-t pt-3 dark:border-white/10">
            <input
              type="time"
              dir="ltr"
              value={valid ? format(selected, "HH:mm") : defaultTime}
              onChange={(e) => pickTime(e.target.value)}
              className="rounded-md border px-2 py-1 text-sm dark:border-white/10 dark:bg-white/5"
            />

            {valid ? (
              <Button
                type="button" variant="ghost" size="sm"
                className="gap-1 text-xs"
                onClick={() => { onChange?.(""); setOpen(false); }}
              >
                <X className="h-3 w-3" />
                {t("مسح", "Clear")}
              </Button>
            ) : null}

            <Button
              type="button" size="sm" className="ms-auto text-xs"
              onClick={() => setOpen(false)}
            >
              {t("تم", "Done")}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
