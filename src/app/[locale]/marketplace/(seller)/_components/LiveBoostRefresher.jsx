"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps a promotions view current without a reload.
 *
 * The seller shell's live socket (useLiveLeads) chimes when the platform team
 * decides a promotion and fires `marketplace:boost-changed`; this re-reads the
 * page so the new status, the Featured chip and the picker all update in place.
 *
 * Also catches up when the tab comes back to the front, for a socket that was
 * asleep in the background.
 */
export default function LiveBoostRefresher() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const onVisible = () => { if (document.visibilityState === "visible") router.refresh(); };

    window.addEventListener("marketplace:boost-changed", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("marketplace:boost-changed", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
