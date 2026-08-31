/**
 * (admin) — Platform staff only. Never indexed.
 *
 * TODO(launch): add the group chrome here (AdminSidebar).
 * TODO(launch): enforce the role guard server-side — this layout is UI, not security.
 */
export const metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }) {
  return children;
}
