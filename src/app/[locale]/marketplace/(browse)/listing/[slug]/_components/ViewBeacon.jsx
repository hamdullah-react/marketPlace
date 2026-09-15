"use client";

import { useEffect } from "react";
import { recordView } from "../_actions/view";
import { bumpViews } from "../../../../_components/viewsStore";

/**
 * Sends one view for this car, once per tab session — refreshing the page or
 * coming back to it in the same tab does not count again.
 */
export default function ViewBeacon({ listingId }) {
  useEffect(() => {
    if (!listingId) return;

    const key = `mp:viewed:${listingId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Storage blocked (private mode): count it anyway.
    }

    // Counted in the shared store too, so going Back to a page that shows
    // this car's views shows the new number straight away.
    recordView(listingId).then(() => bumpViews(listingId)).catch(() => {});
  }, [listingId]);

  return null;
}
