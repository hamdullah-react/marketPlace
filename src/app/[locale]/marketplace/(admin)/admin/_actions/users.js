'use server';

import { revalidatePath } from 'next/cache';
import { adminForAction } from '@/marketplace/auth/session';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getMarketplaceAuthAdmin } from '@/marketplace/auth/admin';
import { findUserByEmail, writeAudit } from '@/marketplace/db/queries/admin';
import { notifyUser } from '@/marketplace/lib/realtime';

/**
 * Admin actions on accounts: grant or remove admin, delete an account.
 *
 * Two rules hold on every path, because breaking either locks the platform:
 *   · you cannot remove your own admin role or delete yourself
 *   · the last admin cannot be demoted or deleted
 */

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};
const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = ['admin', 'buyer'];

const refresh = () => {
  revalidatePath('/[locale]/marketplace/admin', 'layout');
  // The header badge and admin link come from the viewer's role.
  revalidatePath('/[locale]/marketplace', 'layout');
};

async function adminCount(db) {
  const { count } = await db
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin');
  return count ?? 0;
}

async function applyRole(viewer, userId, role) {
  const db = getMarketplaceDb();

  const { data: current, error } = await db
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle();
  if (error) return bad('SAVE_FAILED', { detail: error.message });

  const before = current?.role ?? null;
  if (before === role) return ok({ role });

  if (before === 'admin' && role !== 'admin') {
    if (userId === viewer.userId) return bad('CANNOT_DEMOTE_SELF');
    if ((await adminCount(db)) <= 1) return bad('LAST_ADMIN');
  }

  // A profile is normally created by a trigger at sign-up; insert one if that
  // never happened, rather than refusing to make the person an admin.
  const write = current
    ? db.from('profiles').update({ role }).eq('id', userId)
    : db.from('profiles').insert({ id: userId, role });

  const { error: writeError } = await write;
  if (writeError) return bad('SAVE_FAILED', { detail: writeError.message });

  await writeAudit(viewer, 'role.set', 'profile', userId, { role: before }, { role });

  // A demoted admin with the panel open is sent out of it immediately
  // (useLiveBoosts → onRevoked), rather than on their next click.
  if (before === 'admin' && role !== 'admin') notifyUser(userId, 'role_changed', { role });

  refresh();
  return ok({ role });
}

export async function setUserRole(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const userId = str(formData, 'userId');
  const role = str(formData, 'role');
  if (!UUID.test(userId)) return bad('USER_NOT_FOUND');
  if (!ROLES.includes(role)) return bad('SAVE_FAILED');

  return applyRole(viewer, userId, role);
}

export async function addAdminByEmail(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const email = str(formData, 'email').toLowerCase();
  if (!email) return bad('EMAIL_REQUIRED');

  let user;
  try {
    user = await findUserByEmail(email);
  } catch (err) {
    return bad('SAVE_FAILED', { detail: err.message });
  }
  if (!user) return bad('USER_NOT_FOUND');

  const result = await applyRole(viewer, user.id, 'admin');
  return result.ok ? { ...result, email } : result;
}

export async function deleteUserAccount(prevState, formData) {
  const { viewer, error: denied } = await adminForAction();
  if (denied) return bad(denied);

  const userId = str(formData, 'userId');
  const confirm = str(formData, 'confirm').toLowerCase();

  if (!UUID.test(userId)) return bad('USER_NOT_FOUND');
  if (userId === viewer.userId) return bad('CANNOT_DELETE_SELF');

  const auth = getMarketplaceAuthAdmin().auth.admin;
  const { data: found, error: getError } = await auth.getUserById(userId);
  if (getError || !found?.user) return bad('USER_NOT_FOUND');

  // Typing the address is the confirmation — a mis-click cannot delete anyone.
  const email = (found.user.email ?? '').toLowerCase();
  if (email && confirm !== email) {
    return bad('CONFIRM_MISMATCH', { params: { expected: email } });
  }

  const db = getMarketplaceDb();
  const { data: profile } = await db.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (profile?.role === 'admin' && (await adminCount(db)) <= 1) return bad('LAST_ADMIN');

  // These hold the user id as plain text with no foreign key, so deleting the
  // account would leave them behind. Orders, bookings and reviews are kept:
  // they are the showrooms' records too.
  await Promise.all([
    db.from('saved_listings').delete().eq('user_id', userId),
    db.from('saved_searches').delete().eq('user_id', userId),
    db.from('addresses').delete().eq('user_id', userId),
  ]);

  // profiles and vendor_members go with it (on delete cascade).
  const { error: deleteError } = await auth.deleteUser(userId);
  if (deleteError) return bad('DELETE_FAILED', { detail: deleteError.message });

  await writeAudit(viewer, 'user.delete', 'user', userId, { email, role: profile?.role ?? null }, null);

  // Anyone deleted while looking at a page is sent home at once.
  notifyUser(userId, 'role_changed', { deleted: true });
  refresh();
  return ok({ deleted: userId });
}
