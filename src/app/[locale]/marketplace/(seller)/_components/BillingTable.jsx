"use client";

/**
 * What this showroom owes, as a table.
 *
 * ── Why this stopped being cards ────────────────────────────────────────────
 *
 * The page was three card grids stacked down one scroll, one per kind, and a
 * showroom with twenty charges had to scroll past a subscription panel and a set
 * of bank details to reach the promotion it came to look at. The question a
 * seller actually has — "what do I still owe, and did my receipt go through" —
 * is two columns, and a grid has no columns.
 *
 * The KIND stays a top-level choice, because a subscription and a promotion are
 * different debts with different consequences: falling behind on one closes the
 * dashboard and the other does not. But it is a filter over one table now rather
 * than three separate sections.
 *
 * ── The receipt's state is a COLUMN, not a paragraph under each card ────────
 *
 * It is the thing a showroom rereads most: they transferred the money yesterday
 * and want to know whether anybody has looked at it. In a column it is answered
 * by glancing down the list.
 */

import { AlertTriangle, Clock, Wallet } from "lucide-react";
import DataTable from "@/marketplace/ui/DataTable";
import PaymentProofDialog from "./PaymentProofDialog";
import {
  hasReceiptWithUs, isOverdue, overdueLabel, stateLabel, stateTone, methodLabel, kindLabel,
} from "@/marketplace/lib/billing";
import { formatPrice, localized } from "@/marketplace/lib/listing";

export default function BillingTable({
  locale = "ar",
  vendorId = null,
  items = [],
  /* chargeId → its latest receipt, whatever the state. Arrives as an array of
     pairs rather than a Map: a Map does not survive the server-to-client
     boundary, and rebuilding it here costs one pass. */
  proofPairs = [],
  currency = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const proofs = new Map(proofPairs);
  const money = (n) => formatPrice(n, locale, currency);

  /* ── Which rows are waiting on the SHOWROOM ─────────────────────
     Owed, and no receipt with us — or one that came back refused, which is the
     same position with a reason attached. Those are the rows where the next
     move is theirs, and the amber number on the tab is the only place that says
     so without reading the table.

     A receipt already under review is deliberately NOT counted: they have done
     their part and the wait is ours. Counting it would be asking somebody to
     act on something they cannot act on. */
  const needsReceipt = (c) => c.state === "due" && !hasReceiptWithUs(proofs.get(c.id));

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleDateString(isAr ? "ar-SA-u-ca-gregory" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Riyadh",
        })
      : "—";

  const detail = (c) => `/${locale}/marketplace/seller/billing/${c.id}`;

  const columns = [
    {
      key: "ref",
      header: t("المستحق", "Charge"),
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground" dir="ltr">
            {c.ref}
          </p>
          <p className="truncate text-sm">{localized(c.description, locale)}</p>
          {/* Which debt this is. A seller reading one merged list needs it on
              the row, not only on the filter they may not have pressed. */}
          <p className="text-[11px] text-muted-foreground">{kindLabel(c.kind, locale)}</p>
        </div>
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
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${stateTone(c.state)}`}>
              {stateLabel(c.state, locale)}
            </span>
            {late ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                <Clock className="h-3 w-3" />
                {overdueLabel(c, locale)}
              </span>
            ) : null}

            {/* A cancelled charge keeps its reason. A bill that simply vanishes
                leaves the showroom arguing with a screen that says nothing ever
                happened. */}
            {c.state === "void" && c.void_reason ? (
              <span className="line-clamp-2 max-w-[16rem] text-[11px] text-muted-foreground">
                {c.void_reason}
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
      cell: (c) => {
        const proof = proofs.get(c.id) ?? null;

        if (c.state === "paid") {
          return (
            <span className="text-green-700 dark:text-green-400">
              {t("مسجّلة", "Recorded")}
            </span>
          );
        }
        if (proof?.state === "submitted") {
          return (
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
              <Clock className="h-3 w-3 shrink-0" />
              {t("قيد المراجعة", "Under review")}
            </span>
          );
        }
        if (proof?.state === "rejected") {
          return (
            <span className="inline-flex items-start gap-1 text-red-700 dark:text-red-400">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span className="line-clamp-2 max-w-[14rem]">
                {t("لم يُقبل: ", "Not accepted: ")}
                {proof.review_note}
              </span>
            </span>
          );
        }
        if (c.state === "due") {
          return (
            <span className="text-muted-foreground">{t("لم يُرسل بعد", "Not sent yet")}</span>
          );
        }
        return <span className="text-muted-foreground">—</span>;
      },
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
      cell: (c) => (
        <PaymentProofDialog
          locale={locale}
          vendorId={vendorId}
          charge={c}
          proof={proofs.get(c.id) ?? null}
          variant="menu"
          detailHref={detail(c)}
        />
      ),
    },
  ];

  /* Subscription first, deliberately: it is the one that can close this
     dashboard, so it is the one a showroom should be able to isolate first.
     `other` is absent unless an admin has entered one, since most showrooms will
     never see it — a filter that can only ever return nothing is noise. */
  const filters = [
    { key: "due", label: { ar: "مستحقة", en: "Owed" }, test: (c) => c.state === "due", alert: needsReceipt },
    { key: "subscription", label: { ar: "الاشتراك", en: "Subscription" }, test: (c) => c.kind === "subscription" },
    { key: "boost", label: { ar: "الترويج", en: "Promotions" }, test: (c) => c.kind === "boost" },
    ...(items.some((c) => c.kind === "other")
      ? [{ key: "other", label: { ar: "أخرى", en: "Other" }, test: (c) => c.kind === "other" }]
      : []),
    { key: "paid", label: { ar: "مدفوعة", en: "Paid" }, test: (c) => c.state === "paid" },
  ];

  return (
    <DataTable
      locale={locale}
      items={items}
      columns={columns}
      getKey={(c) => c.id}
      rowHref={detail}
      filters={filters}
      alert={needsReceipt}
      search={(c) => [c.ref, c.description, c.payment_ref, c.listings?.name]}
      searchPlaceholder={t("ابحث بالرقم المرجعي…", "Search by reference…")}
      minWidth="980px"
      empty={{
        icon: <Wallet className="h-9 w-9" />,
        title: t("لا مستحقات عليك", "You owe nothing"),
        body: t(
          "يظهر هنا مستحق عند الموافقة على طلب تمييز لإحدى سياراتك، أو عند طلب تجديد الاشتراك.",
          "A charge appears here when a request to feature one of your cars is approved, or when you ask to renew your subscription."
        ),
      }}
    />
  );
}
