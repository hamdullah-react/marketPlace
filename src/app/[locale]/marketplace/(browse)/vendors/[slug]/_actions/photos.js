'use server';

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';
import { updateVendor } from '@/marketplace/db/queries/settings';

/**
 * The two photos on a showroom's own storefront, changed from the storefront.
 *
 * The same two columns Settings writes (logo_url, banner_url) — this is not a
 * second way of storing them, only a second place to reach them. A seller
 * looking at their own page and seeing the wrong cover should be able to fix it
 * there, rather than remembering which tab of which dashboard it lives on.
 *
 * Everything else about a showroom stays in Settings. A public page is a bad
 * place to edit a VAT number, and a page that is half form is worse than a page
 * that is not one.
 */

const COLUMN = { logo: 'logo_url', banner: 'banner_url' };

/** Fresh token per result, so useActionResult can tell a new answer from a stale one. */
const stamp = () => Date.now() + Math.random();
const bad = (error) => ({ ok: false, error, token: stamp() });

/**
 * Both places these two columns are read: the storefront being edited, and
 * the Settings form that holds the same two fields.
 */
function refresh() {
  revalidatePath('/[locale]/marketplace/vendors/[slug]', 'page');
  revalidatePath('/[locale]/marketplace/seller/settings', 'page');
}

export async function saveStorefrontPhoto(prevState, formData) {
  const wanted = String(formData.get('vendorId') ?? '').trim();
  const column = COLUMN[String(formData.get('field') ?? '')];
  const url = String(formData.get('url') ?? '').trim();

  /**
   * Removing the photo is a save too.
   *
   * Without this the pencil could only ever REPLACE a picture, and a seller
   * who wanted their cover gone had to find the Settings tab, clear the
   * field there and remember to press Save — three steps for the opposite
   * of the one they had just done in one.
   *
   * Its own flag rather than "an empty url means clear", so a bug that
   * dropped the url on the way here cannot silently wipe a storefront.
   */
  const clearing = String(formData.get('clear') ?? '') === '1';

  if (!column) return bad('BAD_FIELD');
  if (!url && !clearing) return bad('NO_IMAGE');

  const { vendorId, error } = await vendorForAction(wanted || null);
  if (error) return bad(error);

  /**
   * vendorForAction() falls back to the caller's FIRST showroom when `wanted`
   * is not one of theirs. On the dashboard that is a kindness — a stale
   * ?vendor= link shows someone their own data instead of a refusal.
   *
   * Here it would be a defect. The id comes from whichever storefront is being
   * looked at, so a seller opening another showroom's page would get a pencil
   * that silently rewrote the logo of their OWN shop. Refuse instead of
   * degrading.
   */
  if (wanted && vendorId !== wanted) return bad('NOT_YOUR_STORE');

  /* Nothing to vouch for when the answer is "no picture at all", so the
     library check below is skipped rather than failed. */
  if (clearing) {
    try {
      await updateVendor(vendorId, { [column]: null });
    } catch (err) {
      console.error('[storefront-photo] clear:', err.message);
      return bad('SAVE_FAILED');
    }
    refresh();
    return { ok: true, error: null, token: stamp(), url: null };
  }

  /**
   * The picture has to be IN THE LIBRARY — not owned by this showroom.
   *
   * It was the narrower rule, and the narrower rule was wrong. The picker
   * also offers shared template artwork (media_assets rows with a null
   * vendor_id — 46 of them on this database), so a seller could choose a
   * perfectly ordinary logo out of the dialog and be told to "choose an
   * image from your own library" by the thing that had just offered it.
   *
   * The test now matches exactly what getVendorMedia() shows: their own
   * uploads, or shared artwork. Anything they can see, they can use.
   *
   * What it still refuses is a URL that is in no library at all. The dialog
   * cannot produce one, so this only bites a hand-made POST — which is the
   * case worth refusing: a storefront header is a public page, and an
   * arbitrary remote URL there is a hotlink or a tracking pixel aimed at
   * every visitor. Uploading is untouched; anything uploaded is in the
   * library by definition.
   */

  const { data: asset, error: lookupError } = await getMarketplaceDb()
    .from('media_assets')
    .select('id')
    .eq('url', url)
    // Theirs, or shared. `.or()` takes a filter string; vendorId comes from
    // the session rather than the form, so there is nothing to inject.
    .or(`vendor_id.eq.${vendorId},vendor_id.is.null`)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    console.error('[storefront-photo] media lookup:', lookupError.message);
    return bad('SAVE_FAILED');
  }
  if (!asset) return bad('NOT_YOUR_IMAGE');

  try {
    await updateVendor(vendorId, { [column]: url });
  } catch (err) {
    console.error('[storefront-photo]', err.message);
    return bad('SAVE_FAILED');
  }

  refresh();


  return { ok: true, error: null, token: stamp(), url };
}
