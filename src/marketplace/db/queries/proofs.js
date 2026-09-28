import 'server-only';

/**
 * Reading payment proofs — the receipts a showroom sends for a charge.
 *
 * ── The screenshot has no permanent URL, on purpose ─────────────────────────
 *
 * They live in a PRIVATE bucket (see the PAYMENT PROOFS section of schema.sql),
 * because a transfer receipt carries an account number and a holder's name. So
 * a row carries a storage PATH, and a link is signed at the moment somebody
 * with the right to see it asks — `signProof` below. Nothing here ever hands
 * back an address that keeps working.
 *
 * ── They never throw ────────────────────────────────────────────────────────
 *
 * A missing table (the section not run yet) gives an empty list and a page that
 * says so. The billing screens have to keep working while this is being rolled
 * out: a showroom must still be able to SEE what it owes on a database where it
 * cannot yet send a receipt.
 */

import { getMarketplaceDb } from '@/marketplace/db/client';
import { isMissingSchema } from './engagement';

export const PROOF_BUCKET = 'marketplace-payments';

/** A signed link is a credential. An hour is long enough to open a receipt. */
const TTL_SECONDS = 60 * 60;

const FIELDS =
  'id, charge_id, vendor_id, storage_path, mime_type, method, reference, amount, ' +
  'paid_at, note, state, review_note, reviewed_by, reviewed_at, created_at';

/**
 * A short-lived link to one receipt.
 *
 * The CALLER decides who may see it — this only knows how to sign. Every use
 * site checks ownership first (a vendor gets its own, staff get any), which is
 * the same split the backups download route makes.
 */
export async function signProof(storagePath) {
  if (!storagePath) return null;

  try {
    const { data, error } = await getMarketplaceDb()
      .storage.from(PROOF_BUCKET)
      .createSignedUrl(storagePath, TTL_SECONDS);

    if (error) return null;
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

/**
 * Every attempt against one charge, newest first.
 *
 * `vendorId` scopes it when a seller is asking, and is left null for staff.
 * A charge that is not yours reads exactly like one that does not exist.
 */
export async function listProofsForCharge(chargeId, { vendorId = null } = {}) {
  if (!chargeId) return { ready: true, items: [] };

  try {
    let query = getMarketplaceDb()
      .from('charge_payment_proofs')
      .select(FIELDS)
      .eq('charge_id', chargeId)
      .order('created_at', { ascending: false });

    if (vendorId) query = query.eq('vendor_id', vendorId);

    const { data, error } = await query;
    if (error) return { ready: !isMissingSchema(error), items: [] };
    return { ready: true, items: data ?? [] };
  } catch {
    return { ready: false, items: [] };
  }
}

/**
 * The open claim against each of these charges, keyed by charge id.
 *
 * One read for a whole page of charges rather than one per row: the seller's
 * billing list needs to know, for every line, whether a receipt is already
 * waiting — and asking per line is a round trip per line.
 */
export async function openProofsByCharge(chargeIds = []) {
  const ids = [...new Set(chargeIds.filter(Boolean))];
  if (!ids.length) return { ready: true, byCharge: new Map() };

  try {
    const { data, error } = await getMarketplaceDb()
      .from('charge_payment_proofs')
      .select(FIELDS)
      .in('charge_id', ids)
      .eq('state', 'submitted');

    if (error) return { ready: !isMissingSchema(error), byCharge: new Map() };

    const byCharge = new Map();
    for (const row of data ?? []) byCharge.set(row.charge_id, row);
    return { ready: true, byCharge };
  } catch {
    return { ready: false, byCharge: new Map() };
  }
}

/**
 * The most recent attempt per charge, whatever its state.
 *
 * Distinct from openProofsByCharge: the seller's list shows "waiting" from that
 * one, and "rejected — send another" from this one. A rejection the seller
 * never sees is a rejection that gets resent unchanged.
 */
export async function latestProofsByCharge(chargeIds = []) {
  const ids = [...new Set(chargeIds.filter(Boolean))];
  if (!ids.length) return { ready: true, byCharge: new Map() };

  try {
    const { data, error } = await getMarketplaceDb()
      .from('charge_payment_proofs')
      .select(FIELDS)
      .in('charge_id', ids)
      .order('created_at', { ascending: false });

    if (error) return { ready: !isMissingSchema(error), byCharge: new Map() };

    /* Ordered newest first, so the FIRST row seen for a charge is its latest.
       Done here rather than with a lateral join because PostgREST cannot
       express "one row per group" without a view. */
    const byCharge = new Map();
    for (const row of data ?? []) {
      if (!byCharge.has(row.charge_id)) byCharge.set(row.charge_id, row);
    }
    return { ready: true, byCharge };
  } catch {
    return { ready: false, byCharge: new Map() };
  }
}

/**
 * The admin's queue: receipts waiting, oldest first.
 *
 * Oldest first on purpose — a showroom that sent a receipt this morning may be
 * locked out right now, and a newest-first queue serves the calmest customer
 * first. The charge and the showroom ride along so the queue reads without a
 * second query per row.
 */
export async function listPendingProofs({ limit = 50 } = {}) {
  try {
    const { data, error } = await getMarketplaceDb()
      .from('charge_payment_proofs')
      .select(
        `${FIELDS},
         vendor_charges ( id, ref, kind, amount, state, issued_at, due_at, access_days, description ),
         vendors ( id, slug, name, contact_phone, contact_email )`
      )
      .eq('state', 'submitted')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) return { ready: !isMissingSchema(error), items: [] };
    return { ready: true, items: data ?? [] };
  } catch {
    return { ready: false, items: [] };
  }
}

/**
 * How many are waiting — the badge beside Finance in the sidebar.
 *
 * head:true, so this costs a count and not the rows. It runs on every admin
 * page load, beside the boost and renewal counts already there.
 */
export async function countPendingProofs() {
  try {
    const { count, error } = await getMarketplaceDb()
      .from('charge_payment_proofs')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'submitted');

    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/** One proof, with its charge. For the review screen and the accept path. */
export async function getProof(proofId) {
  if (!proofId) return null;

  try {
    const { data, error } = await getMarketplaceDb()
      .from('charge_payment_proofs')
      .select(
        `${FIELDS},
         vendor_charges ( id, ref, kind, amount, state, access_days, vendor_id )`
      )
      .eq('id', proofId)
      .maybeSingle();

    if (error) return null;
    return data ?? null;
  } catch {
    return null;
  }
}
