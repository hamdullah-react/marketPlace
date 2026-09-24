import 'server-only';

/**
 * The marketplace's Data Access Layer for authorization.
 *
 * Every server action, route handler and page asks THIS module who the caller
 * is. Nothing reads the session directly, and nothing takes an identity from a
 * form field.
 *
 * ── Why here and not in a layout or in proxy.js ─────────────────────────────
 *
 * Next's own guidance (01-app/02-guides/authentication.md):
 *
 *   · Layouts do not re-render on navigation because of partial rendering, so
 *     a check there is not re-run when the user moves between routes.
 *   · Proxy runs on every request including prefetches, so it may only read
 *     the cookie optimistically — "it should not be your only line of
 *     defense".
 *   · The check belongs as close to the data as possible, and every server
 *     action must perform its own.
 *
 * So proxy.js redirects a logged-out visitor for the look of the thing, and
 * these functions are what actually decide.
 *
 * ── Two clients, deliberately ───────────────────────────────────────────────
 *
 * getUser() goes through the ANON client carrying the user's cookies, so the
 * database itself validates the token. Role and membership lookups then go
 * through the SERVICE client, because a user must be able to learn their own
 * role without there being a policy that lets them read the roles table — the
 * shortest path to a recursive policy is making authorization depend on a
 * table that authorization guards.
 */

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { getMarketplaceAuthServer } from './server';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { accessState } from '@/marketplace/lib/access';

/**
 * Every marketplace route is /[locale]/marketplace/..., so a redirect that
 * forgets the locale lands on a path that does not exist. Reading it from the
 * request rather than defaulting to 'ar' also means an English visitor is not
 * bounced into Arabic on their way to sign in.
 */
async function localePath(path) {
  const locale = await getLocale().catch(() => 'ar');
  return `/${locale}${path}`;
}

/**
 * The signed-in user, or null.
 *
 * getUser(), never getSession(): getSession only decodes the cookie, which the
 * browser controls. getUser() asks the auth server whether the token is real.
 * On a server that difference is the whole check.
 *
 * cache() memoises for one render pass, so a page whose three Suspense
 * boundaries each need the user makes one call, not three.
 */
export const getUser = cache(async () => {
  try {
    const supabase = await getMarketplaceAuthServer();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return null;
    return data.user;
  } catch {
    // Missing env, unreachable auth server — a caller asking "who is this"
    // gets "nobody", which every guard below already handles.
    return null;
  }
});

/**
 * The caller's identity AND what they may do, in one object.
 *
 * `vendorIds` is a list rather than one id: a person can belong to more than
 * one showroom, and one of them being suspended must not lock them out of the
 * other. Everything downstream scopes by "one of mine" rather than "mine".
 */
export const getViewer = cache(async () => {
  const user = await getUser();
  if (!user) return null;

  const db = getMarketplaceDb();

  /**
   * The membership read, with a fallback.
   *
   * The access columns arrive with the VENDOR ACCESS section of schema.sql, and
   * code ships before SQL is run. PostgREST fails the WHOLE select when it names
   * a column the database lacks — and this particular select decides whether
   * somebody is a seller at all, so a missing column would log every showroom
   * out of its dashboard rather than degrade anything.
   */
  const readMemberships = (select) =>
    db.from('vendor_members').select(select).eq('user_id', user.id);

  const MEMBERSHIPS_FULL =
    'vendor_id, role, vendors!inner ( id, slug, name, state, access_until, access_blocked, access_block_reason )';
  const MEMBERSHIPS_BASE = 'vendor_id, role, vendors!inner ( id, slug, name, state )';

  const [{ data: profile }, membershipsResult, { data: addresses }] = await Promise.all([
    db.from('profiles').select('role, full_name, phone, locale').eq('id', user.id).maybeSingle(),
    readMemberships(MEMBERSHIPS_FULL),
    /**
     * Enough of an address to reach somebody.
     *
     * One row is all this needs to know — `limit(1)` rather than the whole
     * address book — because the only question being answered here is "has this
     * person given us one at all". The account's Addresses page is where they
     * are managed.
     */
    db
      .from('addresses')
      .select('city, district, street')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .limit(1),
  ]);

  // A profile row is created by a trigger on sign-up. Defaulting to 'buyer'
  // rather than throwing means a user whose trigger has not fired yet can still
  // browse and save cars — they simply cannot do anything privileged, which is
  // the correct failure direction.
  const role = profile?.role ?? 'buyer';

  const memberships =
    membershipsResult.error?.code === '42703'
      ? (await readMemberships(MEMBERSHIPS_BASE)).data
      : membershipsResult.data;

  // Only APPROVED vendors count. A pending application must not open the
  // seller dashboard, and a suspended showroom must stop being able to sell
  // the moment it is suspended rather than at next sign-in.
  const vendors = (memberships ?? [])
    .filter((m) => m.vendors?.state === 'approved')
    .map((m) => ({
      /* The raw row first, and it is not decoration.
         accessState() judges by access_until and access_blocked; handed an
         object without them it finds no date and no block and answers
         ALLOWED — it fails OPEN, silently. That is what turned one stray
         re-derivation on the blocked screen into an infinite redirect, and
         the next one would be somebody letting a lapsed showroom back in.
         Carrying the columns costs nothing — they were already read — and
         makes the two ways of asking agree by construction. */
      ...m.vendors,
      id: m.vendor_id,
      slug: m.vendors.slug,
      name: m.vendors.name,
      role: m.role,
      /**
       * Whether their subscription is still running, decided HERE.
       *
       * Attached to each showroom rather than to the viewer, because somebody
       * can belong to two and only one of them may have lapsed — the same
       * reason `vendors` is a list at all. It costs no extra query: the columns
       * ride along on the membership read above.
       *
       * A lapsed showroom is deliberately still IN this list. Dropping it would
       * make requireVendor() decide they are not a seller and send them to the
       * application form, which is both wrong and insulting to somebody whose
       * only problem is an unpaid invoice.
       */
      access: accessState(m.vendors),
    }));

  return {
    userId: user.id,
    email: user.email,
    role,
    fullName: profile?.full_name ?? user.user_metadata?.full_name ?? null,
    phone: profile?.phone ?? user.phone ?? null,
    /**
     * The profile picture, straight off the identity provider.
     *
     * Google fills user_metadata on every sign-in, so it stays current when
     * someone changes their photo — and it needs no column of our own to drift
     * out of date. `avatar_url` is what Supabase normalises Google's `picture`
     * to, but both appear depending on the provider, so both are read.
     */
    avatarUrl: user.user_metadata?.avatar_url ?? user.user_metadata?.picture ?? null,
    /**
     * Whether they have given us the two things every transaction needs.
     *
     * ── Why it is a property of the VIEWER ──────────────────────────────────
     *
     * A phone number and an address are not account decoration here: a showroom
     * answers a request by ringing the number on it, and a part is posted to
     * the address. A signed-in person with neither can fill a pipeline with
     * leads nobody can act on — which is the failure this gate exists to stop,
     * and it is a property of WHO IS ASKING rather than of any one page. So it
     * is computed once, beside the role, and every guard reads it from here.
     *
     * Both halves are trimmed: a row of spaces is not an address, and a profile
     * where somebody pressed the spacebar past the form is exactly what a
     * required field invites.
     */
    profileComplete: Boolean(
      (profile?.phone ?? '').trim() &&
        (addresses?.[0]?.city ?? '').trim() &&
        (addresses?.[0]?.district ?? '').trim() &&
        (addresses?.[0]?.street ?? '').trim()
    ),
    /**
     * The city off their default address, for prefilling.
     *
     * Free: the address row is already being read a few lines up to work out
     * whether the profile is complete, so exposing one field of it costs
     * nothing and saves the showroom application asking for a city we hold.
     *
     * Only the city. Nothing else on this object is a street address, and a
     * viewer that carried one would end up serialised into a page by whichever
     * component found it convenient.
     */
    city: addresses?.[0]?.city ?? null,
    isStaff: role === 'staff' || role === 'admin',
    isAdmin: role === 'admin',
    vendors,
    vendorIds: vendors.map((v) => v.id),
    /**
     * Every showroom this person belongs to, INCLUDING suspended and rejected
     * ones.
     *
     * `vendorIds` above is the permission — approved only — and is what almost
     * everything should use. This is membership, which is a different question,
     * and exactly one page needs it: Settings has to keep working for a seller
     * whose showroom was just suspended, otherwise the page that explains the
     * suspension is the page they are locked out of.
     */
    memberVendorIds: (memberships ?? []).map((m) => m.vendor_id),
  };
});

/* ── Guards ────────────────────────────────────────────────────────────────
   Each returns what the caller needs and never returns at all otherwise. That
   shape matters: a guard that returns a boolean can be called and ignored, and
   the mistake looks like working code in review.
   ------------------------------------------------------------------------ */

/** Any signed-in user. */
export async function requireUser() {
  const viewer = await getViewer();
  if (!viewer) redirect(await localePath('/marketplace/login'));

  /**
   * A phone number and an address, before any signed-in area opens.
   *
   * ── Why the guard is HERE ───────────────────────────────────────────────
   *
   * Redirecting from the sign-in action alone would be a suggestion: the next
   * person to type /marketplace/account into the address bar walks straight
   * past it, and so does anybody arriving on a link. requireUser() is what
   * every signed-in page already calls, so the rule holds wherever they came
   * from — which is the same argument the top of this file makes for keeping
   * authorization in the DAL rather than in proxy.js.
   *
   * ── What it deliberately does NOT gate ──────────────────────────────────
   *
   * Browsing. The cars, the showrooms and the listing pages never call this,
   * and should not: someone who signed in to save a car and has not finished
   * their profile is still a visitor worth keeping, and a wall in front of the
   * catalogue would lose them to no purpose. The gate stands where the data is
   * actually needed — the account, and the seller dashboard.
   *
   * completeProfilePage() below is the one page that must not call this, or it
   * would redirect to itself for ever.
   */
  if (!viewer.profileComplete) {
    redirect(await localePath('/marketplace/complete-profile'));
  }

  return viewer;
}

/**
 * A member of an approved vendor.
 *
 * `wanted` narrows to a specific showroom for someone who belongs to several —
 * from a ?vendor= param, say. An id they are not a member of is not an error
 * to explain, it is simply not theirs: they get their first vendor instead, so
 * a stale or hand-typed link degrades to their own data rather than a refusal.
 */
export async function requireVendor(wanted = null) {
  const viewer = await requireUser();

  /**
   * Buying and selling are different accounts of the same person.
   *
   * Signing in makes you a buyer. Becoming a seller is a separate, deliberate
   * step through /marketplace/sell/apply, and that form is what creates the
   * showroom.
   *
   * This used to mint a showroom on the spot for anyone who reached the
   * dashboard, on the theory that a form is friction. What it actually produced
   * was a seller account for every buyer who mistyped a URL, each one named
   * after whatever their profile said, with no city and no phone number — so
   * "Seller dashboard" sat in the menu of people who had never sold anything,
   * and the showrooms directory filled with shells.
   *
   * The form asks for the four things a buyer needs before they will contact a
   * seller at all — shop name, city, phone, and the commercial registration.
   * None of those can be invented from an email address, so there was never a
   * version of this that skipped the form and still produced a usable showroom;
   * it only moved the asking to somewhere less obvious.
   *
   * Note what has NOT come back: an approval queue. The form is the gate, and
   * submitting it opens the dashboard immediately (see _actions/apply.js).
   * `verified` still stays false until a human checks the CR number, because
   * that badge is the thing buyers actually rely on.
   */
  if (!viewer.vendors.length) redirect(await localePath('/marketplace/sell/apply'));

  const vendor =
    (wanted && viewer.vendors.find((v) => v.id === wanted)) || viewer.vendors[0];

  /**
   * ── THE PAYWALL, and it is here for a reason ────────────────────────────
   *
   * Every seller page calls this. The (seller) layout says so itself: a layout
   * is the FLOW, not the security, because partial rendering means it does not
   * re-run when somebody navigates between seller pages. A gate in the layout
   * would let anybody who was already inside keep going.
   *
   * So the check sits in the function each page awaits before it reads
   * anything, beside the one that decides whether they are a seller at all. A
   * showroom whose subscription has lapsed cannot reach a seller page by typing
   * its URL, from a bookmark, or by clicking a link in the sidebar of a tab
   * that was open when it lapsed.
   *
   * The WRITES are guarded separately, in vendorForAction — a server action is
   * not a page and never passes through here.
   *
   * `/marketplace/subscription` is where this sends them, and it lives in the
   * (account) group rather than (seller) — the (seller) layout calls this very
   * function, so a blocked screen under it would redirect to itself for ever.
   * It resolves the showroom with vendorForBlockedScreen() below.
   */
  if (!vendor.access.allowed) {
    redirect(await localePath('/marketplace/subscription'));
  }

  return { ...viewer, vendor, vendorId: vendor.id };
}

/**
 * The same resolution WITHOUT the paywall — for the blocked screen itself.
 *
 * It needs to know which showroom is locked out, what its date was and why, and
 * it cannot ask requireVendor() for that without being redirected to itself.
 */
export async function vendorForBlockedScreen(wanted = null) {
  const viewer = await getViewer();
  if (!viewer) return null;
  if (!viewer.vendors.length) return null;

  const vendor =
    (wanted && viewer.vendors.find((v) => v.id === wanted)) || viewer.vendors[0];

  return { ...viewer, vendor, vendorId: vendor.id };
}

/**
 * Where somebody goes the moment they finish signing in.
 *
 * ── One function, four doors ────────────────────────────────────────────────
 *
 * Password sign-in, the emailed code, a password reset and Google's callback
 * all end by sending the person somewhere, and all four have to make the same
 * decision about an incomplete profile. Written out four times it would be
 * right four times today and right three times after the next change — so the
 * rule lives here and each door asks.
 *
 * ── This is the courtesy, not the enforcement ───────────────────────────────
 *
 * requireUser() is what actually holds the line; somebody who types an account
 * URL never comes through here at all. The point of this is that a person who
 * has just signed up meets the form as the next thing that happens, rather than
 * as a redirect that ambushes them two clicks later.
 *
 * @param next    where they were trying to go, already validated by the caller
 * @param locale  so the destination keeps the language they are reading in
 */
export async function postAuthDestination(next, locale) {
  const fallback = `/${locale}/marketplace`;
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;

  const viewer = await getViewer();

  // Not signed in, somehow. The caller's own destination is as good an answer
  // as any, and the guards downstream will bounce them to login.
  if (!viewer || viewer.profileComplete) return target;

  // Carried through, so finishing the form lands them where they were headed
  // instead of on the marketplace home with the thread lost.
  return `/${locale}/marketplace/complete-profile?next=${encodeURIComponent(target)}`;
}

/** Platform staff. Catalog, templates, moderation, payouts. */
export async function requireStaff() {
  const viewer = await requireUser();
  if (!viewer.isStaff) redirect(await localePath('/marketplace'));
  return viewer;
}

/** Platform admin — the things staff may see but not do. */
export async function requireAdmin() {
  const viewer = await requireUser();
  if (!viewer.isAdmin) redirect(await localePath('/marketplace'));
  return viewer;
}

/* ── Guards for actions ────────────────────────────────────────────────────
   redirect() inside a server action throws a control-flow signal that the
   client swallows, so the form reports nothing and the user sees a button that
   did nothing. Actions ask these instead and return a proper error result.
   ------------------------------------------------------------------------ */

/** The viewer, or null — for an action that must answer rather than redirect. */
export async function currentViewer() {
  return getViewer();
}

/**
 * Resolves the vendor an ACTION may write as.
 *
 * Returns `{ vendorId }` or `{ error }`. This is what replaces reading
 * `vendorId` out of formData: the id now comes from the session, so posting
 * someone else's id no longer does anything at all.
 */
export async function vendorForAction(wanted = null) {
  const viewer = await getViewer();
  if (!viewer) return { error: 'NOT_SIGNED_IN' };
  if (viewer.isStaff && wanted) return { viewer, vendorId: wanted };
  if (!viewer.vendors.length) return { error: 'NOT_A_VENDOR' };

  const vendor = (wanted && viewer.vendors.find((v) => v.id === wanted)) || viewer.vendors[0];

  /**
   * The other half of the paywall.
   *
   * A server action is reachable by POST without ever rendering a page, so the
   * guard in requireVendor() does not cover it — a lapsed showroom with a stale
   * tab open, or anybody replaying a request, would otherwise still be able to
   * publish cars, edit prices and answer leads.
   *
   * An ERROR rather than a redirect: redirect() inside a server action throws a
   * control-flow signal the client swallows, so the form would report nothing
   * and the button would look dead. VENDOR_BLOCKED is a message the seller can
   * read (lib/errors.ts).
   */
  if (!vendor.access.allowed) {
    return { error: 'VENDOR_BLOCKED', accessState: vendor.access.state };
  }

  return { viewer, vendorId: vendor.id };
}

/**
 * The vendor an action may act as WHEN THE PAYWALL MUST NOT APPLY.
 *
 * Exactly one kind of write belongs here: asking to renew. A showroom whose
 * subscription has lapsed is precisely the one that needs to press that button,
 * so routing it through vendorForAction() — which returns VENDOR_BLOCKED — would
 * lock the door from the inside and leave them with no way out but the phone.
 *
 * Deliberately NOT a flag on vendorForAction. A boolean that switches the
 * paywall off is a boolean somebody passes by accident from a listing action;
 * a separate, narrowly-named function is one somebody has to choose to import.
 * Nothing else in the app may use this.
 */
export async function vendorForRenewal(wanted = null) {
  const viewer = await getViewer();
  if (!viewer) return { error: 'NOT_SIGNED_IN' };
  if (!viewer.vendors.length) return { error: 'NOT_A_VENDOR' };

  const vendor = (wanted && viewer.vendors.find((v) => v.id === wanted)) || viewer.vendors[0];
  return { viewer, vendorId: vendor.id, vendor };
}

/** Same shape, for the staff-only actions — catalog, templates, moderation. */
export async function staffForAction() {
  const viewer = await getViewer();
  if (!viewer) return { error: 'NOT_SIGNED_IN' };
  if (!viewer.isStaff) return { error: 'NOT_STAFF' };
  return { viewer };
}

/** Same shape, for the admin panel — users, admins, boost decisions. */
export async function adminForAction() {
  const viewer = await getViewer();
  if (!viewer) return { error: 'NOT_SIGNED_IN' };
  if (!viewer.isAdmin) return { error: 'NOT_ADMIN' };
  return { viewer };
}
