"use client";

/**
 * "Clean up background" — the dialog a vendor actually sees.
 *
 * ── Opt-in, and never destructive ───────────────────────────────────────────
 *
 * This runs when it is asked to and the result is saved as a NEW photo beside
 * the original, which is the only honest shape for an automatic edit. A
 * segmenter has no idea what a car is; it finds the salient object. Given a
 * dashboard close-up, a wheel detail or a photograph of a service book it will
 * confidently return something wrong, and a vendor who finds their picture
 * silently replaced by it has lost the picture.
 *
 * So: the vendor presses a button, sees the before and the after side by side,
 * and decides. The original is never touched, which also means "undo" is
 * nothing to build — the undone state never stopped existing.
 *
 * ── Why the progress number matters more than it looks ──────────────────────
 *
 * The first use of this feature downloads 42 MB of model. On a showroom's wifi
 * that is a few seconds; on mobile data it is most of a minute, and a spinner
 * for most of a minute is indistinguishable from a hang — the vendor closes the
 * dialog, presses it again, and starts a second download. The percentage is
 * what stops that, so it is wired through from transformers.js rather than
 * being a decorative bar.
 *
 * Subsequent photos skip it entirely: the browser caches the model, and the
 * dialog says so, because "why was it slow once" is otherwise a support
 * question.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, TriangleAlert, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { canRemoveBackground } from "@/marketplace/media/background";
import { studioShot } from "@/marketplace/media/studio";

/** What went wrong, in a sentence a vendor can act on. */
function failureText(code, t) {
  switch (code) {
    case "NO_SUBJECT":
      return t(
        "لم يُعثر على سيارة واضحة في هذه الصورة. جرّب صورة تظهر فيها السيارة كاملة.",
        "No clear subject found in this photo. Try one showing the whole car."
      );
    case "ENCODE_FAILED":
      return t("تعذّر حفظ الصورة الناتجة.", "The finished image could not be encoded.");
    default:
      return t(
        "تعذّرت معالجة الصورة. تحقّق من اتصالك وحاول مرة أخرى.",
        "The photo could not be processed. Check your connection and try again."
      );
  }
}

export default function BackgroundStudio({
  asset,
  open,
  onOpenChange,
  onSave,
  locale = "en",
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);     // { url, blob }
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  /**
   * The object URL of the result, revoked when it is replaced or the dialog
   * closes. A blob URL holds the whole image in memory until it is revoked, and
   * a vendor working through twenty photos would otherwise accumulate twenty of
   * them for the life of the tab.
   */
  const objectUrl = useRef(null);
  const setPreview = useCallback((blob) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = blob ? URL.createObjectURL(blob) : null;
    setResult(blob ? { blob, url: objectUrl.current } : null);
  }, []);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  /* A new photo is a new subject, and nothing from the last one should survive
     — not the preview, not the error, not the progress. That reset is NOT done
     here with an effect: the caller keys this component on the asset id, so a
     different photo mounts a different instance and the old state stops
     existing rather than being cleared field by field. One place to get wrong
     instead of three. */

  const run = async () => {
    setBusy(true);
    setError(null);
    setProgress(null);

    try {
      /* Imported here rather than at the top of the file: this is what keeps
         the 9.5 MB library and its WASM out of the dashboard bundle until the
         button is actually pressed. */
      const { cutout } = await import("@/marketplace/media/background");

      const cut = await cutout(asset.url, {
        onProgress: (e) => {
          if (e?.status === "progress" && typeof e.progress === "number") {
            setProgress(Math.round(e.progress));
          }
          if (e?.status === "ready" || e?.status === "done") setProgress(null);
        },
      });

      setPreview(await studioShot(cut));
    } catch (err) {
      setError(failureText(err?.message, t));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      /* Named after the original so the pair sit together in the library,
         rather than as a timestamp nobody can match back to a car. */
      const base = (asset.filename || "photo").replace(/\.[^.]+$/, "");
      const file = new File([result.blob], `${base}-studio.webp`, { type: result.blob.type });

      await onSave(file);
      onOpenChange(false);
    } catch (err) {
      setError(err?.message || t("تعذّر الحفظ.", "Could not save."));
    } finally {
      setSaving(false);
    }
  };

  if (!asset) return null;

  const supported = canRemoveBackground();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" dir={isAr ? "rtl" : "ltr"}>
        <DialogHeader>
          <DialogTitle>{t("تنظيف الخلفية", "Clean up background")}</DialogTitle>
        </DialogHeader>

        {!supported ? (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {t(
              "هذا المتصفّح لا يدعم هذه الميزة. جرّب كروم أو سفاري حديثاً.",
              "This browser cannot run this. Try a recent Chrome or Safari."
            )}
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <figure className="space-y-1.5">
                <figcaption className="text-xs font-medium text-muted-foreground">
                  {t("الأصلية", "Original")}
                </figcaption>
                {/* Plain <img>: these are blob and storage URLs sized by the
                    box, so next/image would add a loader and a remotePatterns
                    entry for no benefit. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt=""
                  className="aspect-[4/3] w-full rounded-lg border object-cover"
                />
              </figure>

              <figure className="space-y-1.5">
                <figcaption className="text-xs font-medium text-muted-foreground">
                  {t("بعد التنظيف", "Cleaned up")}
                </figcaption>
                {/* A checkerboard, because the result is TRANSPARENT and a
                    vendor needs to see that rather than wonder why the car is
                    on a grey square. It is also the convention every image
                    editor uses, so it needs no label.

                    object-contain and a drop-shadow, which is exactly what the
                    listing card does with this image — so the preview is the
                    card's rendering rather than an approximation of it. */}
                <div
                  className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border p-3"
                  style={{
                    backgroundImage:
                      "linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.06) 75%)," +
                      "linear-gradient(45deg, rgba(0,0,0,.06) 25%, transparent 25%, transparent 75%, rgba(0,0,0,.06) 75%)",
                    backgroundSize: "16px 16px",
                    backgroundPosition: "0 0, 8px 8px",
                  }}
                >
                  {result ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={result.url}
                      alt=""
                      className="h-full w-full object-contain drop-shadow-[0_12px_18px_rgba(0,0,0,0.16)]"
                    />
                  ) : busy ? (
                    <div className="flex flex-col items-center gap-2 px-6 text-center">
                      <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                      <p className="text-xs text-muted-foreground">
                        {progress != null
                          ? t(
                              `تحميل النموذج لأول مرة… ${progress}%`,
                              `Downloading the model, first time only… ${progress}%`
                            )
                          : t("جارِ المعالجة…", "Processing…")}
                      </p>
                    </div>
                  ) : (
                    <p className="px-6 text-center text-xs text-muted-foreground">
                      {t(
                        "اضغط «نظّف الخلفية» لمعاينة النتيجة.",
                        "Press Clean up to see the result."
                      )}
                    </p>
                  )}
                </div>
              </figure>
            </div>

            {error ? (
              <p className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            ) : null}

            {/* Said once, here, because it is the question every vendor asks
                before pressing a button that edits their photograph. */}
            <p className="text-[11px] text-muted-foreground">
              {t(
                "تتم المعالجة داخل متصفّحك — لا تُرفع الصورة إلى أي خدمة خارجية. وتُحفظ النتيجة كصورة جديدة بجانب الأصلية.",
                "Processed inside your browser — the photo is not sent to any outside service. The result is saved as a new photo; the original is kept."
              )}
            </p>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={run}
                disabled={busy || saving}
                className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {result ? t("أعد المحاولة", "Try again") : t("نظّف الخلفية", "Clean up")}
              </button>

              <button
                type="button"
                onClick={save}
                disabled={!result || busy || saving}
                className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {t("احفظ كصورة جديدة", "Save as new photo")}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
