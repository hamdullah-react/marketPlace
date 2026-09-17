'use server';

/**
 * Contacting a seller.
 *
 * ── One door ────────────────────────────────────────────────────────────────
 *
 * There used to be two: an "enquiry" that opened a chat thread, and a "lead"
 * that filled in the seller's form. The thread is gone — see schema.sql §21.2
 * for why — so everything a buyer sends is a LEAD, and it lands in the one
 * place the showroom actually works.
 *
 * That also closes the hole the two doors had: `mode` travelled in the form, so
 * posting mode=enquiry was the way to skip every question the seller marked
 * required. With one door there is nothing to declare and nothing to forge.
 *
 * ── Why sign-in is required ─────────────────────────────────────────────────
 *
 * Not to collect accounts. It is what makes a lead worth acting on: a seller
 * calling back needs a person who exists, and anonymous submissions are how a
 * pipeline fills with rows that go nowhere. It also protects the seller —
 * revealSellerPhone() below hands the number to a signed-in person per request,
 * and the number is not in the listing payload at all, so scraping it costs an
 * authenticated session per car rather than one crawl.
 *
 * ── One OPEN request per buyer per car ──────────────────────────────────────
 *
 * Pressing Send twice, or coming back tomorrow having forgotten, does not file
 * a second identical row — the buyer is told the showroom already has it. Two
 * copies in a pipeline means a salesperson ringing the same person about the
 * same car twice, which serves nobody.
 *
 * Scoped to the OPEN stages, not for ever. The same person asking about the
 * same car six months later, after the first went nowhere, is a second
 * opportunity and not an edit of the first — which is exactly what the old
 * thread's unique (listing_id, buyer_user_id) could not express. Once a lead is
 * won or lost the slot frees again.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { currentViewer } from '@/marketplace/auth/session';
import { getVendorFormFields } from '@/marketplace/db/queries/forms';
import { getOpenLead } from '@/marketplace/db/queries/leads';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';
import { validateAnswer, isMultiValue } from '@/marketplace/lib/form-fields';
import { isAllowedPhone } from '@/marketplace/lib/phone';
import { getSiteSettings } from '@/marketplace/db/queries/site';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

/**
 * The listing, as the SERVER sees it.
 *
 * The vendor id comes from here and never from the form. Posting somebody
 * else's vendor id would otherwise file the lead in their pipeline.
 */
async function loadListing(db, listingId) {
  const { data } = await db
    .from('listings')
    .select('id, vendor_id, state, slug, name')
    .eq('id', listingId)
    .maybeSingle();

  return data ?? null;
}

export async function sendLead(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const listingId = str(formData, 'listingId');
  const locale = str(formData, 'locale') || 'ar';
  const message = str(formData, 'message');
  const phone = str(formData, 'phone');

  if (!listingId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const listing = await loadListing(db, listingId);

  if (!listing) return bad('NOT_FOUND');

  // A car that is sold or withdrawn is not one to send a lead about. Checked
  // server-side because the page may have been open for an hour.
  if (listing.state !== 'live') return bad('LISTING_UNAVAILABLE');

  // Enquiring about your own car is not a thing that should reach a pipeline.
  if (viewer.vendorIds.includes(listing.vendor_id)) return bad('OWN_LISTING');

  /**
   * Already asked?
   *
   * Checked BEFORE validating the form, so a buyer who pressed Send twice is
   * told the plain fact rather than being marched through field errors on a
   * request that was never going to be filed.
   *
   * This is the check a person actually meets; the unique index (schema.sql
   * §21.4) is the backstop for two submissions in the same instant, and its
   * 23505 is caught below and reported identically.
   */
  const already = await getOpenLead(listing.vendor_id, listing.id, viewer.userId);
  if (already) {
    return bad('ALREADY_SENT', {
      sentAt: already.created_at,
      requestsPath: `/${locale}/marketplace/account/requests`,
    });
  }

  /**
   * Whatever THIS showroom asks for.
   *
   * Re-read from the database rather than taken from the submitted form. What
   * the browser posted is a suggestion: a hand-made POST must not be able to
   * invent a question, skip a required one, or file a megabyte of text under a
   * key nobody asked about.
   */
  const fields = await getVendorFormFields(listing.vendor_id, { activeOnly: true });

  const errors = {};

  /**
   * The phone is REQUIRED, and that is a change from when a thread existed.
   *
   * Back then an unreachable buyer could still be answered inside the
   * conversation. Now the contact details ARE the reply channel — a lead nobody
   * can call is a row that wastes a salesperson's morning. It is prefilled from
   * the profile, so for most people this is not a question.
   */
  /* Admin → Settings → Contact decides which countries' numbers are accepted,
     here and in the seller's own phone fields below. Cached; the built-in list
     stands in if the read fails, rather than refusing every buyer. */
  const { phoneCountries } = await getSiteSettings().catch(() => ({ phoneCountries: ['SA'] }));

  const cleanPhone = phone.replace(/[\s-]/g, '');
  if (!cleanPhone) errors.phone = 'PHONE_REQUIRED';
  else if (!isAllowedPhone(cleanPhone, phoneCountries)) errors.phone = 'PHONE_INVALID';

  /**
   * The message is required only when the seller asks nothing else.
   *
   * A showroom with a five-question form has already been told what it needs,
   * and making someone write a paragraph on top of that is asking them to
   * repeat themselves. A showroom with no form has nothing but this.
   */
  if (!fields.length && !message) errors.message = 'MESSAGE_REQUIRED';
  if (message.length > 2000) errors.message = 'MESSAGE_TOO_LONG';

  const answers = {};

  for (const field of fields) {
    const name = `field__${field.field_key}`;

    const raw = isMultiValue(field.type)
      ? formData.getAll(name).map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean)
      : str(formData, name);

    const checked = validateAnswer(field, raw, { phoneCountries });
    if (checked.error) errors[name] = checked.error;
    else if (!checked.skip) answers[field.field_key] = checked.value;
  }

  if (Object.keys(errors).length) return bad('VALIDATION', { errors });

  const { data: lead, error } = await db
    .from('leads')
    .insert({
      vendor_id: listing.vendor_id,
      listing_id: listing.id,
      // Snapshotted so the lead still reads correctly once the car is gone.
      listing_title: listing.name ?? null,
      buyer_user_id: viewer.userId,
      /**
       * Copied onto the lead rather than read from the profile when the seller
       * looks at it. A buyer who changes their number next week must not
       * silently rewrite the number a seller was given for a deal already in
       * progress, and a deleted account must not blank an open lead.
       */
      contact_name: viewer.fullName || 'Buyer',
      contact_phone: cleanPhone,
      contact_email: viewer.email || null,
      answers,
      message: message || null,
      stage: 'new',
      source: 'listing_form',
    })
    .select('id')
    .single();

  if (error || !lead) {
    // 42P01 is "relation does not exist" — schema.sql §21 has not been run on
    // this database. Worth its own message: "could not send" would send the
    // seller hunting for a bug in their form.
    if (error?.code === '42P01') return bad('LEADS_NOT_MIGRATED');

    // 23505 — the unique index caught what the read above could not: a second
    // submission that started before the first one landed. Same outcome as the
    // check, because from the buyer's side it is the same fact.
    if (error?.code === '23505') {
      return bad('ALREADY_SENT', {
        requestsPath: `/${locale}/marketplace/account/requests`,
      });
    }

    return bad('SAVE_FAILED');
  }

  /**
   * The showroom's open dashboards, right now.
   *
   * Not awaited: the buyer is waiting on this response, and a websocket
   * fan-out is not something they should queue behind. If it fails the seller
   * sees the lead on their next page load, which is where they were before.
   */
  notifyVendorLeads(listing.vendor_id, 'lead_new', { id: lead.id, stage: 'new' });

  revalidatePath(`/${locale}/marketplace/seller/leads`);
  revalidatePath(`/${locale}/marketplace/account/requests`);

  return ok({
    leadId: lead.id,
    /**
     * Sent NOW, and said so.
     *
     * The panel shows "asked on <date>" for a request it learns about from the
     * page, and had nothing to show for one it had just sent — the buyer closed
     * the dialog and the button offered to take the request again. Returning
     * the timestamp lets the same "already sent" state render immediately,
     * rather than only after a reload put alreadySentAt in the props.
     */
    sentAt: new Date().toISOString(),
    requestsPath: `/${locale}/marketplace/account/requests`,
  });
}

/**
 * Hands over the seller's phone number, to a signed-in person, once asked.
 *
 * Deliberately an action rather than a field on the listing. The number is not
 * in the page, not in the JSON payload and not in the HTML source, so it costs
 * a scraper an authenticated session per listing instead of one crawl.
 *
 * No throttle of its own: the number is one a seller publishes to be called on,
 * and the sign-in requirement is the cost. If that changes, otp_send_allowed()
 * in schema.sql section 19 is the pattern to copy.
 */
export async function revealSellerPhone(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const listingId = str(formData, 'listingId');
  if (!listingId) return bad('NOT_FOUND');

  const db = getMarketplaceDb();
  const listing = await loadListing(db, listingId);
  if (!listing) return bad('NOT_FOUND');

  const { data: vendor } = await db
    .from('vendors')
    .select('contact_phone, contact_email, state')
    .eq('id', listing.vendor_id)
    .maybeSingle();

  // A suspended showroom's number is not one to hand out — the listing may
  // still be cached somewhere even though the seller is no longer trading.
  if (!vendor || vendor.state !== 'approved') return bad('NOT_FOUND');
  if (!vendor.contact_phone) return bad('NO_PHONE');

  return ok({ phone: vendor.contact_phone, email: vendor.contact_email ?? null });
}
