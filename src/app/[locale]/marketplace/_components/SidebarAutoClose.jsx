"use client";

/**
 * On a phone, opening a page closes the sidebar.
 *
 * ── Why this is one component and not thirty onClick handlers ───────────────
 *
 * The sidebar on mobile is a Sheet, and it does not close itself: tapping a
 * link navigated the page UNDERNEATH a panel that stayed open over it, so the
 * dashboard looked like it had ignored the tap. Every entry needed the same
 * handler — two nav groups, their submenus, the footer and the brand mark in
 * both shells — and the one that gets forgotten is the one a seller taps.
 *
 * Watching the PATHNAME instead covers all of them at once, and covers the ones
 * a handler could not: a redirect from a server action, the browser's back
 * button, a link inside the page body.
 *
 * ── Desktop is untouched ────────────────────────────────────────────────────
 *
 * `isMobile` guards it, so the pinned sidebar on a laptop does not collapse
 * every time somebody navigates — there it is furniture, not an overlay.
 *
 * Must be rendered INSIDE SidebarProvider; useSidebar() throws otherwise.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSidebar } from "@/components/ui/sidebar";

export default function SidebarAutoClose() {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  useEffect(() => {
    /* Closing an overlay in response to the route changing is synchronising
       one external system (a floating panel) with another (the router) — which
       is what an effect is for. It is not derived state. */
    if (isMobile) setOpenMobile(false);
  }, [pathname, isMobile, setOpenMobile]);

  return null;
}
