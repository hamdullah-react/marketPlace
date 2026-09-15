"use client";

import { useState } from "react";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";

/**
 * A small thumbnail that never stays broken.
 *
 * It asks for the resized copy first (thumbUrl → /_next/image). That resize has
 * to download the ORIGINAL before it can shrink it, and a seller's phone photo
 * is often 3–4 MB — measured at 8 seconds, past the optimizer's upstream
 * timeout. The first request for such a photo fails, and a plain <img> would
 * show a broken icon until someone reloaded after the cache warmed.
 *
 * So on error it switches once to the original file, which always loads. If
 * that fails too, the empty placeholder is shown instead of a broken icon.
 */
export default function SafeThumb({ src, size = THUMB.icon, alt = "", className = "" }) {
  const [stage, setStage] = useState(0); // 0 resized, 1 original, 2 gave up

  if (!src || stage === 2) {
    return <div className={`${className} border border-dashed bg-muted/40`} aria-hidden="true" />;
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={stage === 0 ? thumbUrl(src, size) : src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onError={() => setStage((s) => s + 1)}
    />
  );
}
