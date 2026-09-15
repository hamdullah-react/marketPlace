"use client";

/**
 * One website image — logo, favicon, carousel slide, share card.
 *
 * Uploads straight to /api/marketplace/admin/upload (admins only, shared
 * bucket, site/<folder>/) and keeps the resulting URL in a hidden input, so the
 * surrounding form submits it like any other field.
 */

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { errorText } from "@/marketplace/lib/errors";

const BOXES = {
  square: "h-20 w-20",
  logo: "h-20 w-48",
  wide: "aspect-[1200/630] w-full max-w-sm",
};

/** Uploads one file and resolves to its public URL. Throws an error code. */
export async function uploadSiteImage(file, folder = "branding") {
  const body = new FormData();
  body.set("file", file);
  body.set("folder", folder);

  const res = await fetch("/api/marketplace/admin/upload", { method: "POST", body });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok || !json.data?.url) throw new Error(json?.error?.code || "UPLOAD_FAILED");
  return json.data.url;
}

export default function SiteImageField({
  locale = "ar",
  name,
  value = "",
  label,
  hint,
  folder = "branding",
  shape = "square",
  cover = false,
  onChange,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [url, setUrl] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const input = useRef(null);

  // Follow the server when the stored value changes (see ImagePicker).
  const [lastValue, setLastValue] = useState(value ?? "");
  if ((value ?? "") !== lastValue) {
    setLastValue(value ?? "");
    setUrl(value ?? "");
  }

  const set = (next) => {
    setUrl(next);
    onChange?.(next);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      set(await uploadSiteImage(file, folder));
    } catch (err) {
      setError(err?.message || "UPLOAD_FAILED");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-w-0">
      {label ? <span className="mb-1.5 block text-sm font-medium">{label}</span> : null}

      <input type="hidden" name={name} value={url} />
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onFile} />

      <div className={`${BOXES[shape] ?? BOXES.square} raised relative overflow-hidden rounded-lg`}>
        {url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={url} alt="" className={`h-full w-full ${cover ? "object-cover" : "object-contain p-1.5"}`} />
        ) : (
          <button
            type="button"
            onClick={() => input.current?.click()}
            aria-label={t("رفع صورة", "Upload an image")}
            className="flex h-full w-full items-center justify-center text-brand-primary"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
        )}

        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-black/60">
            <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => input.current?.click()} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />
          {url ? t("تغيير", "Change") : t("رفع", "Upload")}
        </Button>
        {url ? (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => set("")} className="gap-1.5 text-red-600 hover:text-red-700">
            <Trash2 className="h-3.5 w-3.5" />
            {t("إزالة", "Remove")}
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-xs text-red-600">{errorText(error, locale)}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
