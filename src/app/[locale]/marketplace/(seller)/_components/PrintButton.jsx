"use client";

/**
 * Print, which is also how the receipt is downloaded.
 *
 * ── Why print and not a generated PDF ───────────────────────────────────────
 *
 * Every browser's print dialog offers "Save as PDF", so one button gives both
 * things that were asked for: a preview on screen and a file to keep. The
 * alternative is a PDF library on the server — a dependency, a font problem in
 * Arabic, and a second renderer to keep looking like the page. This prints the
 * document the seller is already looking at, which cannot disagree with it.
 *
 * Arabic PDFs made this an easy decision: the browser already shapes and lays
 * out RTL text correctly on this page, and a server-side generator would have to
 * be taught to, with an embedded font, or hand back mirrored gibberish.
 */

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PrintButton({ locale = "ar", label = null }) {
  const t = (ar, en) => (locale === "ar" ? ar : en);

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => window.print()}
      className="gap-1.5"
      // The button is chrome: it must not appear on the page it prints.
      data-print-hide
    >
      <Printer className="h-3.5 w-3.5" />
      {label ?? t("طباعة / حفظ PDF", "Print / Save as PDF")}
    </Button>
  );
}
