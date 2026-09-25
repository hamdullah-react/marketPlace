import { NextResponse } from 'next/server';
import { getMarketplaceDb } from '@/marketplace/db/client';

/**
 * The browser rotated a push subscription; move the registration onto the new
 * address.
 *
 * ── Why this is a route and not a server action ─────────────────────────────
 *
 * It is called from the service worker's `pushsubscriptionchange` handler
 * (public/sw.js), which is not a React tree and cannot invoke an action.
 *
 * ── Why it does not check a session ─────────────────────────────────────────
 *
 * Because there may not be one. The event fires with the app closed, hours
 * after anybody signed in, and if this demanded a session the device would
 * simply go silent for ever — which is the exact failure it exists to prevent.
 *
 * What stands in for a session is the OLD ENDPOINT. A push endpoint is an
 * unguessable URL issued by Google, Apple or Mozilla to one browser, and it is
 * already the bearer credential the sender uses to reach that device. Anyone
 * holding it can be pushed to; being able to present it is therefore proof of
 * being that device.
 *
 * So the rule is narrow and safe: this NEVER creates a registration, and never
 * changes who one belongs to. It copies the audience and owner from a row that
 * already exists onto the new endpoint, and deletes the old one. Present an
 * endpoint nobody registered and nothing happens.
 */
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const oldEndpoint = typeof body?.oldEndpoint === 'string' ? body.oldEndpoint : null;
  const sub = body?.subscription ?? null;

  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;

  if (!oldEndpoint || !endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const db = getMarketplaceDb();

  const { data: existing, error } = await db
    .from('push_subscriptions')
    .select('audience, vendor_id, user_id, user_agent')
    .eq('endpoint', oldEndpoint)
    .maybeSingle();

  /* No such registration. Answer 204 rather than 404: the worker cannot do
     anything useful with the difference, and saying "that endpoint is unknown"
     to an unauthenticated caller is a lookup oracle for free. */
  if (error || !existing) return new NextResponse(null, { status: 204 });

  const { error: moved } = await db.from('push_subscriptions').upsert(
    {
      endpoint,
      p256dh,
      auth,
      audience: existing.audience,
      vendor_id: existing.vendor_id,
      user_id: existing.user_id,
      user_agent: existing.user_agent,
    },
    { onConflict: 'endpoint' }
  );

  if (moved) return NextResponse.json({ ok: false }, { status: 500 });

  // Only once the new one is safely in: a crash between the two should leave
  // the device reachable at the old address, not at neither.
  await db.from('push_subscriptions').delete().eq('endpoint', oldEndpoint);

  return NextResponse.json({ ok: true });
}
