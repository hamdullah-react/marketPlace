"use client";

/**
 * Who is still inside, who runs out when — as a table.
 *
 * ── Why this stopped being cards ────────────────────────────────────────────
 *
 * A card grid is right when each item is a thing you look AT and wrong when it
 * is a row you scan ACROSS. This screen's only question is "who needs chasing",
 * which is answered by reading one column — the date — down forty showrooms.
 * In a three-across grid that column does not exist: the dates are scattered at
 * nine different heights and the eye has to find each one before it can compare
 * any two. Forty showrooms was also four screens of scrolling for six facts
 * each.
 *
 * The chrome — search, filters with counts, the pager, the actions menu — is
 * DataTable's, so this file is only the columns. See that component for why.
 *
 * ── The columns define themselves here, and that is why this is a client ────
 *
 * `cell` is a function and a function cannot cross the server-to-client
 * boundary, so the page hands its rows to this wrapper and the wrapper hands
 * them to the table. Nothing here fetches anything.
 */

import { Store } from "lucide-react";
import DataTable from "@/marketplace/ui/DataTable";
import VendorAccessActions from "./VendorAccessActions";
import { accessLabel, accessTone } from "@/marketplace/lib/access";
import { localized } from "@/marketplace/lib/listing";

export default function SubscriptionsTable({
  locale = "ar",
  items = [],
  plans = [],
  /* The ids of showrooms with an open renewal request — they have asked, and
     nobody has recorded the payment. An array rather than a Set, because a Set
     does not survive the server-to-client boundary. */
  awaitingRenewal = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const name = (v) => localized(v.name, locale) || v.slug;

  /* ── Which showrooms are waiting on the PLATFORM ────────────────
     Either they have asked to renew and nobody has recorded it, or they are
     already locked out. Both are somebody sitting on the wrong side of a door,
     which is what the amber number on the tab means everywhere else in this
     dashboard.

     It clears itself: recording the payment closes the renewal and reopens the
     access, so the showroom stops matching on the next read. */
  const waiting = new Set(awaitingRenewal);
  const needsAttention = (v) => waiting.has(v.id) || !v.access.allowed;

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA-u-ca-gregory" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Riyadh",
        })
      : "—";

  const detail = (v) => `/${locale}/marketplace/admin/subscriptions/${v.id}`;

  const columns = [
    {
      key: "showroom",
      header: t("المعرض", "Showroom"),
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-brand-primary">{name(v)}</p>
          {v.city ? (
            <p className="truncate text-xs text-muted-foreground">{v.city}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "state",
      header: t("الحالة", "Status"),
      cell: (v) => (
        <div className="min-w-0">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${accessTone(
              v.access.state
            )}`}
          >
            {accessLabel(v.access.state, locale)}
          </span>

          {/* Asked, and still waiting. The tab counts these; the row says which,
              which is what an admin needs once they have pressed it. */}
          {waiting.has(v.id) ? (
            <p className="mt-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              {t("طلب تجديد بانتظار الدفع", "Renewal requested — awaiting payment")}
            </p>
          ) : null}

          {/* The reason, right under the badge that needs it. A blocked
              showroom with no sentence is the support call this exists to
              prevent, and the table is where an admin looks first. */}
          {v.access.state === "blocked" && v.access.reason ? (
            <p className="mt-1 line-clamp-2 max-w-[18rem] text-[11px] text-red-700 dark:text-red-400">
              {v.access.reason}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "until",
      header: t("ينتهي", "Ends"),
      className: "text-xs tabular-nums",
      cell: (v) => (
        <div>
          <p>{when(v.access_until)}</p>
          {v.access.daysLeft != null && v.access.allowed ? (
            <p
              className={
                v.access.state === "ending"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground"
              }
            >
              {t(`بقي ${v.access.daysLeft} يوم`, `${v.access.daysLeft} days left`)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "kind",
      header: t("النوع", "Type"),
      className: "text-xs",
      /* Inferred from whether a subscription charge was ever raised, not from
         the date — see listVendorAccess for why that is the honest source. */
      cell: (v) => (
        <span className="text-muted-foreground">
          {v.paidBefore ? t("مشترك", "Paying") : t("فترة مجانية", "On trial")}
        </span>
      ),
    },
    {
      key: "phone",
      header: t("الجوال", "Phone"),
      className: "text-xs",
      /* A tel: link, and it stays one. A phone number is for ringing, and
         hijacking the tap to navigate would be the wrong answer to the only
         reason an admin reads this column. */
      cell: (v) =>
        v.contact_phone ? (
          <a
            href={`tel:${v.contact_phone}`}
            dir="ltr"
            className="tabular-nums text-muted-foreground hover:text-brand-primary"
          >
            {v.contact_phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "actions",
      header: t("إجراءات", "Actions"),
      headClassName: "w-16 text-end",
      className: "text-end",
      /* Its own column rather than DataTable's `actions`, because this component
         owns four dialogs and has to render them itself. DataTable's menu is for
         the simple case — links and one-press actions. */
      cell: (v) => (
        <VendorAccessActions
          locale={locale}
          vendorId={v.id}
          vendorName={name(v)}
          blocked={v.access.state === "blocked"}
          accessUntil={v.access.until}
          plans={plans}
          variant="menu"
          detailHref={detail(v)}
        />
      ),
    },
  ];

  /* Ordered by urgency, not alphabetically: the tabs are the working queue and
     "who is already out" is the top of it. `all` is prepended by DataTable. */
  const filters = [
    {
      key: "waiting",
      label: { ar: "بانتظار إجراء", en: "Needs you" },
      test: needsAttention,
      alert: needsAttention,
    },
    { key: "out", label: { ar: "خارج اللوحة", en: "Locked out" }, test: (v) => !v.access.allowed },
    { key: "ending", label: { ar: "ينتهي قريباً", en: "Ending soon" }, test: (v) => v.access.state === "ending" },
    { key: "active", label: { ar: "مفعّل", en: "Active" }, test: (v) => v.access.state === "active" },
    { key: "paying", label: { ar: "مشترك", en: "Paying" }, test: (v) => v.paidBefore },
  ];

  return (
    <DataTable
      locale={locale}
      items={items}
      columns={columns}
      getKey={(v) => v.id}
      rowHref={detail}
      filters={filters}
      alert={needsAttention}
      search={(v) => [name(v), v.slug, v.city, v.contact_phone, v.contact_email]}
      searchPlaceholder={t("ابحث باسم المعرض أو المدينة أو الجوال", "Search name, city or phone")}
      minWidth="920px"
      empty={{
        icon: <Store className="h-9 w-9" />,
        title: t("لا توجد معارض معتمدة", "No approved showrooms"),
        body: t(
          "يظهر المعرض هنا بعد اعتماد طلبه.",
          "A showroom appears here once its application is approved."
        ),
      }}
    />
  );
}
