'use server';

/**
 * The showroom's team — inviting, revoking, re-roling and removing.
 *
 * ── The guard is the point of this file ─────────────────────────────────────
 *
 * Every write here goes through vendorForAction(wanted, 'team'), which is new:
 * schema.sql §34 explains that `vendor_members.role` existed for months and
 * was read by nothing, so a `staff` row granted the whole dashboard. The
 * capability check lives in one call per action rather than in a route table,
 * for the reason noted on vendorForAction itself — a table is a list somebody
 * forgets, and the failure is silent and in the dangerous direction.
 *
 * ── Two rules the sidebar cannot enforce ────────────────────────────────────
 *
 * A manager may only hand out `staff` (assignableRoles, lib/team.js), because
 * `team` would otherwise escalate to every other capability in one step. And a
 * showroom must keep an owner — checked here so the seller reads a sentence,
 * and again by a trigger in §34.2 so a future caller that forgets cannot
 * strand a showroom nobody can administer.
 *
 * ── acceptInvitation is deliberately NOT guarded by `team` ──────────────────
 *
 * The person accepting is not a member yet; that is the whole point. It is
 * guarded by the token in their email AND by their signed-in address matching
 * the one invited. See the note on it below.
 */

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  vendorForAction,
  currentViewer,
  localePath,
} from '@/marketplace/auth/session';
import {
  createInvite,
  openInviteFor,
  revokeInvite,
  setMemberRole,
  removeMember,
  memberRole,
  countOwners,
  inviteByToken,
  acceptInvite,
  normalizeEmail,
} from '@/marketplace/db/queries/team';
import { findUserByEmail } from '@/marketplace/db/queries/admin';
import { assignableRoles, TEAM_ROLES } from '@/marketplace/lib/team';
import { sendTeamInviteEmail } from '@/marketplace/auth/mailer';
import { SITE_URL } from '@/marketplace/lib/sitePages';

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, errors: {}, token: stamp(), ...data });
const bad = (error, errors = {}) => ({ ok: false, error, errors, token: stamp() });

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

/* Good enough, and deliberately not stricter. The address only matters if a
   real message reaches it, so the delivery is the validation — a regex that
   rejects a valid address is worse than one that accepts a typo. */
const looksLikeEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

const revalidateTeam = () => {
  revalidatePath('/[locale]/marketplace/seller/settings/team', 'page');
};

/* ── Inviting ─────────────────────────────────────────────────────────────── */

export async function inviteTeamMember(prevState, formData) {
  const email = normalizeEmail(str(formData, 'email'));
  const role = str(formData, 'role') || 'staff';
  const wanted = str(formData, 'vendorId') || null;
  const locale = str(formData, 'locale') || 'ar';

  if (!email) return bad('TEAM_EMAIL_REQUIRED', { email: 'TEAM_EMAIL_REQUIRED' });
  if (!looksLikeEmail(email)) return bad('EMAIL_INVALID', { email: 'EMAIL_INVALID' });
  if (!TEAM_ROLES.includes(role)) return bad('TEAM_ROLE_INVALID', { role: 'TEAM_ROLE_INVALID' });

  const { viewer, vendorId, error: denied } = await vendorForAction(wanted, 'team');
  if (denied) return bad(denied);

  /* What the INVITER may hand out, not what the enum allows. A manager
     offering `owner` has either been tampered with or is using a stale form. */
  const mine = viewer.vendors.find((v) => v.id === vendorId);
  if (!assignableRoles(mine?.role).includes(role)) return bad('TEAM_ROLE_TOO_HIGH');

  /* Inviting yourself is always a mistake and always confusing: the upsert
     would silently rewrite your own role, which for a sole owner means
     demoting the only person who can undo it. */
  if (viewer.email && normalizeEmail(viewer.email) === email) return bad('TEAM_SELF');

  /* Already in the team? Say so rather than sending a link that, on being
     accepted, would quietly change their role. Changing a role is its own
     action with its own confirmation. */
  const existing = await findUserByEmail(email).catch(() => null);
  if (existing?.id && (await memberRole(vendorId, existing.id))) {
    return bad('TEAM_ALREADY_MEMBER');
  }

  if (await openInviteFor(vendorId, email)) return bad('TEAM_ALREADY_INVITED');

  const { invite, error, code } = await createInvite({
    vendorId,
    email,
    role,
    invitedBy: viewer.userId,
    invitedByName: viewer.fullName ?? viewer.email ?? null,
  });

  if (error) {
    /* The partial unique index in §34.1, hit by two presses in the same
       instant. The check above is what a person normally meets; this is the
       race, and it deserves the same message rather than a database string. */
    if (code === '23505') return bad('TEAM_ALREADY_INVITED');
    console.error('[team] invite failed:', error);
    return bad('SAVE_FAILED');
  }

  /**
   * The link, and the email carrying it.
   *
   * The invitation EXISTS whether or not the message is delivered, and that
   * ordering is deliberate: a seller whose SMTP is misconfigured still has a
   * working link to copy out of the team page, where every pending invitation
   * shows one. Returning the link in the action's result is what makes that
   * possible — and it is safe to return, because only somebody who already
   * holds the `team` capability can see this result.
   */
  const url = `${SITE_URL}/${locale}/marketplace/invite/${invite.token}`;

  const sent = await sendTeamInviteEmail({
    to: email,
    url,
    role,
    locale,
    vendorName: mine?.name ?? null,
    invitedByName: viewer.fullName ?? null,
  }).then(
    () => true,
    (err) => {
      console.error('[team] invite email failed:', err?.message ?? err);
      return false;
    }
  );

  revalidateTeam();
  return ok({ invited: email, url, emailSent: sent });
}

export async function revokeTeamInvite(prevState, formData) {
  const inviteId = str(formData, 'inviteId');
  const wanted = str(formData, 'vendorId') || null;

  if (!inviteId) return bad('TEAM_INVITE_NOT_FOUND');

  const { viewer, vendorId, error: denied } = await vendorForAction(wanted, 'team');
  if (denied) return bad(denied);

  const { ok: done, error } = await revokeInvite({
    vendorId,
    inviteId,
    by: viewer.email ?? viewer.userId,
  });

  if (error) {
    console.error('[team] revoke failed:', error);
    return bad('SAVE_FAILED');
  }
  if (!done) return bad('TEAM_INVITE_NOT_FOUND');

  revalidateTeam();
  return ok();
}

/* ── Changing what somebody may do ────────────────────────────────────────── */

export async function changeMemberRole(prevState, formData) {
  const userId = str(formData, 'userId');
  const role = str(formData, 'role');
  const wanted = str(formData, 'vendorId') || null;

  if (!userId) return bad('TEAM_MEMBER_NOT_FOUND');
  if (!TEAM_ROLES.includes(role)) return bad('TEAM_ROLE_INVALID');

  const { viewer, vendorId, error: denied } = await vendorForAction(wanted, 'team');
  if (denied) return bad(denied);

  const mine = viewer.vendors.find((v) => v.id === vendorId);
  const grantable = assignableRoles(mine?.role);
  if (!grantable.includes(role)) return bad('TEAM_ROLE_TOO_HIGH');

  const current = await memberRole(vendorId, userId);
  if (!current) return bad('TEAM_MEMBER_NOT_FOUND');
  if (current === role) return ok();

  /**
   * ── The role they hold NOW has to be one I could grant ──────────────────
   *
   * Checking only the new role is not enough, and the hole is not theoretical:
   * a manager may grant `staff`, so "set this person to staff" would have
   * passed — including when that person is an OWNER. A manager could demote
   * the owner who invited them.
   *
   * The last-owner rule below would often catch it by accident, on a showroom
   * with one owner. On a showroom with two it would not, and a manager could
   * strip both. So the rule is symmetric: you may only change a member whose
   * current role is also yours to hand out.
   */
  if (!grantable.includes(current)) return bad('TEAM_ROLE_TOO_HIGH');

  /**
   * Demoting the last owner.
   *
   * Checked BEFORE the write so the seller gets a sentence instead of a
   * constraint violation. §34.2's trigger is still there and still necessary —
   * two owners demoting each other at the same moment would each read the
   * other as remaining, and only the database sees both writes.
   */
  if (current === 'owner' && role !== 'owner') {
    const owners = await countOwners(vendorId);
    if (owners !== null && owners <= 1) return bad('TEAM_LAST_OWNER');
  }

  const { ok: done, error } = await setMemberRole({ vendorId, userId, role });

  if (error) {
    if (/at least one owner/i.test(error)) return bad('TEAM_LAST_OWNER');
    console.error('[team] role change failed:', error);
    return bad('SAVE_FAILED');
  }
  if (!done) return bad('TEAM_MEMBER_NOT_FOUND');

  revalidateTeam();
  /* Their sidebar is built from this role, so the dashboard shell has to be
     rebuilt for them too — not only this page. */
  revalidatePath('/[locale]/marketplace/seller', 'layout');
  return ok();
}

export async function removeTeamMember(prevState, formData) {
  const userId = str(formData, 'userId');
  const wanted = str(formData, 'vendorId') || null;

  if (!userId) return bad('TEAM_MEMBER_NOT_FOUND');

  const { viewer, vendorId, error: denied } = await vendorForAction(wanted, 'team');
  if (denied) return bad(denied);

  const current = await memberRole(vendorId, userId);
  if (!current) return bad('TEAM_MEMBER_NOT_FOUND');

  /**
   * Same symmetry as changeMemberRole: a manager may hand out `staff`, so a
   * manager may remove staff — and nobody else. Without this a manager could
   * delete the owner outright, which is a shorter path to the same damage as
   * demoting them.
   *
   * Leaving is the exception. Removing YOURSELF is always allowed whatever
   * your role, because the alternative is a person who cannot resign from a
   * showroom they no longer work for. The last-owner rule still applies, so a
   * sole owner is told to appoint a successor first rather than being allowed
   * to orphan the showroom on their way out.
   */
  const mine = viewer.vendors.find((v) => v.id === vendorId);
  const leaving = userId === viewer.userId;
  if (!leaving && !assignableRoles(mine?.role).includes(current)) {
    return bad('TEAM_ROLE_TOO_HIGH');
  }

  if (current === 'owner') {
    const owners = await countOwners(vendorId);
    if (owners !== null && owners <= 1) return bad('TEAM_LAST_OWNER');
  }

  const { ok: done, error } = await removeMember({ vendorId, userId });

  if (error) {
    if (/at least one owner/i.test(error)) return bad('TEAM_LAST_OWNER');
    console.error('[team] remove failed:', error);
    return bad('SAVE_FAILED');
  }
  if (!done) return bad('TEAM_MEMBER_NOT_FOUND');

  revalidateTeam();
  revalidatePath('/[locale]/marketplace/seller', 'layout');

  /* Somebody who removed THEMSELVES is no longer a member, so the dashboard
     they are looking at is no longer theirs to look at. Send them out rather
     than letting the next click redirect them from a page mid-render. */
  if (userId === viewer.userId) redirect(await localePath('/marketplace'));

  return ok();
}

/* ── The invitee's side ──────────────────────────────────────────────────────
   Not behind the `team` capability: the caller is not a member yet, which is
   the entire situation. The guards are the token (a secret, in their email)
   and the match between the invited address and the signed-in one. §34.1 sets
   out why BOTH are required — a token alone is a forwarded link, and an
   address alone lets whoever later registers it inherit a seat.
   ------------------------------------------------------------------------- */

export async function acceptInvitation(prevState, formData) {
  const token = str(formData, 'token');
  if (!token) return bad('INVITE_INVALID');

  const viewer = await currentViewer();
  if (!viewer) return bad('NOT_SIGNED_IN');

  const invite = await inviteByToken(token);
  if (!invite) return bad('INVITE_INVALID');
  if (invite.accepted_at) return bad('INVITE_USED');
  if (invite.revoked_at) return bad('INVITE_REVOKED');
  if (new Date(invite.expires_at).getTime() < Date.now()) return bad('INVITE_EXPIRED');

  if (normalizeEmail(viewer.email) !== normalizeEmail(invite.email)) {
    return bad('INVITE_WRONG_ACCOUNT');
  }

  const { ok: done, error } = await acceptInvite({ invite, userId: viewer.userId });
  if (!done) {
    console.error('[team] accept failed:', error);
    return bad('SAVE_FAILED');
  }

  /* A membership changes what this person is — the header, the sidebar, and
     whether "Seller dashboard" appears at all. getViewer() is cached per
     request, so nothing stale survives the redirect; the layout revalidation
     is for their other open tabs. */
  revalidatePath('/[locale]/marketplace', 'layout');
  revalidateTeam();

  redirect(await localePath('/marketplace/seller'));
}
