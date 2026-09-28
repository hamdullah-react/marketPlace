import { NextResponse } from 'next/server';
import { getMarketplaceDb } from '@/marketplace/db/client';
import { getViewer } from '@/marketplace/auth/session';
import { PROOF_BUCKET } from '@/marketplace/db/queries/proofs';

/**
 * Redirects to a short-lived signed URL for one payment receipt.
 *
 * Receipts live in a PRIVATE bucket (PAYMENT PROOFS in schema.sql), because a
 * transfer screenshot carries an account number and a holder's name. There is
 * therefore no permanent address to put in an <img src>, and this mints one at
 * click time instead — the same shape as the backups download route.
 *
 * ── Who may see it ──────────────────────────────────────────────────────────
 *
 * Staff, because reviewing it is their job. Or a member of the showroom that
 * SENT it, so a seller can check what they actually attached before an admin
 * answers. Anyone else gets a 404 — a receipt that is not yours reads exactly
 * like one that does not exist, which is the rule the backups route settled on
 * and for stronger reasons here: this is somebody's banking.
 */
const TTL_SECONDS = 60 * 60;

export async function GET(_request, { params }) {
  const { id } = await params;

  const viewer = await getViewer();
  if (!viewer?.userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  try {
    const db = getMarketplaceDb();

    const { data: row, error } = await db
      .from('charge_payment_proofs')
      .select('storage_path, vendor_id')
      .eq('id', id)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!row?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    /* The membership is read from the SESSION, never from the URL. There is no
       `?vendor=` here to trust in the first place. */
    const isStaff = viewer.role === 'staff' || viewer.role === 'admin';
    const isMember = (viewer.vendors ?? []).some((v) => v.id === row.vendor_id);

    if (!isStaff && !isMember) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const { data: signed, error: signError } = await db.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(row.storage_path, TTL_SECONDS);

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
