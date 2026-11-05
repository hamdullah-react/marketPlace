import 'server-only';

/**
 * A showroom's team: who is in it, and who has been asked.
 *
 * Service-role only — every caller is behind vendorForAction(…, 'team') or
 * requireVendorCan('team'), except the invitation lookups, which run before
 * the caller belongs to anything and are guarded by the token instead. See
 * schema.sql §34.
 *
 * ── Emails come from auth.users, names from profiles ────────────────────────
 *
 * The same split queries/admin.js documents: PostgREST does not expose
 * auth.users, so an address has to come through the auth admin API, while
 * `full_name` lives on `profiles` where a trigger keeps it. A team is a handful
 * of people, so the per-member lookup is a handful of calls and not worth the
 * scan-and-join the admin user list needs.
 *
 * ── What this deliberately does NOT read ────────────────────────────────────
 *
 * `last_seen_at`. It would be a nice column on a team table and it is the one
 * that does not exist until schema.sql §33 has been run by hand — and a select
 * naming a missing column fails the WHOLE select in PostgREST (42703), which
 * on this very table would mean a team page that shows no team. Presence has
 * its own page; this one asks only for columns that have always existed, so it
 * needs no fallback tier and cannot acquire that bug later.
 */

import { randomBytes } from 'node:crypto';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getMarketplaceAuthAdmin } from '@/marketplace/auth/admin';
import { INVITE_DAYS } from '@/marketplace/lib/team';

const INVITE_SELECT =
  'id, email, role, token, invited_by_name, expires_at, accepted_at, revoked_at, created_at';

/** Lower-cased and trimmed, the one shape an address is ever stored or compared in. */
export const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase();

/**
 * The whole team page in one read: members, then invitations.
 *
 * Never throws. A team page that 500s locks an owner out of the only screen
 * that can fix their team, so a failure returns empty lists and the error, and
 * the page says so.
 */
export async function getTeam(vendorId) {
  if (!vendorId) return { members: [], invites: [], error: null };

  const db = getMarketplaceDb();

  const [membersResult, invitesResult] = await Promise.all([
    db
      .from('vendor_members')
      .select('user_id, role, created_at')
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: true }),
    db
      .from('vendor_invites')
      .select(INVITE_SELECT)
      .eq('vendor_id', vendorId)
      .order('created_at', { ascending: false }),
  ]);

  if (membersResult.error) {
    return { members: [], invites: [], error: membersResult.error.message };
  }

  const rows = membersResult.data ?? [];
  const ids = rows.map((r) => r.user_id);

  /* Names in one round trip, addresses in one each. */
  const { data: profiles } = ids.length
    ? await db.from('profiles').select('id, full_name, phone').in('id', ids)
    : { data: [] };

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
  const auth = getMarketplaceAuthAdmin().auth.admin;

  const members = await Promise.all(
    rows.map(async (row) => {
      /* An address we cannot read is not a reason to drop the member from the
         list — they are still in the team, and hiding them would make a seat
         nobody can see or remove. */
      const user = await auth
        .getUserById(row.user_id)
        .then(({ data }) => data?.user ?? null)
        .catch(() => null);

      const profile = byId.get(row.user_id);

      return {
        userId: row.user_id,
        role: row.role,
        joinedAt: row.created_at,
        name: profile?.full_name ?? user?.user_metadata?.full_name ?? null,
        email: user?.email ?? null,
        phone: profile?.phone ?? null,
      };
    })
  );

  return {
    members,
    /* The invitations table may not exist yet, for the same reason §33's
       columns may not: schema.sql is run by hand. An empty list and a working
       members table beats a page that will not load. */
    invites: invitesResult.error ? [] : (invitesResult.data ?? []),
    invitesMissing: Boolean(invitesResult.error),
    error: null,
  };
}

/** How many owners this showroom has — the number §34.2's trigger protects. */
export async function countOwners(vendorId) {
  const { count, error } = await getMarketplaceDb()
    .from('vendor_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .eq('role', 'owner');

  return error ? null : (count ?? 0);
}

/** This person's role in this showroom, or null if they are not in it. */
export async function memberRole(vendorId, userId) {
  const { data } = await getMarketplaceDb()
    .from('vendor_members')
    .select('role')
    .eq('vendor_id', vendorId)
    .eq('user_id', userId)
    .maybeSingle();

  return data?.role ?? null;
}

/**
 * Mint an invitation.
 *
 * 32 random bytes as base64url: it is the capability in the email (§34.1), so
 * it has to be unguessable rather than merely unique. `expires_at` is computed
 * here rather than defaulted in SQL so the window is a product decision
 * somebody can find — INVITE_DAYS in lib/team.js.
 */
export async function createInvite({ vendorId, email, role, invitedBy, invitedByName }) {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  const { data, error } = await getMarketplaceDb()
    .from('vendor_invites')
    .insert({
      vendor_id: vendorId,
      email: normalizeEmail(email),
      role,
      token,
      invited_by: invitedBy ?? null,
      invited_by_name: invitedByName ?? null,
      expires_at: expires.toISOString(),
    })
    .select(INVITE_SELECT)
    .single();

  return { invite: data ?? null, error: error?.message ?? null, code: error?.code ?? null };
}

/** An open invitation for this address at this showroom, or null. */
export async function openInviteFor(vendorId, email) {
  const { data } = await getMarketplaceDb()
    .from('vendor_invites')
    .select(INVITE_SELECT)
    .eq('vendor_id', vendorId)
    .eq('email', normalizeEmail(email))
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle();

  return data ?? null;
}

/**
 * Cancel an invitation.
 *
 * Marked, not deleted — §34.1 keeps three moments so the team page can show
 * that a link was sent and withdrawn. Scoped by vendor_id as well as id, so a
 * guessed id from another showroom cancels nothing.
 */
export async function revokeInvite({ vendorId, inviteId, by }) {
  const { data, error } = await getMarketplaceDb()
    .from('vendor_invites')
    .update({ revoked_at: new Date().toISOString(), revoked_by: by ?? null })
    .eq('id', inviteId)
    .eq('vendor_id', vendorId)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  return { ok: Boolean(data), error: error?.message ?? null };
}

/**
 * Clear a FINISHED invitation off the list.
 *
 * ── A real delete, unlike revoke ───────────────────────────────────────────
 *
 * revokeInvite() marks a live invitation dead and keeps the row, because the
 * showroom needs to see that a link was sent and withdrawn. This is the other
 * thing an owner wants and could not do: an invitation that is ACCEPTED,
 * revoked or expired has done its job and sits on the page for ever. The
 * person it was for is in Team members now; the row is just clutter, and a
 * list that only grows is one nobody reads.
 *
 * Refused while the invitation is still PENDING — the guard is in the SQL
 * here, not only in the action. A live link that vanished from the page would
 * still work for whoever holds it, and nobody would be able to see it, which
 * is the one state this table must never be in. Cancel it first; that is what
 * revoke is for, and a revoked row can then be cleared.
 */
export async function deleteInvite({ vendorId, inviteId }) {
  const { data, error } = await getMarketplaceDb()
    .from('vendor_invites')
    .delete()
    .eq('id', inviteId)
    .eq('vendor_id', vendorId)
    /* Not pending: taken up, killed, or simply out of time. The third arm
       matters — an EXPIRED invitation has neither moment stamped on it, so a
       filter built from those two alone would have made exactly the rows that
       pile up the ones that could never be cleared. */
    .or(`accepted_at.not.is.null,revoked_at.not.is.null,expires_at.lt.${new Date().toISOString()}`)
    .select('id')
    .maybeSingle();

  return { ok: Boolean(data), error: error?.message ?? null };
}

/** Change what a member may do. The owner-count rule is checked by the caller. */
export async function setMemberRole({ vendorId, userId, role }) {
  const { data, error } = await getMarketplaceDb()
    .from('vendor_members')
    .update({ role })
    .eq('vendor_id', vendorId)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();

  return { ok: Boolean(data), error: error?.message ?? null };
}

/**
 * Take somebody out of the team.
 *
 * Their listings, leads and uploads stay with the SHOWROOM — everything is
 * keyed by vendor_id, not by the person who typed it, so removing a
 * salesperson never removes the cars they listed. That is the whole reason
 * §17.2 preferred a membership table to a shared login.
 */
export async function removeMember({ vendorId, userId }) {
  const { data, error } = await getMarketplaceDb()
    .from('vendor_members')
    .delete()
    .eq('vendor_id', vendorId)
    .eq('user_id', userId)
    .select('user_id')
    .maybeSingle();

  return { ok: Boolean(data), error: error?.message ?? null };
}

/* ── The invitee's side ──────────────────────────────────────────────────────
   These run for somebody who is not yet a member, so they are guarded by the
   token rather than by membership. The caller still has to check that the
   signed-in address matches — see §34.1 on why the token alone is not enough.
   ------------------------------------------------------------------------- */

/** An invitation and the showroom it is for, by token. */
export async function inviteByToken(token) {
  if (!token) return null;

  const { data } = await getMarketplaceDb()
    .from('vendor_invites')
    .select(
      `id, vendor_id, email, role, expires_at, accepted_at, revoked_at, invited_by_name,
       vendors ( id, slug, name, logo_url, state )`
    )
    .eq('token', token)
    .maybeSingle();

  return data ?? null;
}

/**
 * Turn an accepted invitation into a membership.
 *
 * Upsert, because the invited address may already be in the team — invited
 * twice, or invited after being added by hand. Accepting then settles their
 * role at whatever the invitation offered rather than failing on a duplicate
 * key and leaving the link apparently broken.
 *
 * The invitation is stamped SECOND and only on success. The other order would
 * burn a single-use token on a membership that did not get written, which is
 * unrecoverable from the invitee's side: their link is spent and they are not
 * in the team.
 */
export async function acceptInvite({ invite, userId }) {
  const db = getMarketplaceDb();

  const { error: memberError } = await db
    .from('vendor_members')
    .upsert({ vendor_id: invite.vendor_id, user_id: userId, role: invite.role }, {
      onConflict: 'vendor_id, user_id',
    });

  if (memberError) return { ok: false, error: memberError.message };

  const { error: stampError } = await db
    .from('vendor_invites')
    .update({ accepted_at: new Date().toISOString(), accepted_by: userId })
    .eq('id', invite.id)
    .is('accepted_at', null)
    .is('revoked_at', null);

  /* The seat is granted either way; a failed stamp only means the invitation
     still looks open on the team page. Worth logging, not worth refusing a
     membership that already exists. */
  if (stampError) console.warn('[team] invite accepted but not stamped:', stampError.message);

  return { ok: true, error: null };
}

/**
 * Open invitations waiting for this address.
 *
 * For the banner on the dashboard and the account page: somebody invited while
 * they were already signed in has no reason to go back to their email, and an
 * invitation nobody can find is an invitation that expires.
 */
export async function pendingInvitesFor(email) {
  const wanted = normalizeEmail(email);
  if (!wanted) return [];

  const { data, error } = await getMarketplaceDb()
    .from('vendor_invites')
    .select('id, token, role, expires_at, invited_by_name, vendors ( slug, name, logo_url )')
    .eq('email', wanted)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });

  return error ? [] : (data ?? []);
}
