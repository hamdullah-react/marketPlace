"use client";

/**
 * The charges in one ledger — promotions, or subscriptions, or the odd one an
 * admin entered by hand — as a table.
 *
 * ── Why this stopped being cards ────────────────────────────────────────────
 *
 * "Who owes us, and how much" is two columns read down the list, and a
 * three-across grid has no columns: twenty charges put the amount at seven
 * different heights, so comparing any two meant reading both cards in full. The
 * cards also carried a row of action buttons each, which is four buttons times
 * twenty on a screen where an admin presses one.
 *
 * ── The state filter moved from the URL into the table ──────────────────────
 *
 * It was `?state=due` with a link per tab, which meant a round trip and a fresh
 * render to answer a question about rows already on the page. The SECTION stays
 * in the URL — promotions and subscriptions are different businesses and a
 * shared link should open the right one — but due / overdue / paid / cancelled
 * is a lens over one list, so it is a button that costs nothing.
 *
 * ── The list is whole, and that is a bounded claim ──────────────────────────
 *
 * The page now reads every charge in the section rather than a page of twenty,
 * because the table filters, searches and pages in the browser. That is right
 * while a platform's charges number in the hundreds and would be wrong in the
 * tens of thousands — at which point the filtering belongs back in PostgREST and
 * this component is where to start. See the same note on DataTable.
 */

import Link from "next/link";
import { Clock, Store, Wallet } from "lucide-react";
import DataTable from "@/marketplace/ui/DataTable";
import ChargeRowActions from "./ChargeRowActions";
import {
  isOverdue, isPresented, overdueLabel, stateLabel, stateTone, methodLabel,
} from "@/marketplace/lib/billing";
import { formatPrice, localized } from "@/marketplace/lib/listing";

export default function ChargesTable({
  locale = "ar",
  items = [],
  accounts = [],
  currency = null,
  /* The ids of charges a showroom has sent a receipt for and nobody has
     answered. An array rather than a Set: a Set does not survive the
     server-to-client boundary, and rebuilding it here costs one pass. */
  awaitingReview = [],
  /* The platform's rule: does a request reach an admin before the receipt does?
     Read from site_settings.billing, one switch for promotions and
     subscriptions alike — see isPresented(). */
  requireProof = false,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const money = (n) => formatPrice(n, locale, currency);

  /* ── Which rows are waiting on the PLATFORM ────────────────────
     A showroom has transferred the money and sent the screenshot, and is very
     possibly locked out while it sits here. That is the one number on this
     screen with a person at the other end of it, so it is amber and on the tab
     rather than a row an admin has to find.

     It clears itself: accepting or rejecting the receipt takes the charge out
     of the set on the next read. */
  const awaiting = new Set(awaitingReview);
  const needsReview = (c) => awaiting.has(c.id);

  /* ── Raised, but not yet PRESENTED ────────────────────────────
     With the receipt rule on, a showroom's request exists as a charge — it has
     to, because it carries the reference they must quote on the transfer — but
     it is not yet the admin's to deal with. Those rows keep a tab of their own
     rather than disappearing: "you do not have to act on this yet" and "you
     cannot find it" are different things, and a showroom ringing to ask what
     happened to its request must not be met with a screen saying there is no
     such request. */
  const awaitingReceipt = (c) => !isPresented(c, awaiting.has(c.id), requireProof);

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA-u-ca-gregory" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Riyadh",
        })
      : "—";

  const detail = (c) => `/${locale}/marketplace/admin/finance/${c.id}`;
  const shop = (c) => (c.vendors ? localized(c.vendors.name, locale) : null);

  const columns = [
    {
      key: "ref",
      header: t("المرجع", "Reference"),
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
            {c.ref}
          </p>
          <p className="truncate text-sm">{localized(c.description, locale)}</p>
        </div>
      ),
    },
    {
      key: "vendor",
      header: t("المعرض", "Showroom"),
      /* Its own link, to the public storefront — a different destination from
         the charge's page. Safe because only the FIRST column carries the row's
         link; see DataTable, which used to wrap every cell and produced exactly
         the invalid nesting this comment was worrying about. */
      cell: (c) =>
        c.vendors ? (
          <Link
            href={`/${locale}/marketplace/vendors/${c.vendors.slug}`}
            className="flex items-center gap-1.5 text-sm font-medium text-brand-primary hover:underline"
          >
            <Store className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{shop(c)}</span>
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("معرض محذوف", "Deleted showroom")}
          </span>
        ),
    },
    {
      key: "amount",
      header: t("المبلغ", "Amount"),
      headClassName: "text-end",
      className: "text-end",
      cell: (c) => (
        <span className="font-bold tabular-nums text-brand-primary">{money(c.amount)}</span>
      ),
    },
    {
      key: "state",
      header: t("الحالة", "Status"),
      cell: (c) => {
        const late = isOverdue(c);

        return (
          <div className="flex flex-col items-start gap-1">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateTone(c.state)}`}
            >
              {stateLabel(c.state, locale)}
            </span>

            {late ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                {overdueLabel(c, locale)}
              </span>
            ) : null}

            {/* What pressing Record payment on this row will ALSO do. An admin
                confirming money should know it reopens a dashboard. */}
            {c.kind === "subscription" && c.access_days ? (
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {t(`يمنح ${c.access_days} يوم`, `grants ${c.access_days} days`)}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "receipt",
      header: t("الإيصال", "Receipt"),
      className: "text-xs",
      /* Said on the row as well as counted on the tab. The tab says how many;
         this says which, which is what an admin needs once they have pressed
         it. */
      cell: (c) =>
        needsReview(c) ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Clock className="h-3 w-3 shrink-0" />
            {t("بانتظار مراجعتك", "Waiting for you")}
          </span>
        ) : awaitingReceipt(c) ? (
          /* Grey, not amber. This one is waiting on the SHOWROOM, and colouring
             it like the queue would put it back in the pile this setting exists
             to keep it out of. */
          <span className="text-muted-foreground">
            {t("بانتظار إيصال المعرض", "Awaiting the showroom’s receipt")}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: "dates",
      header: t("التواريخ", "Dates"),
      className: "text-xs tabular-nums text-muted-foreground",
      cell: (c) => (
        <div>
          <p>
            {t("صدر: ", "Issued: ")}
            {when(c.issued_at)}
          </p>
          {c.state === "due" && c.due_at ? (
            <p>
              {t("الاستحقاق: ", "Due: ")}
              {when(c.due_at)}
            </p>
          ) : null}
          {c.state === "paid" ? (
            <p>
              {t("دُفع: ", "Paid: ")}
              {when(c.paid_at)}
              {c.payment_method ? ` · ${methodLabel(c.payment_method, locale)}` : ""}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "actions",
      header: t("إجراءات", "Actions"),
      headClassName: "w-16 text-end",
      className: "text-end",
      /* Its own column, not DataTable's `actions`: this component owns three
         dialogs and has to render them itself. */
      cell: (c) => (
        <ChargeRowActions
          locale={locale}
          charge={c}
          accounts={accounts}
          vendorName={shop(c) ?? ""}
          carName={c.listings ? localized(c.listings.name, locale) : ""}
          amountLabel={money(c.amount)}
          descriptionLabel={localized(c.description, locale)}
          dueLabel={when(c.due_at)}
          variant="menu"
          detailHref={detail(c)}
        />
      ),
    },
  ];

  /* The four lenses the old URL tabs were. `overdue` is computed the JS way
     (isOverdue) rather than the PostgREST way the query used — they mean the
     same thing, and this is the one that can run over rows already in hand. */
  const filters = [
    { key: "due", label: { ar: "مستحقة", en: "Due" }, test: (c) => c.state === "due", alert: needsReview },
    /* Only offered when the rule is on. Without it every due charge is
       presented, so the tab would hold nothing and mean nothing. */
    ...(requireProof
      ? [{
          key: "awaiting",
          label: { ar: "بانتظار الإيصال", en: "Awaiting receipt" },
          test: awaitingReceipt,
        }]
      : []),
    { key: "overdue", label: { ar: "متأخرة", en: "Overdue" }, test: (c) => isOverdue(c) },
    { key: "paid", label: { ar: "مدفوعة", en: "Paid" }, test: (c) => c.state === "paid" },
    { key: "void", label: { ar: "ملغاة", en: "Cancelled" }, test: (c) => c.state === "void" },
  ];

  return (
    <DataTable
      locale={locale}
      items={items}
      columns={columns}
      getKey={(c) => c.id}
      rowHref={detail}
      filters={filters}
      alert={needsReview}
      /* The reference, the showroom in both languages, the description and the
         payment reference — the four things somebody arrives holding. */
      search={(c) => [
        c.ref,
        c.vendors?.name,
        c.vendors?.slug,
        c.description,
        c.payment_ref,
        c.paid_into,
        c.listings?.name,
      ]}
      searchPlaceholder={t("ابحث بالمرجع أو المعرض…", "Search reference or showroom…")}
      minWidth="1000px"
      empty={{
        icon: <Wallet className="h-9 w-9" />,
        title: t("لا مستحقات في هذا السجل", "Nothing in this ledger"),
        body: t(
          "يُصدر مستحق عند الموافقة على طلب تمييز، أو عند طلب معرض للتجديد.",
          "A charge is raised when a promotion is approved, or when a showroom asks to renew."
        ),
      }}
    />
  );
}
