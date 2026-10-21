/**
 * Shrinking a photo in the SELLER'S OWN BROWSER, before it is uploaded.
 *
 * ── Why this happens on the device and not only on the server ───────────────
 *
 * The server re-encodes everything to AVIF anyway (see the upload route), so
 * this looks redundant. It is not: without it, the 5 MB the camera produced
 * crosses the network first. A showroom photographing twenty cars on a phone
 * uploads 100 MB to receive 1 MB of AVIF back, over whatever connection they
 * have in the forecourt, and every one of those megabytes is one they are
 * paying for and waiting on.
 *
 * Resizing first turns that into about 4 MB of upload for the same result.
 *
 * ── Resize hard, compress gently ────────────────────────────────────────────
 *
 * The big win is DIMENSIONS, not quality: a 4000px camera photo displayed in a
 * 320px card is carrying sixteen times the pixels anybody will see. Dropping it
 * to MAX_EDGE removes most of the bytes before quality is touched at all.
 *
 * So the quality here is deliberately high (0.92). This is an intermediate
 * file — the server encodes the one that is actually stored — and squeezing it
 * twice means the second encoder is sharpening the first one's artefacts.
 * Resize a lot, compress a little, and let sharp do the real work.
 *
 * ── WebP, not AVIF ──────────────────────────────────────────────────────────
 *
 * Browsers DECODE AVIF almost everywhere and ENCODE it almost nowhere —
 * canvas.toBlob('image/avif') silently hands back a PNG in most of them, which
 * would make this step inflate the file rather than shrink it. WebP encoding is
 * universal, and the stored format is the server's decision regardless.
 *
 * Every function here is deliberately plain: no React, no DOM beyond canvas and
 * Image, so the compression can be tested and reused outside the dialog.
 */

/** The longest edge we keep. A 2000px photo is larger than any card on the site. */
export const MAX_EDGE = 2000;

/** High on purpose — see the note above about encoding twice. */
export const QUALITY = 0.92;

/** Human bytes. 0 is a real answer and must not render as "—". */
export function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A File as an HTMLImageElement, with the object URL released either way.
 *
 * createImageBitmap would be faster and is not used: it has no decode step we
 * can fail on cleanly, and a corrupt file surfaces as a confusing exception
 * inside the canvas draw instead of here, where it can be reported against the
 * file the seller actually picked.
 */
export function loadImage(fileOrUrl) {
  return new Promise((resolve, reject) => {
    const url = typeof fileOrUrl === 'string' ? fileOrUrl : URL.createObjectURL(fileOrUrl);
    const img = new Image();
    const done = (fn, arg) => {
      if (typeof fileOrUrl !== 'string') URL.revokeObjectURL(url);
      fn(arg);
    };
    img.onload = () => done(resolve, img);
    img.onerror = () => done(reject, new Error('That file could not be read as an image.'));
    img.src = url;
  });
}

/** Fits w×h inside MAX_EDGE without enlarging anything that is already small. */
export function fitWithin(width, height, maxEdge = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height, scaled: false };
  const ratio = maxEdge / longest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
    scaled: true,
  };
}

/**
 * Canvas → Blob, as a promise.
 *
 * toBlob hands back NULL rather than throwing when it cannot encode the type
 * asked for, which is exactly what an unsupported format does — so a null is
 * turned into a rejection here instead of travelling on as an upload of
 * nothing.
 */
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`This browser cannot encode ${type}.`))),
      type,
      quality
    );
  });
}

/**
 * The whole job: crop (optional), resize, encode.
 *
 * `crop` is {x, y, width, height} in the ORIGINAL image's pixels — which is
 * what react-easy-crop's croppedAreaPixels gives — so the caller never has to
 * convert between display and natural coordinates.
 *
 * Returns the blob plus the numbers the dialog shows, because "it worked" is
 * not useful feedback and "4.8 MB → 212 KB" is.
 */
export async function compressImage(file, { crop = null, maxEdge = MAX_EDGE, quality = QUALITY } = {}) {
  const img = await loadImage(file);

  const sourceWidth = crop ? Math.round(crop.width) : img.naturalWidth;
  const sourceHeight = crop ? Math.round(crop.height) : img.naturalHeight;

  if (!sourceWidth || !sourceHeight) {
    throw new Error('That image has no dimensions to work with.');
  }

  const target = fitWithin(sourceWidth, sourceHeight, maxEdge);

  const canvas = document.createElement('canvas');
  canvas.width = target.width;
  canvas.height = target.height;

  const ctx = canvas.getContext('2d');
  /* The browser's own resampler, at its best setting. Left at the default a
     four-times downscale aliases badly on anything with fine detail — a grille,
     a number plate, alloy spokes — which is most of what is photographed here. */
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  /* A transparent PNG drawn straight onto the canvas and encoded as WebP keeps
     its alpha, which is correct. Nothing is flattened here: whether a cutout
     sits on white is the page's decision, not the uploader's. */
  if (crop) {
    ctx.drawImage(
      img,
      Math.round(crop.x), Math.round(crop.y), sourceWidth, sourceHeight,
      0, 0, target.width, target.height
    );
  } else {
    ctx.drawImage(img, 0, 0, target.width, target.height);
  }

  const blob = await canvasToBlob(canvas, 'image/webp', quality);

  return {
    blob,
    width: target.width,
    height: target.height,
    originalBytes: file.size,
    bytes: blob.size,
    originalWidth: img.naturalWidth,
    originalHeight: img.naturalHeight,
    /* Can be NEGATIVE, and the dialog shows it honestly rather than hiding it.
       A small PNG screenshot re-encoded as WebP sometimes grows, and a number
       that only ever reads as a saving is a number nobody can trust. */
    saved: file.size - blob.size,
  };
}

/**
 * The same blob, as a File with a name the server can file.
 *
 * The extension has to follow the TYPE, not the original name: uploading WebP
 * bytes called `photo.jpg` makes every later consumer — the storage key, the
 * content-type sniffing, a seller downloading it again — disagree about what
 * the file is.
 */
export function blobToFile(blob, originalName = 'image') {
  const stem = originalName.replace(/\.[^.]+$/, '') || 'image';
  return new File([blob], `${stem}.webp`, { type: blob.type, lastModified: Date.now() });
}
