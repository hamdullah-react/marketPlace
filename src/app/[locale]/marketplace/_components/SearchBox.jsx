"use client";

/**
 * A search box that writes to the URL.
 *
 * ── The URL is the state ────────────────────────────────────────────────────
 *
 * Not component state, and not a filter over the rows already on screen. Three
 * things follow from that and all three are the reason it is built this way:
 * a search can be bookmarked and sent to a colleague, Back undoes it, and the
 * FILTERING happens where the rows are — on the server, over all of them,
 * rather than over the current page. A box that quietly searches one page of a
 * list is worse than no box: it answers "not found" for a row that exists.
 *
 * ── On Enter, not on every keystroke ────────────────────────────────────────
 *
 * A param per keystroke is a server round trip per keystroke, and on a table it
 * is a database query per keystroke. The same decision LeadsTable made, for the
 * same reason — and it is why the placeholder says so out loud instead of
 * leaving somebody typing into a box that appears not to work.
 *
 * ── Typing is never interrupted ─────────────────────────────────────────────
 *
 * `box` is seeded from the URL once and then belongs to the input. Re-syncing it
 * from `searchParams` on every render would fight the person typing: a
 * transition that finishes mid-word would reset the field to the committed term
 * and eat the rest of what they were writing.
 */

import { startTransition, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";

export default function SearchBox({
  locale = "ar",
  /** The query param to write. `q` unless a page already uses it for something. */
  param = "q",
  placeholder = "",
  label = "",
  className = "",
  /** Cleared alongside the term — a page number from the previous search. */
  resets = ["page"],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [box, setBox] = useState(searchParams.get(param) ?? "");
  const [pending, setPending] = useState(false);

  const commit = (value) => {
    const params = new URLSearchParams(searchParams.toString());

    if (value) params.set(param, value);
    else params.delete(param);

    for (const key of resets) params.delete(key);

    const qs = params.toString();
    setPending(true);
    startTransition(() => {
      // scroll: false — a search that jumps to the top of the document loses
      // the table the person was looking at.
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      setPending(false);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit(box.trim());
      }}
      className={`relative ${className}`}
      role="search"
    >
      {pending ? (
        <Loader2 className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
      ) : (
        <Search className="pointer-events-none absolute start-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      )}

      <input
        type="search"
        value={box}
        onChange={(e) => setBox(e.target.value)}
        placeholder={placeholder || t("ابحث ثم Enter", "Search, then Enter")}
        aria-label={label || placeholder || t("ابحث", "Search")}
        className="w-full rounded-lg border border-gray-200 bg-white py-1.5 ps-8 pe-7 text-xs outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5"
      />

      {box ? (
        <button
          type="button"
          onClick={() => {
            setBox("");
            commit("");
          }}
          aria-label={t("مسح", "Clear")}
          className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-brand-primary"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </form>
  );
}
