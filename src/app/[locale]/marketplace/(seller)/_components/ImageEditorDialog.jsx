"use client";

/**
 * What happens between picking a photo and uploading it: see what you picked,
 * choose a format, crop if you want to, compress, then send.
 *
 * ── Nothing happens until the seller asks for it ────────────────────────────
 *
 * The first version of this opened straight into a cropper. That was wrong in
 * a way worth recording: a seller who only wanted to upload a photo was shown
 * a crop grid and had to work out that dragging it was optional. The editor
 * announced itself as a chore.
 *
 * So the dialog opens on the PICTURE, with the file's own facts under it, and
 * every change is a button somebody presses. Crop is a mode you enter and
 * leave. Compress is an action with a result.
 *
 * ── Upload stays disabled until it has been compressed ──────────────────────
 *
 * Deliberate, and the point of the whole screen. An uncompressed photo is a
 * 5 MB file on a car listing, which is the thing this feature exists to stop —
 * and compressing silently on the way out would make the Compress button a
 * decoration. If it is disabled, the seller knows the step is real.
 *
 * Anything that changes the OUTPUT — a crop, a size, a format — throws the
 * result away and disables Upload again, because a size measured before those
 * changes is a number about a file that no longer exists.
 *
 * ── Why the format choice is honoured on the SERVER ─────────────────────────
 *
 * Browsers decode AVIF nearly everywhere and encode it nearly nowhere:
 * canvas.toBlob('image/avif') hands back a PNG in most of them, silently. So
 * the browser always produces WebP as the intermediate, the seller's choice
 * travels with the upload, and sharp writes the format they asked for.
 */

import { useCallback, useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import {
  Check, Crop as CropIcon, FileImage, Layers, Loader2, Minimize2, RotateCw, X, ZoomIn,
} from "lucide-react";
import { compressImage, formatBytes, MAX_EDGE } from "@/marketplace/media/compress";

const RATIOS = [
  { id: "free", ar: "حر", en: "Free", value: null },
  { id: "4:3", ar: "٤:٣", en: "4:3", value: 4 / 3 },
  { id: "16:9", ar: "١٦:٩", en: "16:9", value: 16 / 9 },
  { id: "1:1", ar: "مربع", en: "Square", value: 1 },
];

const SIZES = [
  { id: "2000", ar: "كبير", en: "Large", value: 2000 },
  { id: "1400", ar: "متوسط", en: "Medium", value: 1400 },
  { id: "900", ar: "صغير", en: "Small", value: 900 },
];

/**
 * What the seller may convert TO.
 *
 * Both are modern and both are what next/image would serve anyway. AVIF is
 * usually 20-30% smaller than WebP at the same quality and slower to encode;
 * WebP is the safe one. AVIF leads because it is the better answer for a photo
 * that will be served to buyers thousands of times.
 */
const FORMATS = [
  { id: "avif", label: "AVIF", ar: "الأصغر حجماً", en: "Smallest file" },
  { id: "webp", label: "WebP", ar: "توافق أوسع", en: "Widest support" },
];

/** "image/jpeg" → "JPEG". What the seller calls the thing they picked. */
function formatName(mime = "") {
  const sub = String(mime).split("/")[1] || "";
  if (!sub) return "—";
  if (sub === "jpeg") return "JPEG";
  if (sub === "svg+xml") return "SVG";
  return sub.toUpperCase();
}

export default function ImageEditorDialog({
  file,
  locale = "ar",
  maxBytes,
  onCancel,
  onConfirm,
  onSkip,
  onJump,
  files = [],
  thumbs = [],
  index = 0,
  doneIdx = [],
  doneInfo = {},
  edits = {},
  onEditChangeAt,
  onUploadAll,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /** 'preview' shows the picture; 'crop' shows the cropper. */
  /* This photo's entry, read out of the map the parent owns. */
  const initial = edits[index] ?? null;
  const onEditChange = (patch) => onEditChangeAt?.(index, patch);

  const [mode, setMode] = useState("preview");

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [ratio, setRatio] = useState(null);

  /* The crop being dragged, and the one that has been COMMITTED with Apply.
     Keeping them apart is what lets Cancel leave the cropper without changing
     anything the seller had already settled on. */
  const [areaPixels, setAreaPixels] = useState(null);
  const [appliedCrop, setAppliedCrop] = useState(initial?.appliedCrop ?? null);

  const [maxEdge, setMaxEdge] = useState(initial?.maxEdge ?? MAX_EDGE);
  /* An SVG defaults to STAYING an SVG. Rasterising a logo throws away the one
     property it was chosen for, so converting is offered and never assumed. */
  const [format, setFormat] = useState(() =>
    initial?.format ??
    ((file?.type === "image/svg+xml" || /\.svg$/i.test(file?.name ?? "")) ? "svg" : "avif")
  );

  const [result, setResult] = useState(initial?.result ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /**
   * The picture on the stage once something has been DONE to it.
   *
   * The crop used to be reported with a "Cropped · 1920×1080" badge over the
   * untouched original, which is a caption claiming something the picture
   * contradicts — the seller crops, sees the same photo, and presses Crop
   * again. Showing the real output is the only version of this that can be
   * trusted, and it is also the only way to notice a crop that went wrong.
   *
   * Null means "nothing done yet", and the stage falls back to the original.
   */
  /**
   * Seeded from the stored blob, so coming BACK to a photo shows the crop
   * that was made the first time rather than the untouched original.
   *
   * A lazy initialiser rather than an effect: the url is a pure function of
   * bytes that are already here, and minting it during the first render means
   * the restored crop is on screen in the first paint.
   */
  const [outUrl, setOutUrl] = useState(() => {
    /* `preview` is what a CROP produced; `result.blob` is what COMPRESS
       produced. A photo cropped and not yet compressed has only the first,
       and it is the one that must come back on screen. */
    const blob = initial?.preview ?? initial?.result?.blob ?? null;
    return blob ? URL.createObjectURL(blob) : null;
  });

  /**
   * Replaced urls are revoked; the LAST one is deliberately not.
   *
   * Revoking on unmount is what a tidy component does, and it is wrong here:
   * Strict Mode mounts, runs cleanups, and mounts again, so the only url
   * would be released while the dialog that needs it is still on screen —
   * the black-cropper bug this file already carries a note about. The cost of
   * not revoking is one url per photo visited, released when the tab is
   * closed; the cost of revoking is a preview that does not render.
   */
  const showOutput = (blob) => {
    setOutUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return blob ? URL.createObjectURL(blob) : null;
    });
  };

  /**
   * The object URL, minted during the FIRST render.
   *
   * ── Why not an effect, and why not useMemo either ───────────────────────
   *
   * Both of the obvious shapes are wrong here, and each was shipped once.
   *
   * An effect (`setSrc` after mount) is Strict-Mode-safe but renders the
   * stage EMPTY first: the dialog opens black and the photo appears a beat
   * later. That is the flicker.
   *
   * useMemo renders it immediately and breaks under Strict Mode, which
   * mounts, runs cleanups — revoking the only url — and mounts again. That is
   * the black cropper this file already carries a scar from.
   *
   * A lazy useState initialiser gives the first render a real url AND does
   * not depend on the effect running twice. The price is that the url is not
   * revoked on unmount: it would be released while the dialog still needs it,
   * for exactly the Strict Mode reason above. One url per photo opened, freed
   * when the tab closes — the same trade this file already makes for the
   * output preview, and the same reasoning.
   */
  const [src] = useState(() => (file ? URL.createObjectURL(file) : null));

  /** The picture's own dimensions, read once so the facts row can show them. */
  const [natural, setNatural] = useState(null);

  const onCropComplete = useCallback((_area, pixels) => setAreaPixels(pixels), []);

  /**
   * Escape leaves; a click on the backdrop does NOT.
   *
   * The two are not the same gesture. Escape is deliberate and nobody presses
   * it by accident; a stray click beside a dialog is the commonest accident
   * there is, and here it would throw away a crop, a compression and the rest
   * of a queue with no warning and no undo. Dialogs that hold work should not
   * be dismissible by missing.
   *
   * In crop mode Escape backs out of the CROP rather than the dialog, which
   * is the nearer meaning of "cancel" while a crop is being dragged.
   */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (mode === "crop") setMode("preview");
      else onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, onCancel]);

  /**
   * Any change to what the output WOULD be invalidates the measurement, and
   * therefore disables Upload again.
   *
   * Without it a seller could compress, then crop, then upload — sending a
   * file whose size nobody had measured and whose 1 MB check had passed
   * against different bytes.
   *
   * Done in the HANDLERS rather than in an effect watching the three values.
   * An effect would run after the render that already showed the stale size,
   * and would write state during that render to correct itself. These are
   * events; the invalidation belongs where the event is.
   */
  const chooseSize = (value) => {
    setMaxEdge(value);
    setResult(null);
    onEditChange?.({ maxEdge: value, result: null });
  };

  const chooseFormat = (value) => {
    setFormat(value);
    setResult(null);
    /* Going back to the vector throws away any raster preview: it was made by
       a canvas that is no longer part of the answer. */
    if (value === "svg") { setAppliedCrop(null); showOutput(null); }
    onEditChange?.({
      format: value,
      result: null,
      ...(value === "svg" ? { appliedCrop: null } : {}),
    });
  };

  /**
   * Apply the crop AND draw it, so the stage shows what was actually cut.
   *
   * The draw is the real pipeline at a modest size rather than a cheap
   * approximation — if this picture and the uploaded one could differ, the
   * preview would be decoration.
   */
  const applyCrop = async () => {
    setAppliedCrop(areaPixels);
    setResult(null);
    setMode("preview");
    onEditChange?.({ appliedCrop: areaPixels, result: null });
    if (!areaPixels) return;
    try {
      const out = await compressImage(file, { crop: areaPixels, maxEdge: 1200 });
      showOutput(out.blob);
      /* Stored so a jump away and back redraws the crop from these bytes. */
      onEditChange?.({ preview: out.blob });
    } catch {
      /* The crop is still applied and Compress will report the real error;
         falling back to the original beats an empty stage. */
      showOutput(null);
    }
  };

  const resetCrop = () => {
    setAppliedCrop(null);
    setResult(null);
    showOutput(null);
    onEditChange?.({ appliedCrop: null, result: null, preview: null });
  };

  const isSvgFile = (f) =>
    f?.type === "image/svg+xml" || /\.svg$/i.test(f?.name ?? "");

  const sourceIsSvg =
    file?.type === "image/svg+xml" || /\.svg$/i.test(file?.name ?? "");
  const sourceFormat = sourceIsSvg ? "SVG" : formatName(file?.type);
  const alreadyModern = file?.type === "image/avif" || file?.type === "image/webp";

  /* Keeping the vector means no canvas, so no crop and nothing to compress. */
  const keepingVector = sourceIsSvg && format === "svg";

  const compress = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (keepingVector) {
        /**
         * Nothing to do, and saying so is the honest result.
         *
         * An SVG kept as an SVG is uploaded byte for byte: there is no canvas,
         * no re-encode and no saving to report. The button still has to work,
         * because Upload stays disabled until there IS a result — so this
         * produces one describing the file as it stands.
         */
        setResult({
          blob: file,
          bytes: file.size,
          originalBytes: file.size,
          saved: 0,
          width: null,
          height: null,
          vector: true,
        });
        onEditChange?.({ result: { blob: file, bytes: file.size, vector: true } });
      } else {
        const out = await compressImage(file, { crop: appliedCrop, maxEdge });
        setResult(out);
        showOutput(out.blob);
        onEditChange?.({ result: out, preview: out.blob });
      }
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Carry the SETTINGS to the rest of the batch — not the crop.
   *
   * See the note at the call site: a crop rectangle chosen against one
   * photograph means something else entirely on the next car. The size and
   * the format are shared decisions and travel; the rectangle does not.
   */
  /** {done, total} while a Compress all run is going, else null. */
  const [bulk, setBulk] = useState(null);

  const total = files.length || 1;
  const remaining = total - doneIdx.length;
  /* The checkbox and the Skip button only make sense with a batch behind
     them; with one file the dialog stays exactly as it was. */
  const batched = total > 1;

  /**
   * Compress every photo that still needs it, in one press.
   *
   * Each photo is encoded with ITS OWN settings where the seller set them —
   * a crop, a size, a format chosen on that photo — and with the ones showing
   * now for the rest. That is the useful meaning of "all": it finishes the
   * job without overriding the decisions already made.
   *
   * Sequential rather than Promise.all. Each encode is a full-size canvas
   * draw plus a WebP encode; twelve at once on a laptop freezes the tab and
   * can exhaust memory on a phone. One at a time keeps the progress count
   * honest as well.
   */
  /**
   * Push THIS photo's size and format onto every other photo still waiting.
   *
   * Not the crop: a rectangle chosen against one photograph is a different
   * part of a different picture on the next car, and copying it would cut
   * the roofs off the rest of the batch.
   *
   * Any result already measured for those photos is dropped, because it was
   * measured against the settings they had a moment ago.
   */
  const applySettingsToPending = () => {
    for (const i of pending) {
      if (i === index) continue;
      if (isSvgFile(files[i])) continue;   // a vector keeps its own answer
      onEditChangeAt?.(i, { maxEdge, format, result: null, preview: null });
    }
  };

  const compressAll = async () => {
    const todo = files.map((_, i) => i).filter((i) => !doneIdx.includes(i) && !readyAt(i));
    if (!todo.length) return;

    setBulk({ done: 0, total: todo.length });
    setError(null);

    for (const [n, i] of todo.entries()) {
      const e = edits[i] ?? {};
      const fmt = e.format ?? (isSvgFile(files[i]) ? "svg" : format);

      try {
        if (fmt === "svg") {
          /* A vector kept as a vector is uploaded byte for byte — there is
             nothing to encode, and saying so is the honest result. */
          onEditChangeAt?.(i, {
            format: "svg",
            result: { blob: files[i], bytes: files[i].size, vector: true },
          });
        } else {
          const out = await compressImage(files[i], {
            crop: e.appliedCrop ?? null,
            maxEdge: e.maxEdge ?? maxEdge,
          });
          onEditChangeAt?.(i, { format: fmt, result: out, preview: out.blob });
          if (i === index) { setResult(out); showOutput(out.blob); }
        }
      } catch (err) {
        setError(err.message);
      }

      setBulk({ done: n + 1, total: todo.length });
    }

    setBulk(null);
  };

  const tooLarge = Boolean(result && maxBytes && result.bytes > maxBytes);

  /**
   * ── With a batch, Upload waits for ALL of them ──────────────────────────
   *
   * Uploading one photo at a time out of a queue of twelve meant twelve
   * presses, and a seller who closed the dialog after the fourth had four
   * photos in the library and eight still sitting in a queue that no longer
   * existed. The button now means what it says: send the batch.
   *
   * A photo counts as ready when it has a compressed result that is within
   * the limit. One oversized photo blocks the lot, which is correct — it is
   * the one thing the seller has to deal with before anything can go.
   */
  const readyAt = (i) => {
    const e = edits[i];
    if (!e?.result) return false;
    return !(maxBytes && e.result.bytes > maxBytes);
  };

  const pending = files.map((_, i) => i).filter((i) => !doneIdx.includes(i) && !readyAt(i));
  const allReady = batched ? pending.length === 0 : Boolean(result) && !tooLarge;
  const canUpload = allReady && !busy && !bulk;

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("تجهيز الصورة", "Prepare image")}
    >
      {/* h-[92vh] rather than max-h: a fixed height gives the flex column a
          definite size to divide up, so the footer is placed from the BOTTOM
          instead of wherever the content happens to end. With max-h the
          column only constrained itself once the content already overflowed,
          which is why the buttons were below the fold. */}
      <div className="flex h-[82vh] max-h-[760px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10 dark:bg-[#141414] dark:ring-white/10">
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-brand-primary">
            <FileImage className="h-4 w-4" />
            {mode === "crop" ? t("قص الصورة", "Crop image") : t("تجهيز الصورة", "Prepare image")}
            {batched ? (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:bg-white/10 dark:text-gray-300">
                {t(`${index + 1} من ${total}`, `${index + 1} of ${total}`)}
                {remaining !== total ? t(` · متبقٍ ${remaining}`, ` · ${remaining} left`) : ""}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t("إغلاق", "Close")}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* ── Two columns on a wide screen ────────────────────────────────
            The picture takes the room it deserves and the controls get a
            column of their own, instead of both sharing one narrow tower
            where the panel scrolled a few lines at a time.

            It stacks below `lg`, which is where a side-by-side would make the
            picture too small to judge a crop against. min-h-0 on the row and
            on each column, for the reason spelled out below: without it a
            flex child refuses to shrink under its content and the whole
            thing grows past the dialog again. */}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col">

        {/* The stage. A positioned box with a real height either way — the
            cropper fills its container absolutely and collapses without one,
            which is what min-h is for. flex-1 now rather than a fixed vh: in
            a column of its own the picture should take whatever the filmstrip
            leaves, instead of being pinned to a fraction of the window. */}
        <div className="relative min-h-[220px] w-full flex-1 bg-neutral-900">
          {mode === "crop" ? (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={ratio ?? undefined}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={onCropComplete}
              restrictPosition={false}
            />
          ) : (
            /* Plain <img>, not next/image: this is an object: URL for a file
               that exists only in this tab, so there is nothing for the
               optimiser to fetch, cache or re-serve. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={outUrl ?? src}
              alt=""
              onLoad={(e) => {
                /* Only the ORIGINAL reports the facts row's dimensions; the
                   output's own size is shown beside the compressed bytes. */
                if (outUrl) return;
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                });
              }}
              className="h-full w-full object-contain"
            />
          )}

          {outUrl && mode !== "crop" ? (
            <span className="absolute bottom-2 start-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
              {appliedCrop
                ? `${t("بعد القص", "Cropped")} · ${Math.round(appliedCrop.width)}×${Math.round(appliedCrop.height)}`
                : t("بعد الضغط", "Compressed")}
            </span>
          ) : null}
        </div>

        {/* ── The filmstrip ────────────────────────────────────────────
            Every picked photo, in order, with the current one ringed and the
            finished ones ticked and labelled with what they became.

            It exists because a batch without it is a dialog that keeps
            reappearing with no sense of progress — the seller cannot tell how
            many are left, which ones were already done, or that the
            compression happened at all. Clicking a thumbnail jumps to it, so
            a photo skipped earlier can be picked up without hunting.
            --------------------------------------------------------------- */}
        {batched ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-t border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/5">
            {files.map((f, i) => {
              const isDone = doneIdx.includes(i);
              const info = doneInfo[i];
              const isCurrent = i === index;
              return (
                <button
                  key={`${f.name}-${i}`}
                  type="button"
                  onClick={() => onJump?.(i)}
                  aria-current={isCurrent ? "true" : undefined}
                  title={f.name}
                  className={`relative shrink-0 overflow-hidden rounded-lg border-2 transition-colors ${
                    isCurrent
                      ? "border-brand-primary"
                      : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                >
                  {/* A local object: URL for a file that exists only in this
                      tab — there is nothing for next/image to fetch. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={thumbs[i]}
                    alt=""
                    className={`h-14 w-14 object-cover ${isDone ? "opacity-45" : ""}`}
                  />

                  {isDone ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/45 text-white">
                      <Check className="h-4 w-4" />
                      {info?.bytes ? (
                        <span className="font-mono text-[9px] leading-none">
                          {formatBytes(info.bytes)}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

          </div>

          {/* The controls. A column of its own on a wide screen, scrolling
              independently of the picture so a long panel never pushes the
              photograph out of view. */}
          <div className="flex min-h-0 w-full shrink-0 flex-col border-t border-gray-200 lg:w-[340px] lg:border-s lg:border-t-0 dark:border-gray-800">
        {/* min-h-0 is load-bearing. A flex item's default min-height is
            `auto`, which means "never smaller than my content" — so this
            panel grew to fit, the column grew with it, and the footer was
            pushed past the bottom of the screen with its buttons unreachable.
            flex-1 + min-h-0 is what makes it the part that scrolls. */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {mode === "crop" ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">{t("النسبة", "Ratio")}</span>
                {RATIOS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRatio(r.value)}
                    aria-pressed={ratio === r.value}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      ratio === r.value
                        ? "bg-brand-primary text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
                    }`}
                  >
                    {t(r.ar, r.en)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                <ZoomIn className="h-4 w-4 shrink-0 text-gray-500" />
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label={t("تكبير", "Zoom")}
                  className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-gray-200 dark:bg-white/15"
                />
                <button
                  type="button"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label={t("تدوير", "Rotate")}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : (
            <>
              {/* ── What the seller actually picked ───────────────────────── */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-gray-50 p-3 text-xs dark:bg-white/5">
                <span className="truncate font-medium text-gray-700 dark:text-gray-200" title={file.name}>
                  {file.name}
                </span>
                <span className="rounded-full bg-gray-200 px-2 py-0.5 font-bold text-gray-700 dark:bg-white/10 dark:text-gray-200">
                  {sourceFormat}
                </span>
                <span className="font-mono text-gray-600 dark:text-gray-300">
                  {formatBytes(file.size)}
                </span>
                {natural ? (
                  <span className="text-gray-500">{natural.width}×{natural.height}</span>
                ) : null}
              </div>

              {/* ── Convert to ────────────────────────────────────────────
                  Shown always, with a line explaining WHY when the file is
                  not already a modern format. A seller who uploads a 5 MB
                  JPEG should be told what it is and what it is becoming,
                  rather than having it changed under them. */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-gray-500">
                    {t("التحويل إلى", "Convert to")}
                  </span>
                  {(sourceIsSvg
                    ? [{ id: "svg", label: "SVG", ar: "يبقى متجهاً", en: "Keep vector" }, ...FORMATS]
                    : FORMATS
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => chooseFormat(f.id)}
                      aria-pressed={format === f.id}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                        format === f.id
                          ? "bg-brand-primary text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
                      }`}
                    >
                      {f.label} · {t(f.ar, f.en)}
                    </button>
                  ))}
                </div>
                {sourceIsSvg ? (
                  <p className="text-[11px] text-gray-500">
                    {keepingVector
                      ? t(
                          "ملفك SVG متجه: يُرفع كما هو بلا قص ولا ضغط، ويبقى حاداً عند أي حجم. اختر AVIF أو WebP إذا كنت تريد قصه.",
                          "Your file is a vector SVG: it uploads untouched, with no crop and no compression, and stays sharp at any size. Pick AVIF or WebP if you want to crop it."
                        )
                      : t(
                          `سيتم تحويل الـ SVG إلى ${format.toUpperCase()} — يمكن قصه وضغطه، لكنه يفقد الحدّة عند التكبير.`,
                          `The SVG will be rasterised to ${format.toUpperCase()} — croppable and compressible, but it stops being sharp at any size.`
                        )}
                  </p>
                ) : !alreadyModern ? (
                  <p className="text-[11px] text-gray-500">
                    {t(
                      `ملفك بصيغة ${sourceFormat}. سيتم تحويله إلى ${format.toUpperCase()} — أصغر حجماً وأفضل لسرعة الصفحة وللظهور في البحث.`,
                      `Your file is ${sourceFormat}. It will be converted to ${format.toUpperCase()} — smaller, and better for page speed and search.`
                    )}
                  </p>
                ) : null}
              </div>

              <div className={`flex flex-wrap items-center gap-2 ${keepingVector ? "opacity-40" : ""}`}>
                <span className="text-xs font-semibold text-gray-500">{t("المقاس", "Size")}</span>
                {SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseSize(s.value)}
                    disabled={keepingVector}
                    aria-pressed={maxEdge === s.value}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                      maxEdge === s.value
                        ? "bg-brand-primary text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
                    }`}
                  >
                    {t(s.ar, s.en)} · {s.value}px
                  </button>
                ))}
              </div>

              {/* ── The result, once there is one ────────────────────────── */}
              <div className="rounded-xl bg-gray-50 p-3 text-xs dark:bg-white/5">
                {busy ? (
                  <span className="flex items-center gap-2 text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("جاري الضغط…", "Compressing…")}
                  </span>
                ) : result ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="text-gray-500">
                      <span className="font-mono">{formatBytes(result.originalBytes)}</span>
                      <span aria-hidden="true" className="mx-2 text-gray-400">→</span>
                    </span>
                    <span className={tooLarge ? "font-bold text-red-600" : "font-bold text-green-700 dark:text-green-400"}>
                      <span className="font-mono">{formatBytes(result.bytes)}</span>{" "}
                      <span className="font-normal opacity-70">
                        {result.width && result.height ? `${result.width}×${result.height} · ` : ""}
                        {format.toUpperCase()}
                      </span>
                    </span>
                    {result.vector ? (
                      <span className="text-gray-500">
                        {t("يُرفع كما هو", "Uploaded as-is")}
                      </span>
                    ) : result.saved > 0 ? (
                      <span className="text-gray-500">
                        {t("توفير", "Saved")}{" "}
                        <strong>{Math.round((result.saved / result.originalBytes) * 100)}%</strong>
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span className="text-gray-500">
                    {t(
                      "اضغط «ضغط الصورة» لحساب الحجم قبل الرفع.",
                      "Press Compress to work out the size before uploading."
                    )}
                  </span>
                )}
              </div>

              {tooLarge ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {t(
                    `حجم الملف كبير جداً — ${formatBytes(result.bytes)} بعد الضغط، والحد ${formatBytes(maxBytes)}. اختر مقاساً أصغر أو قص جزءاً أكبر.`,
                    `File size is too high — ${formatBytes(result.bytes)} after compression, and the limit is ${formatBytes(maxBytes)}. Choose a smaller size, or crop in tighter.`
                  )}
                </p>
              ) : null}

              {error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              ) : null}
            </>
          )}
        </div>
          </div>
        </div>

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-[#141414]">
          {mode === "crop" ? (
            <>
              <button
                type="button"
                onClick={() => setMode("preview")}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              >
                {t("إلغاء القص", "Cancel crop")}
              </button>
              <button
                type="button"
                onClick={applyCrop}
                className="raised-solid flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-white"
              >
                <Check className="h-4 w-4" />
                {t("تطبيق القص", "Apply crop")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              >
                {batched ? t("إلغاء الكل", "Cancel all") : t("إلغاء", "Cancel")}
              </button>

              {batched ? (
                <>
                  <button
                    type="button"
                    onClick={onSkip}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                  >
                    {t("تخطّي", "Skip")}
                  </button>
                  {/* A BUTTON now, not a checkbox.
                      As a checkbox it was a promise about what Upload would
                      do later — and once Upload became "send the whole
                      batch", that promise had nowhere to be kept. Pressing it
                      writes this photo's size and format onto the others
                      immediately, so Compress all then uses them and the
                      seller can see it happened. */}
                  {pending.length > 1 ? (
                    <button
                      type="button"
                      onClick={applySettingsToPending}
                      disabled={Boolean(bulk)}
                      className="me-auto rounded-lg px-3 py-2 text-xs font-medium text-brand-primary hover:bg-brand-primary/5 disabled:opacity-50"
                    >
                      {t(
                        `طبّق المقاس والصيغة على الباقي (${pending.length - 1})`,
                        `Apply size & format to the rest (${pending.length - 1})`
                      )}
                    </button>
                  ) : (
                    <span className="me-auto" />
                  )}
                </>
              ) : (
                <span className="me-auto" />
              )}

              {appliedCrop ? (
                <button
                  type="button"
                  onClick={resetCrop}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
                >
                  {t("إزالة القص", "Reset crop")}
                </button>
              ) : null}

              <button
                type="button"
                onClick={() => setMode("crop")}
                disabled={keepingVector}
                title={keepingVector ? t("حوّلها إلى AVIF أو WebP لقصها", "Convert to AVIF or WebP to crop it") : undefined}
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-white/10"
              >
                <CropIcon className="h-4 w-4" />
                {appliedCrop ? t("تعديل القص", "Edit crop") : t("قص", "Crop")}
              </button>

              <button
                type="button"
                onClick={compress}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-brand-primary px-4 py-2 text-sm font-bold text-brand-primary hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Minimize2 className="h-4 w-4" />}
                {keepingVector
                  ? t("تأكيد", "Confirm")
                  : result ? t("إعادة الضغط", "Compress again") : t("ضغط الصورة", "Compress")}
              </button>

              {/* One press for the whole batch. Only offered while something
                  still needs it, so it disappears once the queue is ready
                  rather than sitting there doing nothing. */}
              {batched && pending.length > 0 ? (
                <button
                  type="button"
                  onClick={compressAll}
                  disabled={Boolean(bulk) || busy}
                  className="raised-solid flex items-center gap-2 rounded-lg bg-brand-primary/10 px-4 py-2 text-sm font-bold text-brand-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {bulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                  {bulk
                    ? t(`${bulk.done}/${bulk.total}`, `${bulk.done}/${bulk.total}`)
                    : t(`ضغط الكل (${pending.length})`, `Compress all (${pending.length})`)}
                </button>
              ) : null}

              {/* Disabled until compressed — see the note at the top. The title
                  says why, because a disabled button with no explanation is a
                  dead end. */}
              <button
                type="button"
                onClick={() =>
                  batched
                    ? onUploadAll?.()
                    : onConfirm({ ...result, format, maxEdge })
                }
                disabled={!canUpload}
                /* A disabled button with no explanation is a dead end, so the
                   title names exactly what is missing and how many. */
                title={
                  canUpload
                    ? undefined
                    : batched
                      ? t(
                          `اضغط ${pending.length} صورة متبقية أولاً`,
                          `Compress the remaining ${pending.length} image${pending.length === 1 ? "" : "s"} first`
                        )
                      : t("اضغط الصورة أولاً", "Compress the image first")
                }
                className="raised-solid rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {batched
                  ? t(`رفع الكل (${files.length - doneIdx.length})`, `Upload all (${files.length - doneIdx.length})`)
                  : t("رفع الصورة", "Upload")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
