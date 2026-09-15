"use client";

/**
 * Publish / unpublish / boost / delete for one listing row.
 *
 * One instance per row rather than one shared menu, so an action can never fire
 * against the wrong listing: the id is baked into this component's own hidden
 * inputs instead of being read from whichever row was hovered last.
 *
 * A state change fires straight from the menu; deleting goes through a confirm
 * dialog first. That asymmetry is deliberate — unpublishing is one click to
 * reverse, deleting is not reversible at all.
 *
 * "Boost this car" opens the Promotions page with this car preselected. The
 * plans and prices live there and come from the admin — none are hardcoded
 * here.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  MoreHorizontal, Eye, Pencil, Send, Undo2, Trash2, Loader2, AlertTriangle,
  Sparkles, XCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useActionResult } from "./useActionResult";
import { setListingState, deleteListing } from "../_actions/listing-crud";
import { cancelBoostRequest } from "../_actions/boosts";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

export default function ListingRowActions({
  locale = "ar", listing, vendorId, publicPath, boost = null, boostsReady = false,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [confirmDelete, setConfirmDelete] = useState(false);

  const move = useActionResult(setListingState, INITIAL, {
    onSuccess: () => router.refresh(),
  });
  const remove = useActionResult(deleteListing, INITIAL, {
    onSuccess: () => { setConfirmDelete(false); router.refresh(); },
  });
  const cancelBoost = useActionResult(cancelBoostRequest, INITIAL, {
    onSuccess: () => router.refresh(),
  });

  const msg = (r) => (r?.error ? errorText(r.error, locale, r.params) : null);

  const isLive = listing.state === "live";
  const busy = move.pending || remove.pending || cancelBoost.pending;

  const activeUntil = boost?.activeUntil
    ? new Date(boost.activeUntil).toLocaleDateString(isAr ? "ar-SA" : "en-GB", { day: "numeric", month: "short" })
    : null;

  const boostHref = (() => {
    const q = new URLSearchParams({ listing: listing.id });
    if (vendorId) q.set("vendor", vendorId);
    return `/${locale}/marketplace/seller/promotions?${q.toString()}`;
  })();

  /**
   * The action is CALLED, not submitted through a form: ListingsTable wraps the
   * rows in its own <form>, and a form inside a form is invalid HTML (see the
   * Next docs, 07-mutating-data, "Showing a pending state").
   */
  const moveTo = (next) => {
    move.dismiss();

    const body = new FormData();
    body.set("listingId", listing.id);
    body.set("vendorId", vendorId ?? "");
    body.set("state", next);

    startTransition(() => move.formAction(body));
  };

  const withdrawBoost = () => {
    cancelBoost.dismiss();

    const body = new FormData();
    body.set("boostId", boost?.pendingId ?? "");
    body.set("vendorId", vendorId ?? "");

    startTransition(() => cancelBoost.formAction(body));
  };

  const rowError = msg(move.result) || msg(cancelBoost.result);

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {rowError ? <span className="me-2 text-xs text-red-600">{rowError}</span> : null}

        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" /> : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button" variant="ghost" size="sm"
              aria-label={t("إجراءات", "Actions")}
              disabled={busy}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"}>
            {isLive && publicPath ? (
              <DropdownMenuItem asChild>
                <Link href={publicPath} className="gap-2">
                  <Eye className="h-4 w-4" />
                  {t("عرض", "View")}
                </Link>
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuItem asChild>
              <Link
                href={`/${locale}/marketplace/seller/listings/${listing.id}`}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                {t("تعديل", "Edit")}
              </Link>
            </DropdownMenuItem>

            {/* ── Boost — live cars only, once the BOOSTS schema exists ── */}
            {isLive && boostsReady ? (
              activeUntil ? (
                <DropdownMenuItem disabled className="gap-2">
                  <Sparkles className="h-4 w-4 text-brand-gold" />
                  {t(`مميز حتى ${activeUntil}`, `Featured until ${activeUntil}`)}
                </DropdownMenuItem>
              ) : boost?.pendingId ? (
                <DropdownMenuItem className="gap-2" onSelect={withdrawBoost}>
                  <XCircle className="h-4 w-4" />
                  {t("إلغاء طلب التمييز", "Cancel boost request")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem asChild>
                  <Link href={boostHref} className="gap-2">
                    <Sparkles className="h-4 w-4 text-brand-gold" />
                    {t("ميّز هذه السيارة", "Boost this car")}
                  </Link>
                </DropdownMenuItem>
              )
            ) : null}

            <DropdownMenuSeparator />

            {/* Publish and unpublish are the same control in two directions.
                Showing both at once would offer a seller the state they are
                already in. */}
            {isLive ? (
              <DropdownMenuItem className="gap-2" onSelect={() => moveTo("draft")}>
                <Undo2 className="h-4 w-4" />
                {t("إلغاء النشر", "Unpublish")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="gap-2" onSelect={() => moveTo("live")}>
                <Send className="h-4 w-4" />
                {t("نشر", "Publish")}
              </DropdownMenuItem>
            )}

            {listing.state === "draft" || listing.state === "rejected" ? (
              <DropdownMenuItem className="gap-2" onSelect={() => moveTo("pending_review")}>
                <Send className="h-4 w-4" />
                {t("إرسال للمراجعة", "Submit for review")}
              </DropdownMenuItem>
            ) : null}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={(e) => { e.preventDefault(); remove.dismiss(); setConfirmDelete(true); }}
              className="gap-2 text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              {t("حذف", "Delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Delete confirmation ──────────────────────────────────────────── */}
      <Dialog open={confirmDelete} onOpenChange={(o) => { if (!o) setConfirmDelete(false); }}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {t("حذف الإعلان", "Delete listing")}
            </DialogTitle>
            <DialogDescription>
              {t(
                `سيُحذف "${listing.title}" نهائياً، ومعه استفساراته ومواصفاته وألوانه. الصور تبقى في مكتبتك.`,
                `“${listing.title}” goes for good, along with its enquiries, specs and colour variants. Your photos stay in the library.`
              )}
            </DialogDescription>
          </DialogHeader>

          {msg(remove.result) ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {msg(remove.result)}
            </p>
          ) : null}

          <form action={remove.formAction} className="flex justify-end gap-3 border-t pt-4">
            <input type="hidden" name="listingId" value={listing.id} />
            <input type="hidden" name="vendorId" value={vendorId ?? ""} />

            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              {t("إلغاء", "Cancel")}
            </Button>
            <Button type="submit" variant="destructive" disabled={remove.pending} className="gap-2">
              {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("حذف", "Delete")}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
