import { NextResponse } from 'next/server';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { vendorForAction } from '@/marketplace/auth/session';

/**
 * Redirects to a short-lived signed URL for one backup.
 *
 * Backups live in a PRIVATE bucket, so there is no permanent link to put in an
 * <a href>. Minting the signature here, at click time, keeps the download a
 * plain link while making the URL useless an hour later — which is the point
 * of the private bucket: a full vendor export contains buyer names, contact
 * details and order history.
 *
 * ── The ownership check the TODO here asked for ────────────────────────────
 *
 * It read: "knowing a backup UUID is enough to download it. Do not ship this
 * route to production before then." Sign-in has since landed and the check had
 * not followed it, so the note was still describing the running code.
 *
 * The row is now fetched WITH the caller's vendor id, which means a backup that
 * is not yours reads exactly like one that does not exist. That matters more
 * here than anywhere else in the API: the file behind this link is a complete
 * export of a showroom — every buyer's name, phone number and enquiry.
 */
const TTL_SECONDS = 60 * 60;
const BACKUP_BUCKET = 'marketplace-backups';

export async function GET(_request, { params }) {
  const { id } = await params;

  // Resolved from the session, never from the URL. There is no `?vendor=` here
  // to trust in the first place — the caller gets their own showroom or nothing.
  const { vendorId, error: denied } = await vendorForAction();
  if (denied || !vendorId) {
    return NextResponse.json(
      { error: denied === 'NOT_SIGNED_IN' ? 'Sign in required' : 'Not found' },
      { status: denied === 'NOT_SIGNED_IN' ? 401 : 404 },
    );
  }

  try {
    const db = getMarketplaceDb();

    const { data: row, error } = await db
      .from('vendor_backups')
      .select('storage_path')
      .eq('id', id)
      .eq('vendor_id', vendorId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: signed, error: signError } = await db.storage
      .from(BACKUP_BUCKET)
      .createSignedUrl(row.storage_path, TTL_SECONDS, {
        download: row.storage_path.split('/').pop(),
      });

    if (signError || !signed?.signedUrl) {
      return NextResponse.json({ error: signError?.message ?? 'Could not sign' }, { status: 500 });
    }

    // A signed URL is a credential — never let a CDN or the browser keep it.
    return NextResponse.redirect(signed.signedUrl, {
      headers: { 'Cache-Control': 'no-store, private' },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
