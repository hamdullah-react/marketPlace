'use server';

/**
 * Recording money — the only code that marks a charge paid.
 *
 * ── Everything here is AUDITED, without exception ───────────────────────────
 *
 * These four actions are the ones that will be questioned months later: who
 * said this was paid, when, against which reference, and who cancelled the
 * charge that is missing from the total. Every one writes to audit_log with the
 * before and after amounts, and the log is written by the service role so its
 * subject cannot edit it (§17.12).
 *
 * ── Marking paid is REVERSIBLE, and that is deliberate ──────────────────────
 *
 * A cheque bounces, a transfer turns out to be from a different showroom, an
 * admin picks the wrong row. The alternative to an undo is a void plus a
 * re-raise, which loses the charge's reference and its history — so the money
 * can be un-recorded, and the audit log keeps both halves.
 *
 * ── A void needs a reason; a payment needs a date ───────────────────────────
 *
 * The showroom is shown the void reason on their own billing page, so "your
 * charge disappeared" is never the whole story. And a payment date is asked for
 * rather than assumed to be today, because an admin recording Thursday's
 * transfer on Monday must not move it into the wrong month.
 */

import { revalidatePath, updateTag } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { writeAudit } from '@/marketplace/db/queries/admin';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';
import { SITE_TAGS } from '@/marketplace/lib/sitePages';
import { billingDetails, validateAccount, cleanIban } from '@/marketplace/lib/billing';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refresh = () => {
  revalidatePath('/[locale]/marketplace/admin/finance', 'page');
  revalidatePath('/[locale]/marketplace/admin', 'page');
  revalidatePath('/[locale]/marketplace/seller/payouts', 'page');
};

/** The charge, or an error result — every action starts here. */
async function load(db, chargeId) {
  const { data, error } = await db
    .from('vendor_charges')
    .select('id, ref, vendor_id, amount, state, paid_at, payment_method, payment_ref')
    .eq('id', chargeId)
    .maybeSingle();

  if (error) return { error: isMissingSchema(error) ? 'BILLING_NOT_MIGRATED' : 'SAVE_FAILED' };
  if (!data) return { error: 'NOT_FOUND' };
  return { charge: data };
}

/** Mark a charge paid. */
export async function recordPayment(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  const method = str(formData, 'method');
  const reference = str(formData, 'reference').slice(0, 120) || null;
  const when = str(formData, 'paidAt');
  // The account's label, snapshotted — see the note on vendor_charges.paid_into.
  const paidInto = str(formData, 'paidInto').slice(0, 80) || null;
  const note = str(formData, 'note').slice(0, 300) || null;

  if (!UUID.test(chargeId)) return bad('NOT_FOUND');
  if (!method) return bad('METHOD_REQUIRED');

  /* A date typed into the form, defaulting to now. `datetime-local` gives a
     local wall-clock string with no zone, which Date parses as local time —
     which is what the admin meant by it. */
  const paidAt = when ? new Date(when) : new Date();
  if (!Number.isFinite(paidAt.getTime())) return bad('DATE_INVALID');
  // A payment cannot have arrived tomorrow. A wrong date here lands in the
  // wrong month's collected figure and is hard to spot afterwards.
  if (paidAt.getTime() > Date.now() + 60_000) return bad('DATE_FUTURE');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);

  if (charge.state === 'paid') return bad('ALREADY_PAID');
  if (charge.state === 'void') return bad('CHARGE_VOID');

  let { error } = await db
    .from('vendor_charges')
    .update({
      state: 'paid',
      paid_at: paidAt.toISOString(),
      payment_method: method,
      payment_ref: reference,
      paid_into: paidInto,
      note,
      recorded_by: viewer.userId,
    })
    .eq('id', chargeId)
    // Re-checked at the database: between the read and this write another admin
    // may have recorded the same transfer, and it must not be booked twice.
    .eq('state', 'due');

  /* 42703 — paid_into has not been added on this database yet. The payment is
     the point and the account it landed in is an improvement on top, so the
     write is retried without it rather than refusing money that has arrived. */
  if (error?.code === '42703') {
    ({ error } = await db
      .from('vendor_charges')
      .update({
        state: 'paid',
        paid_at: paidAt.toISOString(),
        payment_method: method,
        payment_ref: reference,
        recorded_by: viewer.userId,
      })
      .eq('id', chargeId)
      .eq('state', 'due'));
  }

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'charge.paid',
    'charge',
    chargeId,
    { state: charge.state },
    { ref: charge.ref, amount: charge.amount, method, reference, into: paidInto, paid_at: paidAt.toISOString() }
  );

  // Their billing page is open often enough that this is worth a nudge: the
  // showroom's outstanding total has just dropped.
  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, paid: true });

  refresh();
  return ok({ chargeId, ref: charge.ref });
}

/** Un-record a payment — a bounced cheque, or the wrong row. */
export async function undoPayment(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  if (!UUID.test(chargeId)) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);
  if (charge.state !== 'paid') return bad('NOT_PAID');

  const { error } = await db
    .from('vendor_charges')
    .update({ state: 'due', paid_at: null, payment_method: null, payment_ref: null })
    .eq('id', chargeId)
    .eq('state', 'paid');

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  /* The old payment details go into the audit log as they are removed from the
     row — otherwise undoing a payment erases the only record of what was
     recorded, which is precisely what an investigation needs. */
  await writeAudit(
    viewer,
    'charge.unpaid',
    'charge',
    chargeId,
    { ref: charge.ref, amount: charge.amount, method: charge.payment_method, reference: charge.payment_ref, paid_at: charge.paid_at },
    { state: 'due' }
  );

  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, paid: false });

  refresh();
  return ok({ chargeId, ref: charge.ref });
}

/** Cancel a charge — it was raised in error, or waived. */
export async function voidCharge(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const chargeId = str(formData, 'chargeId');
  const reason = str(formData, 'reason').slice(0, 300);

  if (!UUID.test(chargeId)) return bad('NOT_FOUND');
  if (!reason) return bad('REASON_REQUIRED');

  const db = getMarketplaceDb();
  const { charge, error: readError } = await load(db, chargeId);
  if (readError) return bad(readError);

  /* A paid charge is not voided — the money arrived, and cancelling the record
     of a payment received is how a ledger stops matching a bank statement.
     Un-record the payment first if that is really what happened. */
  if (charge.state === 'paid') return bad('CHARGE_PAID');
  if (charge.state === 'void') return bad('ALREADY_VOID');

  const { error } = await db
    .from('vendor_charges')
    .update({ state: 'void', void_reason: reason })
    .eq('id', chargeId)
    .eq('state', 'due');

  if (error) return bad('SAVE_FAILED', { detail: error.message });

  await writeAudit(
    viewer,
    'charge.void',
    'charge',
    chargeId,
    { state: charge.state, amount: charge.amount },
    { ref: charge.ref, reason }
  );

  notifyVendorLeads(charge.vendor_id, 'billing_changed', { id: chargeId, voided: true });

  refresh();
  return ok({ chargeId, ref: charge.ref });
}

/**
 * Where showrooms should send the money — one account at a time.
 *
 * ── Read, change, write ─────────────────────────────────────────────────────
 *
 * The accounts live in one jsonb column, so adding one means reading the list,
 * putting the new account in it and writing it back. That is a read-modify-write
 * and it can lose a change if two admins save at the same moment — accepted
 * deliberately: this is a handful of rows edited by one or two people a few
 * times a year, and the alternative is a table, a migration and a join for
 * something no page ever queries.
 *
 * ── The same action adds and edits ──────────────────────────────────────────
 *
 * An `accountId` that matches an existing row replaces it; anything else is
 * appended. One code path, so the validation and the audit entry cannot drift
 * between the two.
 */

const readBilling = async (db) => {
  const { data, error } = await db.from('site_settings').select('billing').eq('id', true).maybeSingle();
  if (error) return { error: error.code === '42703' ? 'BILLING_NOT_MIGRATED' : 'SAVE_FAILED' };
  return { billing: data?.billing && typeof data.billing === 'object' ? data.billing : {} };
};

const writeBilling = async (db, billing) => {
  const { error } = await db.from('site_settings').update({ billing }).eq('id', true);
  if (error) return error.code === '42703' ? 'BILLING_NOT_MIGRATED' : 'SAVE_FAILED';
  /* getSiteSettings() is cached for an hour behind SITE_TAGS.settings, so
     without this an admin saves an account and both this page and every
     showroom's billing page keep showing the old one — read-your-own-writes,
     the same reason every other site-settings action ends this way. */
  updateTag(SITE_TAGS.settings);
  return null;
};

/** Add a payment destination, or change one. */
export async function savePaymentAccount(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const accountId = str(formData, 'accountId');

  const account = {
    kind: str(formData, 'kind') || 'bank',
    label: str(formData, 'label').slice(0, 80),
    bankName: str(formData, 'bankName').slice(0, 120),
    accountName: str(formData, 'accountName').slice(0, 120),
    accountNumber: str(formData, 'accountNumber').slice(0, 40),
    iban: cleanIban(str(formData, 'iban')).slice(0, 34),
    swift: str(formData, 'swift').toUpperCase().slice(0, 11),
    country: str(formData, 'country').toUpperCase().slice(0, 2),
    notes: str(formData, 'notes').slice(0, 200),
  };

  // The same rule the form ran, asked again where it cannot be skipped. No
  // country is privileged — see validateAccount.
  const invalid = validateAccount(account);
  if (invalid) return bad(invalid);

  const db = getMarketplaceDb();
  const { billing, error: readError } = await readBilling(db);
  if (readError) return bad(readError);

  const current = billingDetails(billing).accounts;
  const index = accountId ? current.findIndex((a) => a.id === accountId) : -1;

  const next = [...current];
  if (index >= 0) {
    next[index] = { ...next[index], ...account, id: current[index].id };
  } else {
    // Time-based rather than a counter: deleting the second of three must not
    // hand the next account an id one of them already used.
    next.push({ ...account, id: `acc-${Date.now().toString(36)}` });
  }

  const failed = await writeBilling(db, { ...billing, accounts: next });
  if (failed) return bad(failed);

  await writeAudit(
    viewer,
    index >= 0 ? 'billing.account.update' : 'billing.account.add',
    'site_settings',
    'billing',
    index >= 0 ? { label: current[index].label } : null,
    {
      label: account.label,
      kind: account.kind,
      // The last four only. Every staff member can read the audit log, and a
      // full bank number does not need to be in it to answer "was this changed,
      // by whom, and when".
      iban: account.iban ? `…${account.iban.slice(-4)}` : null,
      accountNumber: account.accountNumber ? `…${account.accountNumber.slice(-4)}` : null,
    }
  );

  refresh();
  return ok({ accountId: index >= 0 ? accountId : next[next.length - 1].id });
}

/** Remove a payment destination. */
export async function deletePaymentAccount(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const accountId = str(formData, 'accountId');
  if (!accountId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const { billing, error: readError } = await readBilling(db);
  if (readError) return bad(readError);

  const current = billingDetails(billing).accounts;
  const gone = current.find((a) => a.id === accountId);
  if (!gone) return bad('NOT_FOUND');

  const failed = await writeBilling(db, {
    ...billing,
    accounts: current.filter((a) => a.id !== accountId),
  });
  if (failed) return bad(failed);

  /* The whole account goes into the audit log as it is removed, last four and
     all — after this there is no row left to look at, and "which account did we
     take down in March" is exactly the question that gets asked. */
  await writeAudit(viewer, 'billing.account.remove', 'site_settings', 'billing', {
    label: gone.label,
    kind: gone.kind,
    iban: gone.iban ? `…${gone.iban.slice(-4)}` : null,
  }, null);

  refresh();
  return ok({ accountId });
}

/** The payment terms shown under the accounts, in both languages. */
export async function saveBillingTerms(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const terms = {
    ar: str(formData, 'termsAr').slice(0, 500),
    en: str(formData, 'termsEn').slice(0, 500),
  };

  const db = getMarketplaceDb();
  const { billing, error: readError } = await readBilling(db);
  if (readError) return bad(readError);

  const failed = await writeBilling(db, { ...billing, terms });
  if (failed) return bad(failed);

  await writeAudit(viewer, 'billing.terms', 'site_settings', 'billing', null, terms);

  refresh();
  return ok();
}
