/**
 * A cut-out car, placed on a backdrop that looks like a studio.
 *
 * ── Why this step exists at all ─────────────────────────────────────────────
 *
 * Removing the background is the easy half and on its own it is not an
 * improvement. A transparent PNG dropped onto a white card is a car floating in
 * nothing: no ground, no weight, and every edge the segmenter got slightly
 * wrong is silhouetted against flat white where the eye goes straight to it. It
 * is also a much larger file than the photograph it replaced.
 *
 * What a showroom actually wants — and cannot produce itself without a
 * photographer — is every car on the same clean ground, lit the same way, shot
 * from the same distance. That is what makes a grid of twenty listings look
 * like one dealership instead of twenty camera rolls, and it is what this file
 * does with the cut-out.
 *
 * ── The contact shadow is the whole trick ───────────────────────────────────
 *
 * One soft ellipse under the wheels is the difference between a car standing on
 * a floor and a sticker pasted on a gradient. It is drawn slightly narrower
 * than the car and slightly above its lowest pixel, because a shadow that
 * matches the subject exactly reads as a mirror, and one that starts below the
 * tyres leaves the car hovering.
 *
 * A radial gradient rather than `ctx.filter = 'blur()'`: the filter property is
 * unevenly supported on canvas in mobile Safari, and a feature that silently
 * produces a hard black ellipse on an iPhone is worse than one that never used
 * the filter. The gradient is deterministic everywhere and cheaper.
 *
 * ── Everything comes out the same shape ─────────────────────────────────────
 *
 * Fixed 4:3, whatever went in. A uniform grid is most of the value here, and it
 * cannot be uniform if each photo keeps the aspect its author happened to
 * shoot. The car is FITTED inside that frame rather than cropped to it, so a
 * tall photograph loses background and never loses bodywork.
 */

/** The frame every processed photo lands in. 4:3, which is what the cards use. */
const WIDTH = 1600;
const HEIGHT = 1200;

/**
 * How much of the frame is left empty around the car.
 *
 * Generous on purpose. A car that touches the edges reads as cropped, and this
 * image is going into a card that may itself crop a little.
 */
const PADDING = 0.08;

/**
 * Where the car sits vertically. Slightly above centre, because the shadow
 * below it is part of the composition and needs somewhere to fall.
 */
const BASELINE = 0.86;

/**
 * The transparent margin around the subject, removed.
 *
 * The model returns the original frame with the background cleared, so a car
 * photographed small in the middle of a wide shot comes back as a small car
 * surrounded by transparency. Placing that as-is would reproduce the original
 * framing exactly — the one thing this is meant to fix. The bounding box of the
 * non-transparent pixels is the actual subject.
 *
 * `ALPHA_FLOOR` rather than > 0: segmentation leaves a halo of almost-invisible
 * pixels, and a single stray one at alpha 2 would make the box the whole frame.
 */
const ALPHA_FLOOR = 24;

function subjectBounds(data, width, height) {
  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < ALPHA_FLOOR) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  // Nothing solid anywhere: the model cleared the entire image.
  if (right < 0 || bottom < 0) return null;

  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

/**
 * The backdrop.
 *
 * A near-white vertical gradient with a faint floor, rather than flat white:
 * flat white gives the car nothing to stand against and makes the lower edge of
 * a light-coloured car disappear. Kept very light so it reads as a studio wall
 * and never competes with the car for attention.
 */
function paintBackdrop(ctx) {
  const wall = ctx.createLinearGradient(0, 0, 0, HEIGHT);
  wall.addColorStop(0, '#f7f8f9');
  wall.addColorStop(0.62, '#eef0f2');
  wall.addColorStop(1, '#e2e5e9');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** The soft ellipse the car stands on. See the note at the top. */
function paintShadow(ctx, box) {
  const cx = box.x + box.w / 2;
  // Just inside the lowest pixel, so the tyres sit IN it rather than above it.
  const cy = box.y + box.h * 0.985;
  const rx = box.w * 0.46;
  const ry = Math.max(10, box.h * 0.055);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);

  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  shade.addColorStop(0, 'rgba(17, 24, 39, 0.38)');
  shade.addColorStop(0.55, 'rgba(17, 24, 39, 0.16)');
  shade.addColorStop(1, 'rgba(17, 24, 39, 0)');

  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Cut-out in, finished photograph out.
 *
 * @param cut   the canvas from background.js — the original frame with its
 *              background made transparent.
 * @param type  'image/webp' by default. WebP is roughly a third the size of the
 *              JPEG at the same quality and every browser that can run the
 *              segmenter can also encode it; the caller passes 'image/jpeg' if
 *              it ever needs to be certain.
 *
 * @returns a Blob ready to upload, or throws NO_SUBJECT when the model cleared
 *          the whole image — which happens on a photograph with no salient
 *          object in it, such as a close-up of a dashboard.
 */
export async function studioShot(cut, { type = 'image/webp', quality = 0.9 } = {}) {
  const src = cut.getContext('2d', { willReadFrequently: true });
  const { data } = src.getImageData(0, 0, cut.width, cut.height);

  const bounds = subjectBounds(data, cut.width, cut.height);
  if (!bounds) throw new Error('NO_SUBJECT');

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');

  paintBackdrop(ctx);

  /* Fit, never fill: the subject keeps its proportions and the frame absorbs
     the difference. `min` is what makes it a fit — `max` would crop a tall
     photo through the roof of the car. */
  const room = { w: WIDTH * (1 - PADDING * 2), h: HEIGHT * (1 - PADDING * 2) };
  const scale = Math.min(room.w / bounds.width, room.h / bounds.height);

  const box = {
    w: bounds.width * scale,
    h: bounds.height * scale,
    get x() { return (WIDTH - this.w) / 2; },
    get y() { return HEIGHT * BASELINE - this.h; },
  };
  const placed = { w: box.w, h: box.h, x: box.x, y: box.y };

  paintShadow(ctx, placed);

  /* The shadow is drawn first and the car over it, so the shadow never crosses
     the bodywork — which is what gives it away as a drawn ellipse. */
  ctx.drawImage(
    cut,
    bounds.left, bounds.top, bounds.width, bounds.height,
    placed.x, placed.y, placed.w, placed.h
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('ENCODE_FAILED'))),
      type,
      quality
    );
  });
}
