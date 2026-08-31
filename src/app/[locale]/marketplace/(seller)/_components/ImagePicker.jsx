"use client";

/**
 * Single-image field backed by the media library.
 *
 * Icon-only controls, sitting ON the thumbnail: a pencil to change and a bin to
 * remove. Text buttons beside every picker ("Change" / "Remove" / "Choose or
 * upload") tripled the width of a field whose whole job is to show one small
 * image, and three of them in a row pushed the form apart.
 *
 * Empty state is the placeholder tile itself — clicking anywhere on it opens
 * the library, so no label is needed to explain what it does.
 *
 * The value lives in a hidden input: the visible control is a button, and a
 * native form action only submits real inputs.
 */

import { useState } from "react";
import { ImagePlus, X, Images, Pencil, Trash2 } from "lucide-react";
import MediaGallery from "./MediaGallery";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { thumbUrl, THUMB } from "@/marketplace/lib/image";

const SIZES = {
  sm: "h-14 w-14",
  md: "h-20 w-20",
  lg: "h-24 w-24",
  wide: "h-20 w-32",
};

export default function ImagePicker({
  locale = "ar",
  name,
  vendorId,
  assets = [],
  value = "",
  label,
  hint,
  kind = "photo",
  size = "md",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [url, setUrl] = useState(value ?? "");
  const [open, setOpen] = useState(false);

  /**
   * Follow the server when the stored value CHANGES.
   *
   * useState only reads its argument on the first render, so this field used
   * to keep whatever it was mounted with for ever. That was harmless while
   * the only way to change a logo was this box — and stopped being harmless
   * the moment deleting the file cleared the column behind it: the picker
   * went on showing a picture that no longer exists, and pressing Save wrote
   * that dead URL straight back into the database.
   *
   * Adjusted during render rather than in an effect, which is the pattern
   * React documents for exactly this — a state that has to follow a prop.
   * An effect would render the stale value once first, and here that render
   * is a broken image.
   *
   * Only ON CHANGE, so a seller who has picked something new and not yet
   * saved does not have it snatched back by an unrelated re-render.
   */
  const [lastValue, setLastValue] = useState(value ?? "");
  if ((value ?? "") !== lastValue) {
    setLastValue(value ?? "");
    setUrl(value ?? "");
  }


  // MediaGallery deals in assets, this field deals in URLs — translate at the
  // boundary so callers only ever handle a URL.
  const selected = url ? [{ id: url, url, kind }] : [];
  const box = SIZES[size] ?? SIZES.md;

  return (
    <div className="min-w-0">
      {label ? <span className="mb-1.5 block text-sm font-medium">{label}</span> : null}

      <input type="hidden" name={name} value={url} />

      <div className={`${box} group relative overflow-hidden rounded-lg border bg-muted`}>
        {url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbUrl(url, THUMB.icon)} alt="" className="h-full w-full object-contain" />

            {/* Controls appear over the image; on touch they are always visible
                since there is no hover to reveal them. */}
            <div className="absolute inset-x-0 bottom-0 flex justify-center gap-1 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
              <button
                type="button"
                onClick={() => setOpen(true)}
                title={t("تغيير", "Change")}
                aria-label={t("تغيير الصورة", "Change image")}
                className="rounded bg-white/90 p-1 text-neutral-800 transition-colors hover:bg-white"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setUrl("")}
                title={t("إزالة", "Remove")}
                aria-label={t("إزالة الصورة", "Remove image")}
                className="rounded bg-white/90 p-1 text-red-600 transition-colors hover:bg-white"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title={t("اختر أو ارفع صورة", "Choose or upload an image")}
            aria-label={t("اختر أو ارفع صورة", "Choose or upload an image")}
            className="flex h-full w-full items-center justify-center border-2 border-dashed border-transparent transition-colors hover:border-brand-primary"
          >
            <ImagePlus className="h-5 w-5 text-brand-primary" />
          </button>
        )}
      </div>

      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}

      {/* Controlled Dialog rather than a hand-rolled portal: focus trapping,
          Escape, scroll locking and stacking all come from Radix. The old
          version sat at a hardcoded z-[300], which is why it fought with every
          other overlay that picked a different number. */}
      <Dialog open={open} onOpenChange={setOpen}>
        {/* The DIALOG does not scroll; its body does. Scrolling the whole
            dialog put the heading out of sight the moment the grid was longer
            than the screen. */}
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="flex max-h-[88vh] flex-col sm:max-w-3xl"
        >
          <DialogHeader className="pr-12">
            <DialogTitle className="flex items-center gap-2 text-brand-primary">
              <Images className="h-4 w-4" />
              {label || t("اختر صورة", "Choose an image")}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <MediaGallery
              locale={locale}
              vendorId={vendorId}
              initialAssets={assets}
              mode="pick"
              selected={selected}
              initialKind={kind}
              /* Closing is what CHOOSING means — the job is done. Ending up
                 with nothing is not: that is the field's picture being deleted
                 from inside the dialog, and shutting the library in the
                 seller's face at that moment would make them reopen it to do
                 the thing they were already doing. */
              onSelect={(next) => {
                const chosen = next[next.length - 1]?.url ?? "";
                setUrl(chosen);
                if (chosen) setOpen(false);
              }}
              max={1}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
