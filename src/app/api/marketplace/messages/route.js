import { NextResponse } from 'next/server';
import { getViewer } from '@/marketplace/auth/session';
import { listMessages, unreadCounts } from '@/marketplace/db/queries/messages';

/**
 * One showroom's thread, for the drawer.
 *
 * ── Why a route and not a server action ─────────────────────────────────────
 *
 * Everything that CHANGES a conversation is an action, because an action is a
 * write with a session behind it. This only reads, and it is read the way a
 * chat window reads: on open, on every search keystroke, and again the moment
 * the socket says something arrived. An action per keystroke would mean a
 * server round trip that re-renders the route it was called from; a GET is the
 * shape the browser already knows how to cache, abort and retry.
 *
 * ── The vendor is checked against the SESSION, every time ───────────────────
 *
 * `?vendor=` names the thread, and naming it is not the same as being allowed
 * to read it. Staff may read any; anybody else may read only a showroom they
 * belong to. Without that this is an endpoint that hands one showroom's
 * correspondence to another on request.
 */
/* No `export const dynamic`. cacheComponents rejects the route-segment config
   outright, and it would say nothing that is not already true: this handler
   reads the session out of the request's cookies, which is what makes a route
   dynamic in the first place. */

export async function GET(request) {
  const viewer = await getViewer();
  if (!viewer?.userId) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const wanted = url.searchParams.get('vendor');
  const search = url.searchParams.get('q') ?? '';

  const isStaff = viewer.role === 'staff' || viewer.role === 'admin';
  const memberships = viewer.vendors ?? [];

  /* A seller with no `?vendor=` means their own, which is the common case and
     the one where asking them to name it would be asking them to know an id. */
  const vendorId = wanted || (isStaff ? null : memberships[0]?.id ?? null);
  if (!vendorId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const allowed = isStaff || memberships.some((v) => v.id === vendorId);
  // Somebody else's thread reads exactly like one that does not exist.
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const side = isStaff ? 'admin' : 'vendor';

  const [thread, unread] = await Promise.all([
    listMessages(vendorId, { search, limit: 200 }),
    unreadCounts(side, vendorId),
  ]);

  return NextResponse.json(
    {
      ready: thread.ready,
      side,
      vendorId,
      items: thread.items,
      unread: unread.total,
    },
    // A conversation is the last thing that should ever be served from a cache.
    { headers: { 'Cache-Control': 'no-store, private' } }
  );
}
