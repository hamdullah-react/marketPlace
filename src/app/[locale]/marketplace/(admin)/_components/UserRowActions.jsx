"use client";

/**
 * Per-user admin actions: make admin / remove admin, delete the account.
 *
 * Deleting asks for the account's email to be typed, and the server checks it
 * again — the confirmation is not only a dialog someone can click through.
 */

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MoreHorizontal, ShieldCheck, ShieldOff, Trash2, Loader2, AlertTriangle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionResult } from "../../(seller)/_components/useActionResult";
import { setUserRole, deleteUserAccount } from "../admin/_actions/users";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

export default function UserRowActions({ locale = "ar", user, isSelf = false }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const role = useActionResult(setUserRole, INITIAL, { onSuccess: () => router.refresh() });
  const remove = useActionResult(deleteUserAccount, INITIAL, {
    autoClearMs: 0,
    onSuccess: () => { setConfirmOpen(false); router.refresh(); },
  });

  const msg = (r) => (r?.error ? errorText(r.error, locale, r.params) : null);
  const isAdmin = user.role === "admin";
  const busy = role.pending || remove.pending;

  const changeRole = (next) => {
    role.dismiss();
    const body = new FormData();
    body.set("userId", user.id);
    body.set("role", next);
    startTransition(() => role.formAction(body));
  };

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {msg(role.result) ? <span className="me-2 text-xs text-red-600">{msg(role.result)}</span> : null}
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-primary" /> : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={t("إجراءات", "Actions")} disabled={busy}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align={isAr ? "start" : "end"} dir={isAr ? "rtl" : "ltr"}>
            {isAdmin ? (
              <DropdownMenuItem className="gap-2" disabled={isSelf} onSelect={() => changeRole("buyer")}>
                <ShieldOff className="h-4 w-4" />
                {t("إزالة صلاحية المسؤول", "Remove admin")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="gap-2" onSelect={() => changeRole("admin")}>
                <ShieldCheck className="h-4 w-4" />
                {t("اجعله مسؤولاً", "Make admin")}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              disabled={isSelf}
              onSelect={(e) => { e.preventDefault(); remove.dismiss(); setConfirmOpen(true); }}
              className="gap-2 text-red-600 focus:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
              {t("حذف الحساب", "Delete account")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <AlertTriangle className="h-4 w-4" />
              {t("حذف الحساب نهائياً", "Delete account permanently")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "سيُحذف تسجيل الدخول والملف الشخصي والسيارات المحفوظة والعناوين. الطلبات والتقييمات تبقى في سجلات المعارض. لا يمكن التراجع.",
                "Their sign-in, profile, saved cars and addresses are deleted. Orders and reviews stay in the showrooms' records. This cannot be undone."
              )}
            </DialogDescription>
          </DialogHeader>

          {user.showrooms?.length ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              {t(
                `هذا الشخص عضو في ${user.showrooms.length} معرض. سيُزال من المعرض، والمعرض نفسه يبقى.`,
                `This person belongs to ${user.showrooms.length} showroom(s). They are removed from it; the showroom itself stays.`
              )}
            </p>
          ) : null}

          {msg(remove.result) ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {msg(remove.result)}
            </p>
          ) : null}

          <form action={remove.formAction} className="flex flex-col gap-4 border-t pt-4">
            <input type="hidden" name="userId" value={user.id} />
            <div className="grid gap-2">
              <Label htmlFor={`confirm-${user.id}`}>
                {t("اكتب البريد للتأكيد:", "Type the email to confirm:")}{" "}
                <span dir="ltr" className="font-semibold">{user.email}</span>
              </Label>
              <Input id={`confirm-${user.id}`} name="confirm" dir="ltr" autoComplete="off" required />
            </div>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
                {t("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={remove.pending} className="gap-2">
                {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("حذف", "Delete")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
