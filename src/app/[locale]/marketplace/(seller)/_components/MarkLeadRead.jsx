"use client";

/**
 * Reports that a lead was actually put on screen.
 *
 * Renders nothing. It exists because "read" is a claim about a human, and the
 * only place in the stack that knows a human saw something is the browser.
 *
 * ── Why not just mark it read in the page's server component ────────────────
 *
 * That is a write during render, and render is not a thing that happens once:
 *
 *   · React may render a tree twice, and does in development;
 *   · Next PREFETCHES a link on hover, which renders the page for someone who
 *     never clicked — so hovering over Open in the table would empty the badge
 *     for a lead nobody opened;
 *   · a failed write during render has nowhere to go but the error boundary,
 *     taking the whole page down over a bookkeeping detail.
 *
 * So the page stays read-only and this fires afterwards, from the client, once
 * the lead is genuinely on a screen.
 *
 * ── Failure is silent, on purpose ───────────────────────────────────────────
 *
 * The seller is here to read a lead. If the mark does not land, the lead still
 * shows and the badge is stale until the next one — which is a smaller problem
 * than an error banner across a page that is working perfectly.
 */

import { useEffect, useRef } from "react";
import { markLeadRead } from "../_actions/leads";

export default function MarkLeadRead({ leadId, vendorId, alreadyRead = false }) {
  // Once per mount. Without the guard a re-render — and the action's own
  // revalidate causes one — would fire it again; harmless at the database,
  // since the update filters on read_at being null, but a wasted round trip
  // every time React re-runs the effect.
  const sent = useRef(false);

  useEffect(() => {
    if (alreadyRead || sent.current || !leadId) return;
    sent.current = true;

    const fd = new FormData();
    fd.set("leadId", leadId);
    if (vendorId) fd.set("vendorId", vendorId);

    // Not awaited into any state — nothing on this page changes when it
    // succeeds. The event is for the sidebar badge, which sits in the layout
    // above this page and so is not re-rendered by the action's revalidate.
    markLeadRead(null, fd)
      .then((res) => {
        if (!res?.ok || res.alreadyRead) return;
        window.dispatchEvent(new CustomEvent("marketplace:leads-read"));
      })
      .catch(() => {});
  }, [leadId, vendorId, alreadyRead]);

  return null;
}
