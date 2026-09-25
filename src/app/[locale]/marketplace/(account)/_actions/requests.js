'use server';

/**
 * Withdrawing a request — which deletes it, for both sides, at once.
 *
 * ── Why a buyer needs this ──────────────────────────────────────────────────
 *
 * They bought elsewhere, changed their mind, or pressed Send on the wrong car —
 * and until now had no way to say so. What happened instead is that they
 * stopped answering their phone, and a salesperson spent three days chasing a
 * deal that had ended a week earlier. Cancelling costs the showroom nothing and
 * saves it exactly that.
 *
 * ── Why it is a delete and not a `cancelled` stage ──────────────────────────
 *
 * It was a stage: the lead moved to `cancelled`, stayed in the showroom's table
 * as a record that somebody had withdrawn, and the buyer then needed a SECOND
 * button to clear it off their own list. Two steps for one decision, and a row
 * on the seller's screen that they must read, judge and scroll past for ever.
 *
 * A withdrawn enquiry is not a record of anything that happened. The buyer
 * asked, changed their mind, and said so; both sides agree it is over, so
 * nobody's history is being rewritten by removing it. One press, gone from both
 * screens.
 *
 * The cost, stated plainly: the showroom no longer learns that this particular
 * person withdrew, and "how many buyers walk away" stops being answerable. That
 * is the trade this makes deliberately.
 *
 * ── Scoping ─────────────────────────────────────────────────────────────────
 *
 * Every write is filtered by buyer_user_id as well as id, and the id of the
 * buyer comes from the SESSION rather than the form. A lead id on its own would
 * otherwise be a way to delete a stranger's request by changing a number in a
 * POST body. A lead that is not theirs returns NOT_FOUND rather than a refusal,
 * so the response cannot be used to test whether an id exists.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { recordNotification } from '@/marketplace/db/queries/notifications';
import { currentViewer } from '@/marketplace/auth/session';
import { canBuyerCancel, OPEN_STAGE_KEYS } from '@/marketplace/lib/lead-stages';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

export async function cancelRequest(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const leadId = str(formData, 'leadId');
  const locale = str(formData, 'locale') || 'ar';

  if (!leadId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: lead, error: readError } = await db
    .from('leads')
    .select('id, stage, vendor_id, listing_title, contact_name')
    .eq('id', leadId)
    .eq('buyer_user_id', viewer.userId)
    .maybeSingle();

  if (readError?.code === '42P01') return bad('LEADS_NOT_MIGRATED');
  if (!lead) return bad('NOT_FOUND');

  /**
   * Only while somebody might still act on it.
   *
   * Cancelling a request that is already sold or closed is not a thing that
   * means anything, and allowing it would let a buyer delete a showroom's
   * completed sale from its own books after the fact.
   */
  if (!canBuyerCancel(lead.stage)) return bad('ALREADY_CLOSED');

  const { error } = await db
    .from('leads')
    .delete()
    .eq('id', lead.id)
    .eq('buyer_user_id', viewer.userId)
    // Re-checked at the database as well as above: between the read and this
    // write the showroom may have marked it sold, and the buyer must not be
    // able to erase that by having been slower.
    .in('stage', ['new', 'contacted', 'quoted']);

  if (error) return bad('SAVE_FAILED');

  /**
   * The showroom's open dashboards, at once.
   *
   * lead_changed rather than lead_new: nothing arrived, so nothing chimes — but
   * a row has vanished from under a salesperson who may be looking straight at
   * it, and `deleted` is what tells the dashboard to leave that lead's page
   * instead of re-rendering it into a 404.
   */
  notifyVendorLeads(lead.vendor_id, 'lead_changed', { id: lead.id, deleted: true });

  /* ── And a record, for the salesperson who was not looking ─────────────
     The broadcast above only reaches a dashboard that is open right now. A
     withdrawn request matters most to the person who was going to ring them
     tomorrow — without this they find out by calling somebody who has already
     bought elsewhere.

     Snapshotted before the delete, because the row is gone by the time this
     runs and a notification that reads "a buyer withdrew" with no name and no
     car is not worth sending. */
  await recordNotification({
    audience: 'vendor',
    vendorId: lead.vendor_id,
    kind: 'lead_cancelled',
    data: { buyer: lead.contact_name ?? null, car: lead.listing_title ?? null },
    href: '/marketplace/seller/leads',
  });

  revalidatePath(`/${locale}/marketplace/account/requests`);
  revalidatePath('/[locale]/marketplace/seller/leads', 'page');
  revalidatePath('/[locale]/marketplace/seller/leads/[id]', 'page');

  /**
   * The CAR's page, so it offers to take a request again.
   *
   * The listing asks getOpenLead() whether this buyer already has one open, and
   * turns "Request a quote" into a green "Request sent" when they do. Withdraw
   * the request and that answer changes — but the page the buyer's browser is
   * holding was rendered when it was still true, so going back to the car
   * showed "Request sent" for a request that no longer existed, with no way to
   * ask again short of a hard reload.
   *
   * The route PATTERN rather than the one slug: this action never learns which
   * car it was, and every listing page renders the same per-buyer answer, so
   * refreshing them all is both correct and cheap — revalidatePath reaches only
   * the browser that made the request, which is this buyer's.
   */
  revalidatePath('/[locale]/marketplace/listing/[slug]', 'page');

  return ok({ cancelled: lead.id, deleted: true });
}


/**
 * Clearing a finished request off the buyer's list — and off the showroom's.
 *
 * ── A cancelled request is DELETED, for both sides ──────────────────────────
 *
 * This used to be a hide: buyer_hidden_at was set, the buyer's list stopped
 * showing it and the showroom kept the row. The reasoning was that the row is
 * the showroom's record — and for a sale that is right, which is why won and
 * lost are still hidden rather than destroyed.
 *
 * It is wrong for a CANCELLED request, and that is what this now deletes
 * outright. A withdrawn enquiry is not a record of anything that happened: the
 * buyer asked, changed their mind, and said so. Leaving it in the seller's
 * table gives them a row to read, decide about and scroll past for ever — a
 * permanent piece of clutter representing a customer who is gone. Both parties
 * agree it is over, so nobody is rewriting anybody's history by removing it.
 *
 * ── Why won and lost are still only hidden ──────────────────────────────────
 *
 * Those two ARE the showroom's sales record, and this action runs on the
 * BUYER's authority. Letting one party hard-delete a completed sale from the
 * other party's books is not a delete button, it is a way to erase evidence —
 * enquire, buy, then remove that any of it happened. The buyer's list loses the
 * row either way, so the button behaves identically from where they are
 * standing; the difference only exists on the side that needs the record.
 */
export async function removeRequest(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const leadId = str(formData, 'leadId');
  const locale = str(formData, 'locale') || 'ar';
  if (!leadId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();

  const { data: lead, error: readError } = await db
    .from('leads')
    .select('id, stage, vendor_id')
    .eq('id', leadId)
    .eq('buyer_user_id', viewer.userId)
    .maybeSingle();

  if (readError?.code === '42P01') return bad('LEADS_NOT_MIGRATED');
  if (!lead) return bad('NOT_FOUND');

  /**
   * Still live, so there is nothing to clear.
   *
   * Removing a request the showroom is actively working would leave the buyer
   * with no way to find it and no way to cancel it — they would simply get a
   * phone call about something they can no longer see. Cancel first, then
   * clear.
   */
  if (OPEN_STAGE_KEYS.includes(lead.stage)) return bad('STILL_OPEN');

  if (lead.stage === 'cancelled') {
    // Gone from both sides. Scoped by buyer_user_id as well as id so a lead id
    // on its own is never enough to delete a stranger's row.
    const { error } = await db
      .from('leads')
      .delete()
      .eq('id', lead.id)
      .eq('buyer_user_id', viewer.userId)
      // Re-checked at the database: between the read above and this write the
      // stage cannot have moved anywhere a delete would be wrong, and saying so
      // here is what makes that true rather than merely likely.
      .eq('stage', 'cancelled');

    if (error) return bad('SAVE_FAILED');

    /**
     * The showroom's table HAS changed now, unlike when this was a hide — so
     * the open dashboards are told. lead_changed, not lead_new: nothing
     * arrived, so nothing chimes, but the count and the list are stale until
     * they re-read.
     */
    notifyVendorLeads(lead.vendor_id, 'lead_changed', { id: lead.id, deleted: true });

    revalidatePath(`/${locale}/marketplace/account/requests`);
    revalidatePath('/[locale]/marketplace/seller/leads', 'page');
    revalidatePath('/[locale]/marketplace/seller/leads/[id]', 'page');

    return ok({ removed: lead.id, deleted: true });
  }

  // won / lost — the showroom's record. Hidden from the buyer, untouched for
  // the seller. See the note above.
  const { error } = await db
    .from('leads')
    .update({ buyer_hidden_at: new Date().toISOString() })
    .eq('id', lead.id)
    .eq('buyer_user_id', viewer.userId);

  // 42703 — §21.8 has not been run yet.
  if (error) return bad(error.code === '42703' ? 'HIDE_NOT_MIGRATED' : 'SAVE_FAILED');

  revalidatePath(`/${locale}/marketplace/account/requests`);
  return ok({ removed: lead.id });
}
