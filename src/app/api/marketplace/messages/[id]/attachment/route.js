import { NextResponse } from 'next/server';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer } from '@/marketplace/auth/session';
import { signAttachment } from '@/marketplace/db/queries/messages';

/**
 * Redirects to a short-lived signed URL for one message attachment.
 *
 * Attachments live in a PRIVATE bucket (the MESSAGES section of schema.sql),
 * because what people attach to a conversation with the platform is a bank
 * letter, a registration document, a photograph of a damaged car. There is
 * therefore no permanent address to put in an `<img src>`, and this mints one
 * at click time — the same shape as the payment-receipt route next door.
 *
 * ── Who may see it ──────────────────────────────────────────────────────────
 *
 * Staff, or a member of the showroom whose thread it is. Anybody else gets a
 * 404: an attachment that is not yours reads exactly like one that does not
 * exist, which is the rule the backups and receipts routes both settled on.
 *
 * ── Which file, of several ──────────────────────────────────────────────────
 *
 * `?i=` is an INDEX into the message's own attachments array, not a path. A
 * path in the query string would be a request to sign whatever the caller named
 * — and the check above only proves they may read THIS message, not every
 * object in the bucket. The index can only ever reach a file the message
 * already carries.
 *
 * ── It DOWNLOADS unless asked not to ────────────────────────────────────────
 *
 * The default is Content-Disposition: attachment, so a PDF, a spreadsheet or a
 * text file lands in the downloads folder rather than being rendered in a tab.
 * Two reasons, and the second is the one that matters: a document opened in a
 * tab is a file somebody has to find again afterwards, and a document the
 * browser renders on OUR origin is a wider surface than one written to disk —
 * these come from the other party to a conversation, not from us.
 *
 * `?preview=1` returns the inline URL instead, and the thread uses it for the
 * one case that genuinely needs it: an `<img>` showing a picture in the bubble.
 * A preview cannot be a download. Both modes go through this same route, which
 * is what keeps the permission check in one place rather than two.
 */
const TTL_SECONDS = 60 * 60;

export async function GET(request, { params }) {
  const { id } = await params;

  const viewer = await getViewer();
  if (!viewer?.userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const db = getMarketplaceDb();

    const { data: row, error } = await db
      .from('messages')
      .select('vendor_id, attachments')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Membership is read from the SESSION. There is no `?vendor=` here to trust.
    const isStaff = viewer.role === 'staff' || viewer.role === 'admin';
    const isMember = (viewer.vendors ?? []).some((v) => v.id === row.vendor_id);

    if (!isStaff && !isMember) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const query = new URL(request.url).searchParams;

    const list = Array.isArray(row.attachments) ? row.attachments : [];
    const index = Number(query.get('i') ?? 0);
    const file = Number.isInteger(index) && index >= 0 ? list[index] : null;

    if (!file?.path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    /* Inline only when asked, and only for a picture. A `?preview=1` on a PDF
       would be a request to render somebody else's document on our origin,
       which is the thing the download default exists to avoid — so the mime
       type decides, not the caller. */
    const isImage = String(file.mime ?? '').startsWith('image/');
    const preview = query.get('preview') === '1' && isImage;

    const signed = await signAttachment(file.path, TTL_SECONDS, {
      /* The name the sender's own computer had, so what lands in the downloads
         folder is `bank-letter.pdf` rather than a random key. Falsy skips the
         option entirely, which is the inline URL. */
      download: preview ? null : (file.name || true),
    });
    if (!signed) return NextResponse.json({ error: 'Could not sign' }, { status: 500 });

    // A signed URL is a credential — never let a CDN or the browser keep it.
    return NextResponse.redirect(signed, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
