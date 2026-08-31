'use server';

/**
 * A broadcast the seller can fire at themselves.
 *
 * The live-lead path has too many links to debug one at a time — a policy, a
 * token, a WebSocket upgrade, a browser extension, an office proxy. This sends
 * a real message down the real channel on demand, so the diagnostics page can
 * say WHICH link is broken instead of "nothing arrived".
 */

import { requireVendor } from '@/marketplace/auth/session';
import { notifyVendorLeads } from '@/marketplace/lib/realtime';

export async function pingMyDashboard() {
  // Scoped to the caller's own showroom, from the SESSION — never from the
  // form. Otherwise this is a way to rattle a competitor's dashboard.
  const { vendorId } = await requireVendor();

  notifyVendorLeads(vendorId, 'lead_new', { probe: true });
  return { ok: true, vendorId, at: new Date().toISOString() };
}
