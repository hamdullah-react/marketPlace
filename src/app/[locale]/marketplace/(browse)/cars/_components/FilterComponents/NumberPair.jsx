"use client";

/**
 * A from/to pair of number boxes, shared by price and year.
 *
 * Committed on blur and on Enter, never on change. Every commit here is a
 * navigation and a re-query, so committing per keystroke would fire four
 * queries behind a four-figure price and three of them would be for numbers
 * the buyer was still in the middle of typing.
 *
 * `defaultValue`, not `value`: the box is uncontrolled between commits, which
 * is what lets someone clear it and retype without the URL fighting them for
 * the caret.
 */

import { Input } from "@/components/ui/input";

export default function NumberPair({
  minValue = "",
  maxValue = "",
  minPlaceholder = "",
  maxPlaceholder = "",
  step = 1,
  onMinCommit,
  onMaxCommit,
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        step={step}
        defaultValue={minValue}
        placeholder={minPlaceholder}
        onBlur={(e) => onMinCommit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onMinCommit(e.currentTarget.value)}
        className="h-10 rounded-lg tabular-nums"
      />

      <span className="text-gray-400">–</span>

      <Input
        type="number"
        step={step}
        defaultValue={maxValue}
        placeholder={maxPlaceholder}
        onBlur={(e) => onMaxCommit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onMaxCommit(e.currentTarget.value)}
        className="h-10 rounded-lg tabular-nums"
      />
    </div>
  );
}
