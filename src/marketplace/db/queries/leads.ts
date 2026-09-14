import { getMarketplaceDb } from '@/marketplace/db/client';
import { LEAD_STAGE_KEYS, OPEN_STAGE_KEYS } from '@/marketplace/lib/lead-stages';
import type { Enum } from '@/marketplace/db/types';

/**
 * Leads — every request a showroom has received, and the only inbox it has.
 *
 * There used to be a second one: chat threads, in `inquiries`. Both tables are
 * gone (schema.sql §21.2) and everything a buyer sends is a lead, because a
 * seller with two inboxes checks one of them.
 *
 * A lead is filled in once and kept for its history — including after the car
 * is sold and the listing is deleted, which is why `listing_id` is nullable and
 * `listing_title` is a snapshot beside it.
 */

/**
 * Re-exported, not redeclared. The keys and their LABELS belong together — see
 * lib/lead-stages — and a second copy of the list here is how `cancelled` ends
 * up understood by the table and rejected by the action that writes it.
 */
export { LEAD_STAGE_KEYS as LEAD_STAGES, OPEN_STAGE_KEYS as OPEN_STAGES };

const SELECT = `
  id, vendor_id, listing_id, listing_title, buyer_user_id,
  contact_name, contact_phone, contact_email,
  answers, message, stage, outcome_note, assigned_to, follow_up_at,
  source, read_at, read_by, cancelled_at, cancel_reason, created_at, updated_at
`;

/**
 * One PAGE of a showroom's leads.
 *
 * Always scoped by vendor_id, never by id alone — an id on its own is how one
 * seller reads another's pipeline by editing a URL.
 *
 * ── Everything filters here, not in the browser ─────────────────────────────
 *
 * The table used to receive every lead and do the stage tabs, the unread filter
 * and the search in React. That is fine at forty leads and wrong at four
 * thousand: the page gets slower every week a showroom trades, and — the part
 * that actually misleads people — a search box that only sees the rows already
 * loaded answers "not found" for a lead that exists.
 *
 * So the filters are arguments and the database applies them. Each has an index
 * behind it: leads_vendor_idx for stage, leads_unread_idx for unread,
 * leads_search_idx for the term (schema.sql §21.5).
 *
 * `total` is the count for THIS filter, not the whole pipeline. The two
 * disagreeing is how a Next button ends up leading to an empty table.
 */
export async function getVendorLeads(
  vendorId: string,
  {
    stage,
    unread = false,
    q = '',
    limit = 20,
    offset = 0,
  }: {
    // Wider than Enum<'lead_stage'>: 'open' and 'deleted' are views over the
    // pipeline, not values the column can hold.
    stage?: string;
    unread?: boolean;
    q?: string;
    limit?: number;
    offset?: number;
  } = {},
) {
  if (!vendorId) return { items: [], total: 0 };

  let query = getMarketplaceDb()
    .from('leads')
    .select(SELECT, { count: 'exact' })
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  /**
   * The bin, or everything except the bin.
   *
   * `deleted` is not a stage — a lead in the bin kept the stage it had, which
   * is what makes restoring it give the seller their work back rather than a
   * fresh row (schema.sql §21.3.1). So it is handled here, ahead of the stage
   * filter, and every other view excludes deleted rows outright.
   */
  if (stage === 'deleted') {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);

    if (stage === 'open') query = query.in('stage', OPEN_STAGE_KEYS as Enum<'lead_stage'>[]);
    else if (stage && LEAD_STAGE_KEYS.includes(stage))
      query = query.eq('stage', stage as Enum<'lead_stage'>);
  }

  // Cuts across the stages rather than being one of them: a lead can be unread
  // and already Quoted, if a colleague moved it from their phone.
  if (unread) query = query.is('read_at', null);

  const term = q.trim().toLowerCase();
  if (term) {
    // search_text is written lowercased by the trigger, so this is a plain
    // substring match rather than a lower() per row. The wildcards are added
    // here; % and _ inside the term are escaped so a search for "50%" looks for
    // that text instead of matching everything.
    const safe = term.replace(/[%_\\]/g, (c) => `\\${c}`);
    query = query.ilike('search_text', `%${safe}%`);
  }

  const { data, error, count } = await query;

  // A database that has not run §21 yet has no leads table. That is a state to
  // report as "no leads", not to crash the dashboard over — the page deploys
  // before the SQL is run, always in that order.
  if (error) {
    if (isMissingTable(error)) return { items: [], total: 0, missing: true };

    // 42703 — §21.5 has not been run, so there is no search_text to match on.
    // Reported rather than thrown: the seller gets their pipeline and a note
    // that search needs the migration, not an error page.
    if (error.code === '42703') return { items: [], total: 0, searchUnavailable: true };

    throw new Error(`getVendorLeads: ${error.message}`);
  }

  return { items: data ?? [], total: count ?? 0 };
}

/** How many sit in each stage — the pipeline counters above the table. */
export async function getLeadCounts(vendorId: string) {
  const empty = {
    all: 0, open: 0, unread: 0, deleted: 0,
    ...Object.fromEntries(LEAD_STAGE_KEYS.map((s) => [s, 0])),
  };
  if (!vendorId) return empty;

  const { data, error } = await getMarketplaceDb()
    .from('leads')
    .select('stage, read_at, deleted_at')
    .eq('vendor_id', vendorId);

  if (error) return empty;

  const counts = { ...empty, all: 0 };
  for (const row of data) {
    // A deleted lead counts in exactly one place — the bin — and nowhere else.
    // Counting it under its stage as well is how a seller ends up with a tab
    // that says 4 and shows 3.
    if (row.deleted_at) {
      counts.deleted += 1;
      continue;
    }

    counts.all += 1;
    const tally = counts as Record<string, number>;
    tally[row.stage] = (tally[row.stage] ?? 0) + 1;
    if (OPEN_STAGE_KEYS.includes(row.stage)) counts.open += 1;
    // Read state is not a stage, so it is counted alongside them rather than
    // among them — see the tab in LeadsTable.
    if (!row.read_at) counts.unread += 1;
  }
  return counts;
}

/**
 * How many leads nobody at this showroom has opened yet — the sidebar badge.
 *
 * head:true so Postgres returns the count and no rows. The badge needs one
 * integer, and pulling two hundred leads' worth of answers across the wire to
 * call .length on them is the kind of thing that is invisible until a showroom
 * has four thousand of them.
 *
 * Returns 0 on ANY failure, including a database that has not run §21.3 yet.
 * A badge is an enhancement: the wrong number is worse than no number, and an
 * exception here would take down every seller page at once, since this is read
 * by the shell that wraps all of them.
 */
export async function countUnreadLeads(vendorId: string) {
  if (!vendorId) return 0;

  const { count, error } = await getMarketplaceDb()
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .is('read_at', null)
    .is('deleted_at', null);

  if (error) return 0;
  return count ?? 0;
}

/** One lead, scoped. Returns null rather than throwing for someone else's id. */
export async function getLead(vendorId: string, leadId: string) {
  if (!vendorId || !leadId) return null;

  const { data, error } = await getMarketplaceDb()
    .from('leads')
    .select(SELECT)
    .eq('id', leadId)
    .eq('vendor_id', vendorId)
    // A lead in the bin does not open. Restoring is done from the Deleted tab
    // in the list, so there is nothing on this page for it to be — and a seller
    // working a lead they believe they deleted is the confusion this avoids.
    .is('deleted_at', null)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

/**
 * The buyer's still-open request on this car, if there is one.
 *
 * Read by the listing page so the panel can say "you already asked" BEFORE
 * somebody fills the form in again — being told after typing for a minute is
 * the version of this that feels like a rejection.
 *
 * Scoped to the open stages for the same reason the index is (schema.sql
 * §21.4): once a lead is won or lost the showroom no longer owes an answer, so
 * asking again is a fresh opportunity rather than a duplicate.
 *
 * Returns null on any failure — a listing page must still render, and must
 * still let someone send a request, if this lookup cannot be made.
 */
export async function getOpenLead(vendorId: string, listingId: string, userId: string) {
  if (!vendorId || !listingId || !userId) return null;

  const { data, error } = await getMarketplaceDb()
    .from('leads')
    .select('id, stage, created_at')
    .eq('vendor_id', vendorId)
    .eq('listing_id', listingId)
    .eq('buyer_user_id', userId)
    .in('stage', OPEN_STAGE_KEYS as Enum<'lead_stage'>[])
    // Matches the partial index in §21.4: a lead in the bin holds no slot, so
    // the buyer may send again. Otherwise a seller's mis-tap would lock that
    // person out of enquiring about that car until it was restored.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

/**
 * What a buyer sent, for their own account pages.
 *
 * Its own column list rather than SELECT, and the difference is `read_by` — the
 * id of the salesperson who opened the lead. That is the showroom's internal
 * record of who picked it up; it belongs on a manager's screen and nowhere near
 * the person who sent the enquiry. `read_at` stays, because "the showroom has
 * seen this" is a fair thing for a buyer to know.
 */
export async function getBuyerLeads(userId: string, { limit = 50 } = {}) {
  if (!userId) return [];

  const { data, error } = await getMarketplaceDb()
    .from('leads')
    .select(SELECT.replace(', read_by', ''))
    .eq('buyer_user_id', userId)
    // A lead the showroom deleted is gone from the buyer's list too. If it is
    // restored it reappears, with the status it had.
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return [];
  return data ?? [];
}

/** 42P01 is "relation does not exist" — §21 has not been run yet. */
function isMissingTable(error: { code?: string; message?: string } | null | undefined) {
  return (
    error?.code === '42P01' ||
    /relation .* does not exist|could not find the table/i.test(error?.message ?? '')
  );
}
