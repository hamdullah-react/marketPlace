/**
 * Background removal, in the vendor's own browser.
 *
 * ── Why on the device and not on the server ─────────────────────────────────
 *
 * The photo is already in the browser — it was just chosen from a camera roll —
 * so doing this here costs no upload, no round trip and no server CPU. It also
 * costs nothing PER IMAGE, which matters on a marketplace whose whole point is
 * that lots of showrooms upload lots of cars: a paid API would turn every
 * listing into a line on a bill that grows with success.
 *
 * Server-side was measured and ruled out rather than assumed:
 * @imgly/background-removal-node unpacks to 126.6 MB, which is over Vercel's
 * function limit before any of this application is added to it.
 *
 * ── The licensing, which is the whole reason this file picks what it picks ───
 *
 * Nearly every "background removal in JavaScript" result leads to one of two
 * things that cannot be used in a commercial, closed-source marketplace:
 *
 *   @imgly/background-removal   AGPL-3.0, including the network clause — using
 *                               it would oblige Sauda to publish its own source
 *                               to every visitor, or to buy a licence.
 *   briaai/RMBG-1.4 and 2.0     the models in most tutorials. Licensed
 *                               "other", which is BRIA's non-commercial terms.
 *
 * There is a subtler trap below those. `xrds/isnet-general-onnx-int8` is
 * labelled MIT on the hub and its own metadata names `imgly/isnet-general-onnx`
 * as the base model — AGPL weights. A third party cannot relicense somebody
 * else's AGPL model as MIT, and onnx-community/ISNet-ONNX labels the same
 * lineage honestly as agpl-3.0.
 *
 * So both halves here are deliberately permissive, and both were checked:
 *
 *   @huggingface/transformers   Apache-2.0, 9.5 MB
 *   onnx-community/ormbg-ONNX   Apache-2.0 — "open rmbg", which exists
 *                               precisely because BRIA's is not open
 *
 * ── Why ormbg and not the better model ──────────────────────────────────────
 *
 * BiRefNet is MIT and is the better segmenter. Its smallest ONNX export is
 * 109 MB (fp16) or 213 MB (fp32), and a showroom in Riyadh uploading a car on
 * mobile data is not going to download that to tidy one photograph. ormbg
 * quantised is 42.3 MB for most of the quality.
 *
 * ── Nothing is downloaded until somebody asks for it ────────────────────────
 *
 * Both the library and the model are fetched by the dynamic import below, which
 * runs on the first call and never at page load. A vendor who never presses the
 * button pays nothing — no library, no model, no WASM — and the dashboard's
 * first paint is unchanged. After the first use the browser caches the model,
 * so the second photo is fast.
 *
 * ── It is deliberately one function ─────────────────────────────────────────
 *
 * The engine is the part most likely to be replaced — by a paid API if the
 * quality is ever judged insufficient, or by a better permissive model when one
 * exists. Everything else in this feature talks to `cutout()` and knows nothing
 * about ONNX, so swapping it is this file and no other.
 */

/** The model, and why this exact string. See the licence note above. */
const MODEL = 'onnx-community/ormbg-ONNX';

/**
 * Quantised — 42.3 MB against 168 MB for the full weights.
 *
 * The difference in the cut-out edge of a car is not visible at the size a
 * listing photo is ever displayed, and 126 MB of extra download is.
 */
const DTYPE = 'q8';

/**
 * One pipeline per page, built on first use.
 *
 * Held as the PROMISE rather than the resolved value, so that two photos
 * processed in quick succession wait on the same download instead of starting
 * two of them. A failure clears it, so a vendor who lost their connection
 * half-way can press the button again rather than being stuck with a rejected
 * promise for the life of the tab.
 */
let pipelinePromise = null;

async function getPipeline(onProgress) {
  if (pipelinePromise) return pipelinePromise;

  pipelinePromise = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers');

    /* The model comes from the hub, not from this origin: it is 42 MB of
       weights that would otherwise have to be committed to the repository and
       served from our own bandwidth on every cache miss. */
    env.allowLocalModels = false;

    return pipeline('background-removal', MODEL, {
      dtype: DTYPE,
      /* Reported straight through so the dialog can show a real percentage on
         the first run. Without it the first use is forty seconds of a spinner
         that looks identical to a hang. */
      progress_callback: onProgress,
    });
  })();

  try {
    return await pipelinePromise;
  } catch (err) {
    pipelinePromise = null;
    throw err;
  }
}

/**
 * One image in, the same image with its background removed out.
 *
 * @param source     anything the browser can decode — a blob URL, an https URL,
 *                   a File. A same-origin or CORS-enabled URL is required, which
 *                   is why callers pass a blob URL of the bytes they already
 *                   hold rather than the storage URL.
 * @param onProgress called with transformers.js progress events while the model
 *                   downloads on the FIRST run only.
 *
 * @returns an ImageBitmap-compatible canvas with transparency where the
 *          background was, ready for the compositor.
 */
export async function cutout(source, { onProgress } = {}) {
  const segmenter = await getPipeline(onProgress);

  const output = await segmenter(source);

  /* The pipeline returns an array — one RawImage per input. Given one image it
     is one entry, and an empty array means the model ran and found nothing to
     keep, which is a failure worth naming rather than a blank canvas. */
  const image = Array.isArray(output) ? output[0] : output;
  if (!image) throw new Error('NO_SUBJECT');

  return image.toCanvas();
}

/**
 * Whether this browser can run it at all.
 *
 * WebAssembly is the hard requirement; everything else degrades. Checked before
 * the button is offered, because a button that downloads 42 MB and then fails
 * is worse than one that was never shown.
 */
export function canRemoveBackground() {
  return typeof WebAssembly === 'object' && typeof document !== 'undefined';
}
