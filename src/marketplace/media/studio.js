/**
 * A cut-out car, trimmed and grounded, on a TRANSPARENT background.
 *
 * ── Why transparent, after this file first did the opposite ─────────────────
 *
 * The first version of this painted a light studio gradient behind the car and
 * returned an opaque photograph. It was wrong, and the card is what proves it:
 *
 *   className="h-full w-full object-contain drop-shadow-[0_12px_18px_...]"
 *
 * Both halves of that say "transparent". `object-contain` fits the whole image
 * into the stage rather than cropping it, so a picture with its own background
 * arrives as a rectangle sitting inside the card instead of a car standing on
 * it. And a CSS `drop-shadow` follows the image's ALPHA SILHOUETTE — given an
 * opaque rectangle it draws a neat shadow around the rectangle, which is
 * exactly the box that was showing on the listing grid.
 *
 * The card surfaces are themed, too (`raised-card` resolves through the
 * admin's palette), so any colour baked in here is a colour that stops
 * matching the moment somebody changes the theme, and never matches dark mode
 * at all. Transparency is the only backdrop that is correct in every surface
 * this image can land in.
 *
 * ── The contact shadow stays, and is baked IN ───────────────────────────────
 *
 * Removing the background without grounding the car is what makes a cutout
 * look pasted on, so the soft ellipse under the wheels is still drawn — into
 * the transparent image, not onto a backdrop.
 *
 * Baked rather than left to the consumer because this image is used in more
 * than one place: the card has its own drop-shadow, the detail page and the
 * storefront do not. A shadow that travels with the picture looks right in all
 * of them, and the card's own drop-shadow sits on top of it as a little extra
 * depth on the bodywork rather than as a competing second shadow.
 *
 * A radial gradient rather than `ctx.filter = 'blur()'`: the filter property is
 * unevenly supported on canvas in mobile Safari, and a feature that silently
 * renders a hard black ellipse on an iPhone is worse than one that never used
 * it. The gradient is deterministic everywhere and cheaper.
 *
 * ── Trimmed to the car, not letterboxed ─────────────────────────────────────
 *
 * The model returns the ORIGINAL frame with the background cleared, so a car
 * photographed small in a wide shot comes back as a small car surrounded by
 * transparency. Passed to `object-contain` that transparency is counted as part
 * of the image, and the car is drawn tiny in the middle of the stage — the
 * original framing, faithfully preserved, which is the thing this is meant to
 * fix. So the frame is cut down to the car itself.
 */

/**
 * The transparent margin around the subject, removed.
 *
 * `ALPHA_FLOOR` rather than > 0: segmentation leaves a halo of almost-invisible
 * pixels, and one stray pixel at alpha 2 in a corner would make the bounding
 * box the whole frame again.
 */
const ALPHA_FLOOR = 24;

/** Breathing room around the car, as a fraction of its longest side. */
const MARGIN = 0.05;

/**
 * Extra room under the car for the shadow to fall into.
 *
 * Measured rather than guessed: at the first value the ellipse was so tight to
 * the bodywork that the car was drawn over almost all of it and only a few
 * faded pixels showed below the wheels — a probe directly under the car came
 * back at alpha 0. A shadow nobody can see is just bytes.
 */
const FLOOR = 0.16;

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
 * The soft ellipse the car stands on.
 *
 * Drawn slightly narrower than the car and slightly ABOVE its lowest pixel: a
 * shadow the exact width of the subject reads as a mirror, and one that starts
 * below the tyres leaves the car hovering over its own shadow.
 */
function paintShadow(ctx, car) {
  const cx = car.x + car.w / 2;
  /* Centred just BELOW the lowest pixel rather than on it. The car is drawn
     over this afterwards, so an ellipse centred inside the silhouette is an
     ellipse the car hides. */
  const cy = car.y + car.h * 1.012;
  const rx = car.w * 0.48;
  const ry = Math.max(12, car.h * 0.085);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);

  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  shade.addColorStop(0, 'rgba(17, 24, 39, 0.34)');
  shade.addColorStop(0.55, 'rgba(17, 24, 39, 0.14)');
  shade.addColorStop(1, 'rgba(17, 24, 39, 0)');

  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Cut-out in, finished picture out.
 *
 * @param cut   the canvas from background.js — the original frame with its
 *              background made transparent.
 * @param type  'image/webp' by default, and it has to be a format WITH an
 *              alpha channel. WebP carries transparency at roughly a third the
 *              size of the equivalent PNG, and every browser that can run the
 *              segmenter can encode it. Passing 'image/jpeg' here would throw
 *              the transparency away and reintroduce the white box.
 *
 * @returns a Blob ready to upload, or throws NO_SUBJECT when the model cleared
 *          the whole image — which happens on a photograph with no salient
 *          object in it, such as a close-up of a dashboard.
 */
export async function studioShot(cut, { type = 'image/webp', quality = 0.92 } = {}) {
  const src = cut.getContext('2d', { willReadFrequently: true });
  const { data } = src.getImageData(0, 0, cut.width, cut.height);

  const bounds = subjectBounds(data, cut.width, cut.height);
  if (!bounds) throw new Error('NO_SUBJECT');

  const pad = Math.round(Math.max(bounds.width, bounds.height) * MARGIN);
  const floor = Math.round(bounds.height * FLOOR);

  const canvas = document.createElement('canvas');
  canvas.width = bounds.width + pad * 2;
  canvas.height = bounds.height + pad + floor;

  /* No fill of any kind. An untouched canvas is fully transparent, and that is
     the backdrop — see the note at the top of this file. */
  const ctx = canvas.getContext('2d');

  const car = { x: pad, y: pad, w: bounds.width, h: bounds.height };

  /* Shadow first, car over it, so the ellipse never crosses the bodywork —
     which is what gives it away as a drawn shape rather than a shadow. */
  paintShadow(ctx, car);

  ctx.drawImage(
    cut,
    bounds.left, bounds.top, bounds.width, bounds.height,
    car.x, car.y, car.w, car.h
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('ENCODE_FAILED'))),
      type,
      quality
    );
  });
}
