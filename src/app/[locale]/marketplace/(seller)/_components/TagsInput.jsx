"use client";

/**
 * A tag box: chips you can add, remove and paste into.
 *
 * Lifted OUT of ListingForm, where it was a local function called
 * KeywordChips, because the storefront's SEO panel needs exactly this and a
 * second copy would be a second set of keyboard rules to keep in step — the
 * Enter/comma/Backspace behaviour below is the whole point of the component,
 * and two implementations of it drift silently.
 *
 * ── What it posts ───────────────────────────────────────────────────────────
 *
 * A hidden input holding JSON, because a native form action submits inputs and
 * a list is not a string. Both readers put it through keywordList(), which
 * accepts the array as well as the comma-separated text a hand-made post might
 * send, so the client cannot be the only thing standing between a paste and the
 * database.
 */

import { useState } from "react";
import { X } from "lucide-react";
import { keywordList } from "@/marketplace/lib/seo";

export default function TagsInput({
  name,
  value = [],
  onChange,
  suggestions = [],
  dir = "ltr",
  t = (ar, en) => en,
  placeholder,
}) {
  const [draft, setDraft] = useState("");

  const add = (raw) => {
    // Splitting on commas here too means a seller who pastes a list from a
    // spreadsheet gets chips, not one enormous keyword.
    const next = keywordList(raw).filter((k) => !value.includes(k));
    if (next.length) onChange([...value, ...next]);
    setDraft("");
  };

  const unused = suggestions.filter((k) => !value.includes(k));

  return (
    <div dir={dir}>
      <input type="hidden" name={name} value={JSON.stringify(value)} />

      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 py-1.5 focus-within:border-brand-primary focus-within:ring-2 focus-within:ring-brand-primary/20 dark:border-gray-600 dark:bg-[#1a1a1a]">
        {value.map((k) => (
          <span
            key={k}
            className="flex items-center gap-1 rounded-full bg-brand-primary/10 py-1 ps-2.5 pe-1 text-xs text-brand-primary"
          >
            {k}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== k))}
              className="rounded-full p-0.5 transition-colors hover:bg-brand-primary hover:text-white"
              aria-label={`${t("إزالة", "Remove")} ${k}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <input
          value={draft}
          dir={dir}
          onChange={(e) => {
            // Typing a comma commits the word, so the habit works. Both commas:
            // an Arabic keyboard produces ، and never ,.
            if (/[,،]/.test(e.target.value)) add(e.target.value);
            else setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(draft); }
            // Backspace on an empty box removes the last chip — standard for
            // every tag input, and the only way to fix a typo without reaching
            // for the mouse.
            else if (e.key === "Backspace" && !draft && value.length) onChange(value.slice(0, -1));
          }}
          /* A half-typed word left in the box when the seller presses Save is
             a keyword they meant to add. Committing it on blur is what stops
             it being silently thrown away. */
          onBlur={() => draft && add(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-sm outline-hidden"
        />
      </div>

      {unused.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-gray-400">{t("مقترحة:", "Suggested:")}</span>
          {unused.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange([...value, k])}
              className="rounded-full border border-dashed border-gray-300 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:border-brand-primary hover:text-brand-primary dark:border-gray-600"
            >
              + {k}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
