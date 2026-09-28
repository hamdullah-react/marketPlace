'use server';

/**
 * "I have paid" — a showroom sends the receipt for a charge.
 *
 * ── Why this is the one seller write the paywall must not block ─────────────
 *
 * Same reasoning as requestRenewal next door, and it matters more here: the
 * showroom that needs this is by definition the one whose dashboard has closed.
 * Refusing the receipt because the subscription lapsed would be refusing the
 * payment that fixes it. So it resolves through vendorForRenewal(), never
 * vendorForAction().
 *
 * ── It does NOT record the payment ──────────────────────────────────────────
 *
 * Nothing here marks a charge paid, starts a promotion or grants a day of
 * access. It files a CLAIM with a picture attached. An admin looks at the
 * screenshot and accepts it, and that acceptance is what calls the money in —
 * the same rule requestRenewal states: the platform records money when it can
 * see it has arrived, not when somebody says they have sent it.
 *
 * ── The file goes to a PRIVATE bucket ───────────────────────────────────────
 *
 * Every other upload here is public because a car photo has to render for a
 * logged-out buyer. A transfer receipt shows an account number and a holder's
 * name, so it goes to marketplace-payments, which is private, and is only ever
 * read through a link signed at click time. See the PAYMENT PROOFS section of
 * schema.sql.
 */

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForRenewal } from '@/marketplace/auth/session';
import { recordNotification } from '@/marketplace/db/queries/notifications';
import { notifyAdmins } from '@/marketplace/lib/realtime';
import { PROOF_BUCKET } from '@/marketplace/db/queries/proofs';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { parseInstant, isFuture } from '@/marketplace/lib/datetime';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* Mirrors the bucket's own allowlist. Checked here as well because the bucket
   reports a 415 long after the upload has been paid for in bandwidth, and
   "unsupported media type" is not a sentence to show a showroom. */
const ALLOWED = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
};

const MAX_BYTES = 8 * 1024 * 1024;

const later = (work) => {
  try {
    after(work);
  } catch {
    work();
  }
};

function refresh() {
  revalidatePath('/[locale]/marketplace/seller/billing', 'page');
  revalidatePath('/[locale]/marketplace/seller/billing/[id]', 'page');
  revalidatePath('/[locale]/marketplace/admin/finance', 'page');
  // The sidebar badge counts what is waiting.
  revalidatePath('/[locale]/marketplace/admin', 'layout');
}

/**
 * File the receipt.
 *
 * The order is deliberate: every check that can refuse runs BEFORE the upload,
 * so a showroom on a slow connection is never made to send eight megabytes and
 * then told the charge was already paid.
 */
export async function submitPaymentProof(prevState, formData) {
  const wanted = str(formData, 'vendorId') || null;
  const { vendorId, error: denied } = await vendorForRenewal(wanted);
  if (denied || !vendorId) return bad(denied ?? 'NOT_ALLOWED');

  const chargeId = str(formData, 'chargeId');
  if (!UUID.test(chargeId)) return bad('NOT_FOUND');

  const method = str(formData, 'method');
  if (!method) return bad('METHOD_REQUIRED');

  const reference = str(formData, 'reference').slice(0, 120) || null;
  const note = str(formData, 'note').slice(0, 500) || null;

  /* The browser sends an instant (lib/datetime), so nothing here has to guess a
     zone — the lesson recordPayment records at length. Blank means "now", which
     is the honest default for somebody filing a receipt they just made. */
  const when = str(formData, 'paidAt');
  const paidAt = when ? parseInstant(when) : new Date();
  if (!paidAt) return bad('DATE_INVALID');
  if (isFuture(paidAt)) return bad('DATE_FUTURE');

  const rawAmount = str(formData, 'amount');
  let amount = null;
  if (rawAmount) {
    const n = Number(rawAmount);
    if (!Number.isFinite(n) || n < 0) return bad('AMOUNT_INVALID');
    amount = Math.round(n * 100) / 100;
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string' || !file.size) return bad('PROOF_FILE_REQUIRED');
  if (file.size > MAX_BYTES) return bad('PROOF_FILE_TOO_BIG');

  const ext = ALLOWED[file.type];
  if (!ext) return bad('PROOF_FILE_TYPE');

  const db = getMarketplaceDb();

  /* ── The charge has to be theirs, and still owed ───────────────────────── */
  const { data: charge, error: readError } = await db
    .from('vendor_charges')
    .select('id, ref, state, amount, kind, vendor_id')
    .eq('id', chargeId)
    .eq('vendor_id', vendorId)
    .maybeSingle();

  if (readError) return bad('SAVE_FAILED', { detail: readError.message });
  // A charge belonging to another showroom reads exactly like one that is gone.
  if (!charge) return bad('NOT_FOUND');
  if (charge.state === 'paid') return bad('ALREADY_PAID');
  if (charge.state !== 'due') return bad('PROOF_NOT_DUE');

  /* ── One waiting receipt at a time ─────────────────────────────────────── */
  const { data: open, error: openError } = await db
    .from('charge_payment_proofs')
    .select('id')
    .eq('charge_id', chargeId)
    .eq('state', 'submitted')
    .maybeSingle();

  if (openError && isMissingSchema(openError)) return bad('PROOF_NOT_MIGRATED');
  if (open) return bad('PROOF_ALREADY_SENT');

  /* ── Now, and only now, the bytes ──────────────────────────────────────── */
  const key = `${vendorId}/${chargeId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error: uploadError } = await db.storage
    .from(PROOF_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.warn('[payment-proof] upload failed:', uploadError.message);
    return bad('UPLOAD_FAILED', { detail: uploadError.message });
  }

  const { data: saved, error } = await db
    .from('charge_payment_proofs')
    .insert({
      charge_id: chargeId,
      vendor_id: vendorId,
      storage_path: key,
      mime_type: file.type,
      method,
      reference,
      amount,
      paid_at: paidAt.toISOString(),
      note,
    })
    .select('id')
    .maybeSingle();

  if (error) {
    /* The row is what makes the object findable. Without it the upload is an
       orphan nobody can see or delete from the app, so it is taken back out
       rather than left to sit in a private bucket for ever. */
    await db.storage.from(PROOF_BUCKET).remove([key]).catch(() => {});

    if (isMissingSchema(error)) return bad('PROOF_NOT_MIGRATED');
    // 23505 — the one-open-per-charge index caught two submits in one instant.
    if (error.code === '23505') return bad('PROOF_ALREADY_SENT');
    return bad('SAVE_FAILED', { detail: error.message });
  }

  /* Told after the response, like every other notification here. The admin's
     Finance queue is where this lands; the badge counts it. */
  later(async () => {
    await recordNotification({
      audience: 'admin',
      kind: 'payment_proof_submitted',
      data: { ref: charge.ref, amount: amount ?? charge.amount, kind: charge.kind },
      href: '/marketplace/admin/finance',
    });
    await notifyAdmins('admin_alert', { kind: 'payment_proof_submitted' });
  });

  refresh();
  return ok({ id: saved?.id ?? null });
}
