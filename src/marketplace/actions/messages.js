'use server';

/**
 * Sending a message, and marking a thread read.
 *
 * ── One file for both sides ─────────────────────────────────────────────────
 *
 * Every other action in this codebase lives under the route group whose screens
 * call it, and a conversation has two ends: a seller's drawer and an admin's.
 * Written twice they would be the same function with the sender flipped, and
 * the thing that would drift between the copies is the part that must not —
 * which notification is recorded, which topic is broadcast on, and what counts
 * as an empty message. So it is one file, above both groups, and `sender` is an
 * argument rather than an assumption.
 *
 * ── The side is derived from the SESSION, never from the form ───────────────
 *
 * `sendMessage` does not take a "sender" field. It asks who is calling — staff,
 * or a member of the showroom — and a request that is neither is refused. A
 * posted sender would let a showroom write a line and sign it as the platform.
 */

import { revalidatePath } from 'next/cache';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer, vendorForRenewal } from '@/marketplace/auth/session';
import { pushNotification } from '@/marketplace/lib/push';
import { notifyVendorLeads, notifyAdmins } from '@/marketplace/lib/realtime';
import { CHAT_BUCKET } from '@/marketplace/db/queries/messages';
import { isMissingSchema } from '@/marketplace/db/queries/engagement';

const str = (fd, k) => {
  const v = fd.get(k);
  return typeof v === 'string' ? v.trim() : '';
};

const stamp = () => Date.now() + Math.random();
const ok = (data = {}) => ({ ok: true, error: null, token: stamp(), ...data });
const bad = (error, extra = {}) => ({ ok: false, error, token: stamp(), ...extra });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_BODY = 4000;
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 5;

/* Five ten-megabyte files is fifty megabytes in one request, which the
   framework would refuse before this code ran — see serverActions.bodySizeLimit
   in next.config.mjs. The per-file limit is what a person thinks in; this is
   what keeps the sum inside what the transport will actually carry, and it is
   checked so the refusal is a sentence rather than a dropped request. */
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

/* Mirrors the bucket's own allowlist. Checked here as well because the bucket
   reports a 415 long after the upload has been paid for in bandwidth, and
   "unsupported media type" is not a sentence to show anybody. */
const ALLOWED = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

const EXTENSIONS = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/avif': 'avif', 'image/gif': 'gif', 'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt', 'text/csv': 'csv',
};

function refresh() {
  revalidatePath('/[locale]/marketplace/seller', 'layout');
  revalidatePath('/[locale]/marketplace/admin', 'layout');
}

/**
 * Who is calling, and therefore which side of the conversation they are.
 *
 * Staff first: an admin who also belongs to a showroom is acting as the
 * platform here, because that is the panel they are writing from. The other
 * order would make a staff member's own showroom the one place they cannot
 * answer as themselves.
 *
 * A seller resolves through vendorForRenewal(), not vendorForAction(), for the
 * reason payment-proof.js gives at length: the showroom most likely to need to
 * talk to us is the one whose dashboard has closed, and refusing them the
 * conversation would be refusing the conversation about why.
 */
async function resolveSide(wantedVendorId) {
  const viewer = await getViewer();
  if (!viewer?.userId) return { error: 'SIGN_IN_REQUIRED' };

  const name = viewer.fullName || viewer.email || null;

  if (viewer.role === 'staff' || viewer.role === 'admin') {
    if (!UUID.test(wantedVendorId ?? '')) return { error: 'NOT_FOUND' };
    return { side: 'admin', vendorId: wantedVendorId, userId: viewer.userId, name };
  }

  const { vendorId, error } = await vendorForRenewal(wantedVendorId || null);
  if (error || !vendorId) return { error: error ?? 'NOT_ALLOWED' };

  return { side: 'vendor', vendorId, userId: viewer.userId, name };
}

/**
 * The thread for one showroom, made if it is not there yet.
 *
 * Created on first message rather than with the showroom: a conversation nobody
 * has opened is a row that exists only to be counted, and the admin's list is
 * far more useful showing the showrooms somebody has actually spoken to.
 *
 * `on conflict` rather than read-then-insert, because two people writing to the
 * same showroom in the same instant would otherwise both find nothing and both
 * insert — and the unique index on vendor_id would fail the second.
 */
async function ensureConversation(db, vendorId) {
  const { data, error } = await db
    .from('conversations')
    .upsert({ vendor_id: vendorId }, { onConflict: 'vendor_id' })
    .select('id')
    .maybeSingle();

  if (error) return { error: isMissingSchema(error) ? 'MESSAGES_NOT_MIGRATED' : 'SAVE_FAILED' };
  return { id: data?.id ?? null };
}

/** Say something. */
export async function sendMessage(prevState, formData) {
  const wanted = str(formData, 'vendorId') || null;
  const who = await resolveSide(wanted);
  if (who.error) return bad(who.error);

  const body = str(formData, 'body').slice(0, MAX_BODY);

  /* Everything that can refuse runs BEFORE the upload, so nobody on a slow
     connection sends ten megabytes and is then told the message was empty. */
  const files = formData.getAll('files').filter((f) => f && typeof f !== 'string' && f.size > 0);

  if (!body && !files.length) return bad('MESSAGE_EMPTY');
  if (files.length > MAX_FILES) return bad('MESSAGE_TOO_MANY_FILES');

  let total = 0;
  for (const file of files) {
    if (file.size > MAX_BYTES) return bad('MESSAGE_FILE_TOO_BIG');
    if (!ALLOWED.has(file.type)) return bad('MESSAGE_FILE_TYPE');
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) return bad('MESSAGE_FILES_TOO_BIG');

  const db = getMarketplaceDb();

  const { id: conversationId, error: threadError } = await ensureConversation(db, who.vendorId);
  if (threadError) return bad(threadError);
  if (!conversationId) return bad('SAVE_FAILED');

  /* ── Now, and only now, the bytes ──────────────────────────────────────── */
  const attachments = [];
  const uploaded = [];

  for (const file of files) {
    const ext = EXTENSIONS[file.type] ?? 'bin';
    const key = `${who.vendorId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await db.storage
      .from(CHAT_BUCKET)
      .upload(key, file, { contentType: file.type, upsert: false });

    if (error) {
      // Take back whatever did land: an object with no message pointing at it
      // is invisible to everybody and deletable by nobody.
      if (uploaded.length) await db.storage.from(CHAT_BUCKET).remove(uploaded).catch(() => {});
      return bad('UPLOAD_FAILED', { detail: error.message });
    }

    uploaded.push(key);
    attachments.push({
      path: key,
      // The name as the sender's computer had it, which is the only clue to
      // what a document IS once it is a random key in a bucket.
      name: String(file.name ?? '').slice(0, 120),
      mime: file.type,
      size: file.size,
    });
  }

  const { data: saved, error } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      vendor_id: who.vendorId,
      sender: who.side,
      sender_user_id: who.userId,
      sender_name: who.name,
      body: body || null,
      attachments,
    })
    .select('id, created_at')
    .maybeSingle();

  if (error) {
    if (uploaded.length) await db.storage.from(CHAT_BUCKET).remove(uploaded).catch(() => {});
    return bad(isMissingSchema(error) ? 'MESSAGES_NOT_MIGRATED' : 'SAVE_FAILED', {
      detail: error.message,
    });
  }

  /* ── The preview, and the sender's own read mark ───────────────────────────
     Both in one update. Stamping the sender's side as read is not cosmetic:
     without it somebody who writes a message immediately has one unread of
     their own, which is how a badge stops meaning anything. */
  const preview = body
    ? body.slice(0, 140)
    : `📎 ${attachments[0]?.name ?? ''}`.trim().slice(0, 140);

  await db
    .from('conversations')
    .update({
      last_message_at: saved?.created_at ?? new Date().toISOString(),
      last_message_preview: preview,
      last_sender: who.side,
      ...(who.side === 'admin'
        ? { admin_read_at: new Date().toISOString() }
        : { vendor_read_at: new Date().toISOString() }),
    })
    .eq('id', conversationId);

  /* ── Telling the other end ─────────────────────────────────────────────────
     Broadcast for the open tab, a notification for the one that is closed.
     Both, because they answer different questions: the first makes the drawer
     move while somebody is looking at it, and the second is what a showroom
     finds in the morning. */
  /* ── A message is NOT a notification ───────────────────────────
     It deliberately does NOT call recordNotification, which is what every other
     event here uses. That would put every line of a conversation in the bell
     and add it to the bell's count — so a ten-message exchange would leave ten
     unread notifications sitting beside a conversation the person had already
     read, and clearing one would have nothing to do with the other.

     A chat keeps its own count, on its own icon, and the drawer clears it by
     being opened. Two counters for one fact is how both stop being believed.

     What IS still sent is the PUSH, called directly rather than through
     recordNotification, because that is the half that reaches a phone whose
     screen is off — and it is the whole reason messaging is worth having on a
     phone at all. It writes no row, so the bell never sees it. */
  if (who.side === 'admin') {
    notifyVendorLeads(who.vendorId, 'message_new', { conversationId });
    await pushNotification({
      audience: 'vendor',
      vendorId: who.vendorId,
      kind: 'message_new',
      data: { preview, from: who.name },
      href: '/marketplace/seller',
    });
  } else {
    notifyAdmins('message_new', { conversationId, vendorId: who.vendorId });
    await pushNotification({
      audience: 'admin',
      kind: 'message_new',
      data: { preview, from: who.name },
      href: '/marketplace/admin',
    });
  }

  refresh();
  return ok({ id: saved?.id ?? null });
}

/**
 * "I have read this."
 *
 * One column on the conversation, not a row per message — see the MESSAGES
 * section of schema.sql for why read state belongs to a side rather than to a
 * person. Marking read is therefore idempotent and cheap enough to fire every
 * time the drawer opens.
 *
 * It never creates a conversation. Opening a thread that does not exist yet is
 * reading nothing, and inventing a row for it would put an empty conversation
 * in the admin's list the moment anybody clicked a showroom's name.
 */
export async function markConversationRead(prevState, formData) {
  const wanted = str(formData, 'vendorId') || null;
  const who = await resolveSide(wanted);
  if (who.error) return bad(who.error);

  const db = getMarketplaceDb();
  const column = who.side === 'admin' ? 'admin_read_at' : 'vendor_read_at';

  const { error } = await db
    .from('conversations')
    .update({ [column]: new Date().toISOString() })
    .eq('vendor_id', who.vendorId);

  if (error) {
    return bad(isMissingSchema(error) ? 'MESSAGES_NOT_MIGRATED' : 'SAVE_FAILED');
  }

  /* ── Telling the other end it was read ─────────────────────────
     What turns the ticks from a fact discovered on the next refetch into one
     that moves while somebody is looking at it. No notification and no push:
     "they read it" is worth a mark on a bubble and is not worth a buzz in
     somebody's pocket. */
  if (who.side === 'admin') {
    notifyVendorLeads(who.vendorId, 'message_read', {});
  } else {
    notifyAdmins('message_read', { vendorId: who.vendorId });
  }

  refresh();
  return ok({ vendorId: who.vendorId });
}
