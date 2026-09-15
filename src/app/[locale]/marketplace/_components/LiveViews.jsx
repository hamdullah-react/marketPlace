"use client";

/**
 * The live header of the Most viewed row: a pulsing "Live" badge and the total
 * views across the cars shown — and the thing that keeps every count current.
 *
 * Reads `listings.views` for just these ids through the public client
 * (listings_public_read allows any live row), every 15 seconds while the tab is
 * visible and again the moment it comes back. Results go into viewsStore, so
 * the cards update in place with no reload and no server render.
 */

import { useEffect, useSyncExternalStore } from "react";
import { Eye } from "lucide-react";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";
import { subscribeViews, getViews, getServerViews, setViews } from "./viewsStore";

const EVERY_MS = 15000;

export default function LiveViews({ locale = "ar", initial = [] }) {
  const isAr = locale === "ar";
  const store = useSyncExternalStore(subscribeViews, getViews, getServerViews);

  // A primitive dependency: the same cars with the same starting counts should
  // not restart the poll just because the parent built a new array.
  const seed = initial.map((r) => `${r.id}:${Number(r.views ?? 0)}`).join(",");

  useEffect(() => {
    const pairs = seed ? seed.split(",").map((p) => p.split(":")) : [];
    const ids = pairs.map(([id]) => id);
    if (!ids.length) return undefined;

    setViews(pairs.map(([id, n]) => [id, Number(n)]));

    let stopped = false;
    const pull = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data, error } = await getMarketplaceAuthClient()
          .from("listings")
          .select("id, views")
          .in("id", ids);
        if (!stopped && !error && data) setViews(data.map((r) => [r.id, r.views]));
      } catch {
        // Offline — the numbers on screen stay as they are.
      }
    };

    pull();
    const timer = setInterval(pull, EVERY_MS);
    document.addEventListener("visibilitychange", pull);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pull);
    };
  }, [seed]);

  const total = initial.reduce(
    (sum, r) => sum + Math.max(Number(r.views ?? 0), store.get(r.id) ?? 0),
    0
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="raised inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        {isAr ? "مباشر" : "Live"}
      </span>

      <span className="raised inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold tabular-nums">
        <Eye className="h-3.5 w-3.5 text-brand-primary" aria-hidden="true" />
        {/* Keyed on the value so the pop animation replays on every change. */}
        <span key={total} className="count-pop inline-block">
          {total.toLocaleString(isAr ? "ar-SA" : "en")}
        </span>
        {isAr ? "مشاهدة" : "total views"}
      </span>
    </div>
  );
}
