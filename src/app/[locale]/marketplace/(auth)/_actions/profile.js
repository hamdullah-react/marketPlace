'use server';

/**
 * The two things every signed-in person must give us: a number, and an address.
 *
 * ── Why these two and nothing else ──────────────────────────────────────────
 *
 * A showroom answers a request by RINGING the number on it — there is no chat
 * thread any more (schema.sql §21.2), so a lead with no phone is a row that
 * wastes a salesperson's morning and never becomes a sale. And a part is posted
 * to an address. Everything else about a person is optional because nothing
 * breaks without it.
 *
 * Name is not asked for again: sign-up already captured it, and Google supplies
 * it. Asking twice is how a form starts feeling like paperwork.
 *
 * ── Two tables, one form ────────────────────────────────────────────────────
 *
 * The phone belongs on `profiles` — it is who they are. The address is a row in
 * `addresses`, which is the table the account's address book already reads and
 * checkout already ships to. Writing it anywhere else would mean this form
 * produced an address nothing else could see.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { currentViewer } from '@/marketplace/auth/session';
import { isAllowedPhone } from '@/marketplace/lib/phone';
import { getSiteSettings } from '@/marketplace/db/queries/site';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

export async function saveEssentials(prevState, formData) {
  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const locale = str(formData, 'locale') || 'ar';

  const phone = str(formData, 'phone').replace(/[\s-]/g, '');
  const city = str(formData, 'city');
  const district = str(formData, 'district');
  const street = str(formData, 'street');
  const building = str(formData, 'building');
  const postalCode = str(formData, 'postalCode');

  /**
   * Every problem at once, keyed by field.
   *
   * Returning on the first one makes somebody fix a form in four round trips,
   * finding out about each mistake only after correcting the last.
   */
  const errors = {};

  /* Which countries' numbers are accepted is Admin → Settings → Contact. A
     cached read, and it must not stop someone finishing their profile if it
     fails — the built-in list stands in. */
  const { phoneCountries } = await getSiteSettings().catch(() => ({ phoneCountries: ['SA'] }));

  if (!phone) errors.phone = 'PHONE_REQUIRED';
  else if (!isAllowedPhone(phone, phoneCountries)) errors.phone = 'PHONE_INVALID';

  if (!city) errors.city = 'REQUIRED';
  if (!district) errors.district = 'REQUIRED';
  if (!street) errors.street = 'REQUIRED';

  // Long enough for any real value, short enough that the column is not a
  // place to paste an essay.
  for (const [name, value] of Object.entries({ city, district, street, building, postalCode })) {
    if (value.length > 120) errors[name] = 'TOO_LONG';
  }

  if (Object.keys(errors).length) return bad('CHECK_FIELDS', { errors });

  const db = getMarketplaceDb();

  /**
   * UPSERT, not update — and this is not a stylistic choice.
   *
   * A profile row is supposed to exist for everyone: handle_new_user() creates
   * one on insert into auth.users (schema.sql §17.1). Real accounts on this
   * database do not all have one — a user created before that trigger existed,
   * or through the admin API, has none. An UPDATE against a row that is not
   * there changes nothing and reports no error, so the phone would be silently
   * dropped, profileComplete would stay false, and the person would be sent
   * back to this form for ever with no message explaining why.
   *
   * A gate that can trap somebody is worse than no gate. Upsert makes the row
   * if it is missing; `role` and `locale` take their column defaults.
   */
  const { error: profileError } = await db
    .from('profiles')
    .upsert({ id: viewer.userId, phone }, { onConflict: 'id' });

  if (profileError) return bad('SAVE_FAILED');

  /**
   * Update the existing default rather than adding a second one.
   *
   * Somebody who half-filled this before, or who already has an address book,
   * must not end up with duplicates from a form that exists to be filled once.
   */
  const { data: existing } = await db
    .from('addresses')
    .select('id')
    .eq('user_id', viewer.userId)
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    user_id: viewer.userId,
    // Both are NOT NULL on the table, and both are things we already know —
    // asking for them again would be asking twice.
    full_name: viewer.fullName || viewer.email || '—',
    phone,
    city,
    district,
    street,
    building: building || null,
    postal_code: postalCode || null,
    is_default: true,
  };

  const { error: addressError } = existing
    ? await db.from('addresses').update(row).eq('id', existing.id).eq('user_id', viewer.userId)
    : await db.from('addresses').insert(row);

  if (addressError) return bad('SAVE_FAILED');

  /**
   * The whole marketplace renders differently now.
   *
   * getViewer() computes profileComplete, and it is read by the guard in front
   * of every signed-in page — so without this the person is sent straight back
   * to this form by a cached layout that still believes they had nothing.
   */
  revalidatePath('/[locale]/marketplace', 'layout');

  /**
   * The marketplace, always — not wherever they were headed.
   *
   * A ?next is carried into this page so that somebody who is ALREADY complete
   * and lands here by accident is bounced straight on. Finishing the form is a
   * different moment: it is usually the end of signing up, and the useful thing
   * to put in front of a new person is the marketplace itself rather than
   * whatever URL happened to be in the query string — often a dashboard they
   * have no reason to be looking at yet.
   *
   * It also removes a whole class of bug: no attacker-controlled path is read
   * here at all, so there is nothing to validate and no open redirect to get
   * wrong.
   */
  redirect(`/${locale}/marketplace`);
}
