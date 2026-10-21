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
  Check, Crop as CropIcon, FileImage, Loader2, Minimize2, RotateCw, X, ZoomIn,
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
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  /** 'preview' shows the picture; 'crop' shows the cropper. */
  const [mode, setMode] = useState("preview");

  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [ratio, setRatio] = useState(null);

  /* The crop being dragged, and the one that has been COMMITTED with Apply.
     Keeping them apart is what lets Cancel leave the cropper without changing
     anything the seller had already settled on. */
  const [areaPixels, setAreaPixels] = useState(null);
  const [appliedCrop, setAppliedCrop] = useState(null);

  const [maxEdge, setMaxEdge] = useState(MAX_EDGE);
  const [format, setFormat] = useState("avif");

  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /**
   * The object URL, created IN THE EFFECT — and it has to be.
   *
   * ── Why useMemo was wrong, measured ─────────────────────────────────────
   *
   * This was `useMemo(() => URL.createObjectURL(file), [file])` with the
   * revoke in an effect cleanup, to avoid calling setState from an effect.
   * It produced a black cropper, every time, in development.
   *
   * Strict Mode — on by default in the App Router since Next 13.5.1 — mounts
   * a component, runs its effects, runs the CLEANUPS, then runs the effects
   * again. The cleanup revoked the url. useMemo does not re-run, because
   * `file` has not changed, so `src` stayed a string pointing at a blob the
   * browser had already released. Nothing can load it, and an <img> whose
   * source cannot load over a dark stage is a black rectangle.
   *
   * Creating it in the effect fixes it precisely because the second setup
   * makes a NEW url. That is the shape React documents for this, and it is
   * the reason the rule below is suppressed rather than worked around: an
   * object url is a handle on an external resource, which is what effects are
   * for. Deriving it during render only looked cleaner.
   */
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!file) return undefined;
    const url = URL.createObjectURL(file);
    /* The url must be minted per effect run, or Strict Mode revokes the only
       copy (see above). This synchronises with an external resource, which is
       what effects are for; it is not derived state, and deriving it during
       render is exactly what produced the black cropper. */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  /** The picture's own dimensions, read once so the facts row can show them. */
  const [natural, setNatural] = useState(null);

  const onCropComplete = useCallback((_area, pixels) => setAreaPixels(pixels), []);

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
  const chooseSize = (value) => { setMaxEdge(value); setResult(null); };
  const chooseFormat = (value) => { setFormat(value); setResult(null); };
  const applyCrop = () => { setAppliedCrop(areaPixels); setResult(null); setMode("preview"); };
  const resetCrop = () => { setAppliedCrop(null); setResult(null); };

  const sourceFormat = formatName(file?.type);
  const alreadyModern = file?.type === "image/avif" || file?.type === "image/webp";

  const compress = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const out = await compressImage(file, { crop: appliedCrop, maxEdge });
      setResult(out);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const tooLarge = Boolean(result && maxBytes && result.bytes > maxBytes);
  const canUpload = Boolean(result) && !tooLarge && !busy;

  if (!file) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("تجهيز الصورة", "Prepare image")}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-[#141414]">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="flex items-center gap-2 text-sm font-bold text-brand-primary">
            <FileImage className="h-4 w-4" />
            {mode === "crop" ? t("قص الصورة", "Crop image") : t("تجهيز الصورة", "Prepare image")}
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

        {/* The stage. A positioned box with a real height either way — the
            cropper fills its container absolutely and collapses without one. */}
        <div className="relative h-[40vh] min-h-[220px] w-full bg-neutral-900">
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
              src={src}
              alt=""
              onLoad={(e) =>
                setNatural({
                  width: e.currentTarget.naturalWidth,
                  height: e.currentTarget.naturalHeight,
                })
              }
              className="h-full w-full object-contain"
            />
          )}

          {appliedCrop && mode !== "crop" ? (
            <span className="absolute bottom-2 start-2 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white">
              {t("تم القص", "Cropped")} · {Math.round(appliedCrop.width)}×{Math.round(appliedCrop.height)}
            </span>
          ) : null}
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3">
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
                  {FORMATS.map((f) => (
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
                {!alreadyModern ? (
                  <p className="text-[11px] text-gray-500">
                    {t(
                      `ملفك بصيغة ${sourceFormat}. سيتم تحويله إلى ${format.toUpperCase()} — أصغر حجماً وأفضل لسرعة الصفحة وللظهور في البحث.`,
                      `Your file is ${sourceFormat}. It will be converted to ${format.toUpperCase()} — smaller, and better for page speed and search.`
                    )}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">{t("المقاس", "Size")}</span>
                {SIZES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => chooseSize(s.value)}
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
                        {result.width}×{result.height} · {format.toUpperCase()}
                      </span>
                    </span>
                    {result.saved > 0 ? (
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

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
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
                className="me-auto rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"
              >
                {t("إلغاء", "Cancel")}
              </button>

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
                className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-white/10"
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
                {result ? t("إعادة الضغط", "Compress again") : t("ضغط الصورة", "Compress")}
              </button>

              {/* Disabled until compressed — see the note at the top. The title
                  says why, because a disabled button with no explanation is a
                  dead end. */}
              <button
                type="button"
                onClick={() => onConfirm({ ...result, format })}
                disabled={!canUpload}
                title={
                  canUpload
                    ? undefined
                    : t("اضغط الصورة أولاً", "Compress the image first")
                }
                className="raised-solid rounded-lg bg-brand-primary px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t("رفع الصورة", "Upload")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
