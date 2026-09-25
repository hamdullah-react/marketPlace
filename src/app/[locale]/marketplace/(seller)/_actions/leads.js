'use server';

/**
 * Working a lead.
 *
 * These four are the whole CRM: move it along the pipeline, put a name and a
 * date on it, write down why it ended, and throw away the ones that are spam.
 * Everything else a "real" CRM does — sequences, scoring, custom pipelines —
 * is a feature nobody here asked for that would have to be maintained forever.
 *
 * ── Scoping ─────────────────────────────────────────────────────────────────
 *
 * Every write is filtered by vendor_id as well as id, and the vendor_id comes
 * from vendorForAction() rather than from the form. An id on its own is how one
 * showroom edits another's pipeline by changing a number in a POST body.
 *
 * A lead that is not this vendor's returns NOT_FOUND rather than a refusal, so
 * the response cannot be used to test whether an id exists.
 */

import { revalidatePath } from 'next/cache';
import { parseInstant } from '@/marketplace/lib/datetime';
import { redirect } from 'next/navigation';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction, getUser } from '@/marketplace/auth/session';
import { LEAD_STAGES } from '@/marketplace/db/queries/leads';
import { notifyVendorLeads, notifyBuyerRequests } from '@/marketplace/lib/realtime';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, errors: {}, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, errors: {}, token: stamp(), ...extra });

/**
 * The two paths a change can be visible on — plus every OTHER dashboard.
 *
 * revalidatePath only reaches the browser that made the request. A colleague
 * with the pipeline open on the screen behind the desk, or the same seller's
 * second tab, learns nothing from it — so the broadcast is what keeps the
 * unread badge honest across a showroom rather than per browser.
 */
function refresh(vendorId, leadId, buyerUserId = null, extra = {}) {
  revalidatePath('/[locale]/marketplace/seller/leads', 'page');
  revalidatePath('/[locale]/marketplace/seller/leads/[id]', 'page');
  if (vendorId) notifyVendorLeads(vendorId, 'lead_changed', { id: leadId ?? null, ...extra });

  /**
   * And the person who is waiting on it.
   *
   * The buyer's request page shows a stage now, so a seller moving a lead to
   * "Price sent" is news on TWO screens. Sending it here rather than at each
   * call site is what stops the buyer's half being forgotten the next time an
   * action is added — every path that changes a lead already comes through
   * this function.
   *
   * Their own page is revalidated too: revalidatePath reaches only the browser
   * that made the request, and that browser is the seller's.
   */
  if (buyerUserId) {
    revalidatePath('/[locale]/marketplace/account/requests', 'page');
    notifyBuyerRequests(buyerUserId, 'request_changed', { id: leadId ?? null, ...extra });
  }
}

/**
 * Resolves the caller's showroom and confirms the lead is theirs.
 *
 * Returns the row, so callers that need the current values do not fetch twice.
 */
async function ownLead(formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return { error: denied };
  if (!vendorId) return { error: 'MISSING_VENDOR' };

  const leadId = str(formData, 'leadId');
  if (!leadId) return { error: 'NOT_FOUND' };

  const db = getMarketplaceDb();
  const { data, error } = await db
    .from('leads')
    .select('id, stage, assigned_to, follow_up_at, outcome_note, read_at, buyer_user_id, deleted_at')
    .eq('id', leadId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  // 42P01 — schema.sql §21 has not been run on this database.
  if (error?.code === '42P01') return { error: 'LEADS_NOT_MIGRATED' };
  if (!data) return { error: 'NOT_FOUND' };

  return { db, vendorId, leadId, lead: data };
}

/** Move it along the pipeline. */
export async function setLeadStage(prevState, formData) {
  const found = await ownLead(formData);
  if (found.error) return bad(found.error);

  const stage = str(formData, 'stage');
  if (!LEAD_STAGES.includes(stage)) return bad('NOT_FOUND');

  /**
   * `cancelled` is the BUYER's word, not the showroom's.
   *
   * LEAD_STAGES now contains it, so without this a hand-made POST — or a later
   * button added without thinking — could file a seller's dead deal as "the
   * buyer withdrew". Those are different facts, and the one report worth having
   * (how many customers walked away by themselves) stops being trustworthy the
   * moment a seller can write it. A seller ending a deal means `lost`.
   *
   * Moving a lead OUT of cancelled is allowed: a buyer who cancels and then
   * rings back is an ordinary thing, and refusing it would strand the lead.
   */
  if (stage === 'cancelled') return bad('STAGE_NOT_YOURS');

  // Stage only. Assignment and the follow-up date are the seller's separate
  // decisions — inferring an owner from "somebody moved the card" is how a lead
  // ends up assigned to whoever last touched it rather than whoever is working
  // it.
  const { error } = await found.db
    .from('leads')
    .update({ stage })
    .eq('id', found.leadId)
    .eq('vendor_id', found.vendorId);

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  refresh(found.vendorId, found.leadId, found.lead.buyer_user_id, { stage });
  return ok({ saved: stage });
}

/**
 * The three fields a salesperson actually edits.
 *
 * One action rather than three, because they are one form: a seller picking the
 * lead up puts their name on it, sets a callback date and writes a line, and
 * three separate saves would be three round trips for one decision.
 */
export async function updateLead(prevState, formData) {
  const found = await ownLead(formData);
  if (found.error) return bad(found.error);

  const assignedTo = str(formData, 'assignedTo');
  const followUp = str(formData, 'followUpAt');
  const note = str(formData, 'outcomeNote');

  if (note.length > 2000) return bad('NOTE_TOO_LONG');

  /* An instant, converted in the browser — the comment that used to be here
     said this was "passed through as-is" to avoid a shift on a server that is
     not in Riyadh, and then did a Date round-trip anyway, which is exactly the
     shift it warned about. A reminder set for 9am was stored as noon.
     See lib/datetime.js. */
  let followUpAt = null;
  if (followUp) {
    const parsed = parseInstant(followUp);
    if (!parsed) return bad('DATE_INVALID');
    followUpAt = parsed.toISOString();
  }

  const { error } = await found.db
    .from('leads')
    .update({
      assigned_to: assignedTo || null,
      follow_up_at: followUpAt,
      outcome_note: note || null,
    })
    .eq('id', found.leadId)
    .eq('vendor_id', found.vendorId);

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  refresh(found.vendorId, found.leadId);
  return ok({ saved: 'lead' });
}

/**
 * Deleting one — recoverably.
 *
 * Offered because spam exists and a pipeline nobody trusts is a pipeline nobody
 * opens.
 *
 * ── It used to be a hard delete, and that was wrong ─────────────────────────
 *
 * The argument was that nothing downstream reports on leads, so there is no
 * accounting reason to keep the row. True, and beside the point: the delete
 * button sits in a table row one line away from Open, and a mis-tap destroyed a
 * customer — their name, their number, every answer they gave — with no way
 * back. "Ring them again" is not a recovery procedure when their number was the
 * thing that was deleted.
 *
 * So it marks the row (schema.sql §21.3.1). The lead leaves every seller view
 * at once, exactly as before, and Deleted holds it until somebody restores it
 * or the 30 days run out.
 *
 * ── The buyer's side still goes immediately ────────────────────────────────
 *
 * `deleted: true` on the broadcast, so their request disappears from their list
 * now rather than after a wait. If the seller restores it, it comes back. The
 * alternative — leaving it visible for 30 days — would show a buyer a request
 * that no showroom is working.
 */
export async function deleteLead(prevState, formData) {
  const found = await ownLead(formData);
  if (found.error) return bad(found.error);

  const user = await getUser().catch(() => null);

  const { error } = await found.db
    .from('leads')
    .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null })
    .eq('id', found.leadId)
    .eq('vendor_id', found.vendorId)
    // Already in the bin: deleting twice must not overwrite who did it first.
    .is('deleted_at', null);

  // 42703 — schema.sql §21.3.1 has not been run, so there is no deleted_at
  // column. Named rather than reported as "could not save", because the fix is
  // a migration and not a retry.
  if (error) {
    return bad(error.code === '42703' ? 'DELETE_NOT_MIGRATED' : 'SAVE_FAILED', {
      detail: error.message,
    });
  }

  /**
   * Emptying the old end of the bin, here rather than on a schedule.
   *
   * There is no cron on this project, and a bin that only ever fills is a
   * slowly growing table of dead rows. Doing it on delete bounds the work to
   * one showroom and runs it exactly when the bin was touched — the seller
   * waits on one indexed delete over `leads_deleted_idx`, and never on a sweep
   * of anybody else's leads.
   *
   * Failure is ignored on purpose: not tidying up is not a reason to tell a
   * seller their delete did not work.
   */
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await found.db
    .from('leads')
    .delete()
    .eq('vendor_id', found.vendorId)
    .lt('deleted_at', cutoff)
    .then(null, () => {});

  refresh(found.vendorId, found.leadId, found.lead.buyer_user_id, { deleted: true });

  /**
   * Leaving the page that no longer exists.
   *
   * Deleting from the lead's OWN page used to land on a 404. refresh() above
   * revalidates '/[locale]/marketplace/seller/leads/[id]', which is the route
   * the seller is standing on — so Next re-rendered it, getLead() returned null
   * for a row that had just been deleted, notFound() fired, and the 404 won the
   * race against the client-side router.replace() that was supposed to move
   * them. The redirect has to be part of the action's own response, not a thing
   * the browser tries afterwards.
   *
   * Only when the caller asks. Deleting from the leads TABLE is already on the
   * list, and redirecting there would throw away the filters and the page
   * number in their URL for no reason.
   *
   * ── Why the target is checked ───────────────────────────────────────────
   *
   * It arrives in the form, so it is attacker-controlled. Anything not starting
   * with a single '/' is ignored: '//evil.com' is protocol-relative and would
   * send a signed-in seller off-site, which is the classic open redirect.
   */
  const back = str(formData, 'redirectTo');
  if (back.startsWith('/') && !back.startsWith('//')) redirect(back);

  return ok({ saved: 'deleted', deleted: true });
}


/**
 * Marking one as read — fired when the seller opens it.
 *
 * ── Why an action and not a write during the page render ────────────────────
 *
 * Marking read in the server component would be a side effect during render:
 * React may render a tree twice, a prefetch renders it without anyone seeing
 * it, and a hover over the Open link would quietly empty the badge for a lead
 * nobody opened. So the page renders read-only and a client effect reports that
 * the lead was actually put on screen.
 *
 * ── Only the first time ─────────────────────────────────────────────────────
 *
 * `.is('read_at', null)` in the filter, not a check in JavaScript. Two tabs
 * opening the same lead race, and the filter makes the second one a no-op at
 * the database rather than one that overwrites the first reader's name.
 * Re-opening a lead a week later must not move its read time either — "when was
 * this first seen" is the useful fact.
 */
/**
 * Putting one back.
 *
 * The reason deleteLead marks instead of removing. This is the path that runs
 * when somebody has ALREADY made a mistake, so it is deliberately the simplest
 * thing in this file: one UPDATE, on a row that never moved, whose foreign keys
 * and indexes were never disturbed. There is no half-restored state it can land
 * in.
 *
 * ── It comes back where it was ─────────────────────────────────────────────
 *
 * Stage, owner, follow-up date, read state and every answer are untouched by
 * the delete, so a lead restored an hour later is the lead that was there an
 * hour ago rather than a fresh one at the top of the pipeline. That is the
 * whole point: a seller who deleted the wrong row wants their work back, not a
 * copy of the buyer's contact details.
 *
 * The buyer's list gets it back too — their request reappears with the status
 * it had, because from their side nothing ever happened.
 */
export async function restoreLead(prevState, formData) {
  const found = await ownLead(formData);
  if (found.error) return bad(found.error);

  // Not in the bin. Not an error worth a red banner — two people pressing
  // Restore on the same lead is an ordinary thing in a shared inbox.
  if (!found.lead.deleted_at) return ok({ saved: 'restored', already: true });

  const { error } = await found.db
    .from('leads')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', found.leadId)
    .eq('vendor_id', found.vendorId);

  if (error) {
    return bad(error.code === '42703' ? 'DELETE_NOT_MIGRATED' : 'SAVE_FAILED', {
      detail: error.message,
    });
  }

  /**
   * `deleted: false`, so the buyer's page puts the row back rather than
   * leaving a request the showroom is once again working invisible to the
   * person who sent it.
   */
  refresh(found.vendorId, found.leadId, found.lead.buyer_user_id, { deleted: false });
  return ok({ saved: 'restored' });
}

export async function markLeadRead(prevState, formData) {
  const found = await ownLead(formData);
  if (found.error) return bad(found.error);

  // Already read: say so and touch nothing. Not an error — re-opening a lead is
  // the most ordinary thing a seller does.
  if (found.lead.read_at) return ok({ alreadyRead: true });

  const user = await getUser().catch(() => null);

  const { error } = await found.db
    .from('leads')
    .update({ read_at: new Date().toISOString(), read_by: user?.id ?? null })
    .eq('id', found.leadId)
    .eq('vendor_id', found.vendorId)
    .is('read_at', null);

  // 42703 — §21.3 has not been run. The lead still opens; it just cannot be
  // marked, so this reports rather than failing the page it was called from.
  if (error) return bad(error.code === '42703' ? 'LEADS_NOT_MIGRATED' : 'SAVE_FAILED');

  // Only the list: the detail page shows nothing that changed, and revalidating
  // the route the seller is standing on would re-render it under them.
  revalidatePath('/[locale]/marketplace/seller/leads', 'page');
  notifyVendorLeads(found.vendorId, 'lead_changed', { id: found.leadId });
  return ok({ saved: 'read' });
}

/**
 * Marking the whole pipeline read.
 *
 * The escape hatch for a badge that has become noise — a showroom back from a
 * fortnight off does not want to open sixty leads one at a time to get the
 * number down. It is offered from the list, next to the count, so it is only
 * ever pressed by someone already looking at the leads it clears.
 */
export async function markAllLeadsRead(prevState, formData) {
  const { vendorId, error: denied } = await vendorForAction(str(formData, 'vendorId') || null);
  if (denied) return bad(denied);
  if (!vendorId) return bad('MISSING_VENDOR');

  const user = await getUser().catch(() => null);

  const { error, count } = await getMarketplaceDb()
    .from('leads')
    .update(
      { read_at: new Date().toISOString(), read_by: user?.id ?? null },
      { count: 'exact' }
    )
    .eq('vendor_id', vendorId)
    .is('read_at', null);

  if (error) {
    if (error.code === '42703' || error.code === '42P01') return bad('LEADS_NOT_MIGRATED');
    return bad('SAVE_FAILED', { detail: error.message });
  }

  refresh(vendorId);
  return ok({ saved: 'read-all', marked: count ?? 0 });
}
