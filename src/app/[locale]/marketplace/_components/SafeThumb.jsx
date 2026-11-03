"use client";

import Img from '@/marketplace/ui/Img';
import { useState } from "react";
import { THUMB } from "@/marketplace/lib/image";

/**
 * A small thumbnail that never stays broken.
 *
 * ── thumbUrl() is deliberately NOT used here ────────────────────────────────
 *
 * It used to be, and it was the same mistake MediaGallery already carries a
 * note about: `Img` IS next/image, and thumbUrl() returns a ready-made
 * `/_next/image?url=…&w=128&q=75` string. Handing that to next/image asks the
 * optimiser to optimise its own output — the src is then a LOCAL path carrying
 * a query string, which Next 16 refuses unless it is listed in
 * `images.localPatterns`:
 *
 *   Image with src "/_next/image?url=…&w=128&q=75" is using a query string
 *   which is not configured in images.localPatterns
 *
 * The right answer is not to add that config — that would authorise the double
 * pass rather than stop it. It is to hand next/image the ORIGINAL url and let
 * it do the one resize it was always going to do, which is what `width` and
 * `height` below are for.
 *
 * ── The fallback is still the point of this component ───────────────────────
 *
 * A resize has to download the original before it can shrink it, and a
 * seller's phone photo is often 3–4 MB — measured at 8 seconds, past the
 * optimiser's upstream timeout. The first request for such a photo fails, and
 * a plain thumbnail would show a broken icon until somebody reloaded after the
 * cache warmed.
 *
 * So on error it retries the SAME url with the optimiser switched off, which
 * serves the file directly from storage and always loads. Heavier, and the
 * only version that is guaranteed to appear. If that fails too the empty
 * placeholder is shown rather than a broken icon.
 */
export default function SafeThumb({ src, size = THUMB.icon, alt = "", className = "" }) {
  const [stage, setStage] = useState(0); // 0 optimised, 1 original, 2 gave up

  if (!src || stage === 2) {
    return <div className={`${className} border border-dashed bg-muted/40`} aria-hidden="true" />;
  }

  return (
    <Img
      /* Keyed on the stage so React remounts rather than reusing the <img>
         that just errored — without this the browser keeps the failed element
         and onError never fires again, so stage 2 is unreachable. */
      key={stage}
      src={src}
      alt={alt}
      /* The preset's own dimensions, so the optimiser serves exactly the
         rendition this thumbnail needs instead of Img's 512 default. */
      width={size?.width ?? THUMB.icon.width}
      height={size?.height ?? THUMB.icon.height}
      unoptimized={stage === 1}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
