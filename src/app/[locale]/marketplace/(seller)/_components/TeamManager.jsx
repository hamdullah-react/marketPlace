"use client";

/**
 * The showroom's team.
 *
 * ── What the three roles buy is SHOWN, not just named ───────────────────────
 *
 * The role picker prints the blurb from lib/team.js beside each option, and
 * each member's row says what their role means. A dropdown offering
 * "Owner / Manager / Staff" with no explanation is a dropdown somebody picks
 * the first item from — and the first item is the one that hands over the bank
 * details. The words are the safeguard; the capability map is only the
 * enforcement.
 *
 * ── The link is always visible, not only in the email ──────────────────────
 *
 * Every pending invitation shows a Copy link button. Email delivery is the one
 * part of this flow nobody here controls: a misconfigured SMTP, a spam folder
 * or a typo'd address all look identical from the seller's side — an invitation
 * that was "sent" and never arrived. A link they can paste into WhatsApp is the
 * difference between a feature that works and one that works when the mail
 * does.
 *
 * ── Why each action has its own hook ───────────────────────────────────────
 *
 * Four useActionResult instances rather than one shared result. Revoking an
 * invitation and removing a member are different sentences, and a single
 * result object would print "removed" under the invitations table because the
 * last thing that happened happened somewhere else. See the note on the hook
 * itself about stale results in tables.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, UserPlus, CheckCircle2, AlertCircle, Copy, Check, X, Trash2,
  Shield, Mail, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import {
  ROLE_LABELS, ROLE_BLURBS, INVITE_STATUS_LABELS, inviteStatus, assignableRoles,
} from "@/marketplace/lib/team";
import {
  inviteTeamMember, revokeTeamInvite, deleteTeamInvite, changeMemberRole, removeTeamMember,
} from "../_actions/team";

const ROLE_TONE = {
  owner: "bg-brand-primary/10 text-brand-primary border-brand-primary/20",
  manager: "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300",
  staff: "bg-neutral-500/10 text-neutral-700 border-neutral-500/20 dark:text-neutral-300",
};

const STATUS_TONE = {
  pending: "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  accepted: "bg-green-500/10 text-green-700 border-green-500/20 dark:text-green-300",
  revoked: "bg-neutral-500/10 text-neutral-600 border-neutral-500/20",
  expired: "bg-neutral-500/10 text-neutral-600 border-neutral-500/20",
};

export default function TeamManager({
  locale = "ar",
  vendorId,
  myRole = "staff",
  myUserId = null,
  members = [],
  invites = [],
  invitesMissing = false,
  /**
   * The site's own origin, passed in from the server.
   *
   * NOT read from window.location here. This component renders on the server
   * first, where `window` does not exist, so building the link in the body
   * would put a relative URL in the HTML and an absolute one in the hydrated
   * tree — a hydration mismatch on a string somebody is about to copy and
   * paste into WhatsApp, which is the one place a half-correct link is useless.
   * It comes from SITE_URL, the same value the invitation email uses, so the
   * link on screen and the link in the message are the same link.
   */
  baseUrl = '',
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const grantable = assignableRoles(myRole);
  const [copied, setCopied] = useState(null);
  const [pendingRemove, setPendingRemove] = useState(null);

  const refresh = () => router.refresh();

  const invite = useActionResult(inviteTeamMember, { ok: false, error: null }, {
    autoClearMs: 20000, // The link is in this result. Do not whisk it away.
    onSuccess: refresh,
  });
  const revoke = useActionResult(revokeTeamInvite, { ok: false, error: null }, { onSuccess: refresh });
  const drop = useActionResult(deleteTeamInvite, { ok: false, error: null }, { onSuccess: refresh });
  const reRole = useActionResult(changeMemberRole, { ok: false, error: null }, { onSuccess: refresh });
  const remove = useActionResult(removeTeamMember, { ok: false, error: null }, {
    onSuccess: () => { setPendingRemove(null); refresh(); },
  });

  const copy = async (text, key) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    } catch {
      /* A denied clipboard is not worth an error dialog — the link is on screen
         and selectable. */
    }
  };

  const date = (value) =>
    value
      ? new Date(value).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
          day: "numeric", month: "short", year: "numeric",
        })
      : "—";

  const roleBadge = (role) => (
    <Badge variant="outline" className={`text-[11px] ${ROLE_TONE[role] ?? ROLE_TONE.staff}`}>
      {t(ROLE_LABELS[role]?.ar, ROLE_LABELS[role]?.en) ?? role}
    </Badge>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* ── Invite ─────────────────────────────────────────────────────── */}
      {grantable.length ? (
        <div className="raised-card rounded-xl p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
            <UserPlus className="h-4 w-4" />
            {t("دعوة شخص إلى الفريق", "Invite someone to the team")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "سنرسل له رابطاً. لا يحتاج حساباً مسبقاً — يستطيع إنشاء واحد بنفس البريد ثم يقبل الدعوة.",
              "We send them a link. They do not need an account first — they can create one with the same address and then accept."
            )}
          </p>

          <form
            key={invite.raw?.ok ? invite.raw.token : "invite"}
            action={invite.formAction}
            className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          >
            <input type="hidden" name="vendorId" value={vendorId} />
            <input type="hidden" name="locale" value={locale} />

            <div className="grid gap-2">
              <Label htmlFor="invite-email">{t("البريد الإلكتروني", "Email")}</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                dir="ltr"
                placeholder="name@example.com"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="invite-role">{t("الدور", "Role")}</Label>
              {/* A manager has exactly one option (see assignableRoles), so the
                  picker is a fixed label rather than a dropdown that cannot be
                  dropped — and the hidden input is what the action reads. */}
              {grantable.length === 1 ? (
                <>
                  <input type="hidden" name="role" value={grantable[0]} />
                  <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
                    {t(ROLE_LABELS[grantable[0]].ar, ROLE_LABELS[grantable[0]].en)}
                  </div>
                </>
              ) : (
                <Select name="role" defaultValue="staff">
                  <SelectTrigger id="invite-role" className="min-w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir={isAr ? "rtl" : "ltr"}>
                    {grantable.map((r) => (
                      <SelectItem key={r} value={r}>
                        <span className="flex flex-col items-start">
                          <span>{t(ROLE_LABELS[r].ar, ROLE_LABELS[r].en)}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {t(ROLE_BLURBS[r].ar, ROLE_BLURBS[r].en)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button
              type="submit"
              disabled={invite.pending}
              className="gap-2 bg-brand-primary text-white hover:bg-brand-dark"
            >
              {invite.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {t("إرسال الدعوة", "Send invitation")}
            </Button>
          </form>

          {invite.result?.ok ? (
            <div className="mt-3 rounded-lg border border-green-500/20 bg-green-500/5 p-3">
              <p className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                {invite.result.emailSent
                  ? t("أُرسلت الدعوة إلى", "Invitation sent to")
                  : t("أُنشئت الدعوة، لكن تعذّر إرسال البريد. انسخ الرابط وأرسله بنفسك:", "Invitation created, but the email could not be sent. Copy the link and send it yourself:")}
                <span dir="ltr" className="font-medium">{invite.result.invited}</span>
              </p>
              {/* Shown on success too, not only on failure. A seller who wants
                  to send it on WhatsApp should not have to guess that the link
                  exists. */}
              <div className="mt-2 flex items-center gap-2">
                <code dir="ltr" className="min-w-0 flex-1 truncate rounded bg-black/5 px-2 py-1 text-[11px] dark:bg-white/10">
                  {invite.result.url}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={() => copy(invite.result.url, "new")}
                >
                  {copied === "new" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {t("نسخ", "Copy")}
                </Button>
              </div>
            </div>
          ) : invite.result?.error ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorText(invite.result.error, locale)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ── Members ────────────────────────────────────────────────────── */}
      <div className="raised-card rounded-xl p-4 sm:p-5">
        <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
          <Shield className="h-4 w-4" />
          {t("أعضاء الفريق", "Team members")}
          <span className="text-sm font-normal text-muted-foreground">({members.length})</span>
        </h2>

        {reRole.result?.error ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorText(reRole.result.error, locale)}
          </p>
        ) : null}
        {remove.result?.error ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorText(remove.result.error, locale)}
          </p>
        ) : null}

        <ul className="mt-4 divide-y divide-border">
          {members.map((m) => {
            const isMe = m.userId === myUserId;

            /**
             * You may only change or remove a member whose CURRENT role is one
             * you could hand out — the same rule the actions enforce, and for
             * the reason written there: a manager may grant `staff`, so
             * without the symmetry a manager could demote or delete an owner.
             *
             * In practice that means an owner manages everyone and a manager
             * manages staff. The controls are hidden rather than disabled: a
             * greyed dropdown with no explanation reads as a bug, and one that
             * offers a change the server will refuse is worse than one that is
             * not there.
             */
            const canManage = grantable.includes(m.role);

            /* Leaving is always yours to do, whatever your role. */
            const canRemove = canManage || isMe;

            return (
              <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {m.name || t("بدون اسم", "No name")}
                    {isMe ? (
                      <span className="ms-2 text-[11px] font-normal text-muted-foreground">
                        {t("(أنت)", "(you)")}
                      </span>
                    ) : null}
                  </p>
                  <p dir="ltr" className="truncate text-xs text-muted-foreground">
                    {m.email || t("البريد غير متاح", "address unavailable")}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(ROLE_BLURBS[m.role]?.ar, ROLE_BLURBS[m.role]?.en)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {canManage ? (
                    /* No <form>: the FormData is built here and handed to the
                       action directly, so changing the dropdown IS the save.
                       A per-row Save button is a button somebody forgets to
                       press, and then wonders why the role did not change. */
                    <Select
                      value={m.role}
                      disabled={reRole.pending}
                      onValueChange={(v) => {
                        if (v === m.role) return;
                        const fd = new FormData();
                        fd.set("vendorId", vendorId);
                        fd.set("userId", m.userId);
                        fd.set("role", v);
                        reRole.formAction(fd);
                      }}
                    >
                      <SelectTrigger className="h-8 w-[130px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent dir={isAr ? "rtl" : "ltr"}>
                        {grantable.map((r) => (
                          <SelectItem key={r} value={r}>
                            {t(ROLE_LABELS[r]?.ar, ROLE_LABELS[r]?.en) ?? r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    roleBadge(m.role)
                  )}

                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    {date(m.joinedAt)}
                  </span>

                  {canRemove ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                      aria-label={isMe ? t("مغادرة", "Leave") : t("إزالة", "Remove")}
                      onClick={() => setPendingRemove(m)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ── Invitations ────────────────────────────────────────────────── */}
      {invitesMissing ? (
        <div className="raised-card rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-amber-800 dark:text-amber-300">
            {t("جدول الدعوات غير موجود بعد", "The invitations table does not exist yet")}
          </p>
          <p className="mt-1 text-muted-foreground">
            {t(
              "شغّل القسم 34 من schema.sql في محرّر SQL. الأعضاء الحاليون يعملون بشكل طبيعي.",
              "Run section 34 of schema.sql in the SQL editor. Existing members work normally."
            )}
          </p>
        </div>
      ) : invites.length ? (
        <div className="raised-card rounded-xl p-4 sm:p-5">
          <h2 className="flex items-center gap-2 font-semibold text-brand-primary">
            <Clock className="h-4 w-4" />
            {t("الدعوات", "Invitations")}
          </h2>

          {revoke.result?.error || drop.result?.error ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorText(revoke.result?.error || drop.result?.error, locale)}
            </p>
          ) : null}

          <ul className="mt-4 divide-y divide-border">
            {invites.map((i) => {
              const status = inviteStatus(i);
              const url = `${baseUrl}/${locale}/marketplace/invite/${i.token}`;

              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p dir="ltr" className="truncate text-sm font-medium">{i.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("كـ", "as")} {t(ROLE_LABELS[i.role]?.ar, ROLE_LABELS[i.role]?.en)}
                      {i.invited_by_name ? ` · ${t("دعاه", "invited by")} ${i.invited_by_name}` : ""}
                      {status === "pending" ? ` · ${t("ينتهي", "expires")} ${date(i.expires_at)}` : ""}
                    </p>
                  </div>

                  <Badge variant="outline" className={`text-[11px] ${STATUS_TONE[status]}`}>
                    {t(INVITE_STATUS_LABELS[status].ar, INVITE_STATUS_LABELS[status].en)}
                  </Badge>

                  {status !== "pending" ? (
                    /* Finished — accepted, cancelled or out of time. The person
                       it was for is in Team members now, so the row is history
                       somebody should be able to clear. A live one has Cancel
                       instead: hiding a link that still works would be the one
                       state this list must never be in. */
                    <form action={drop.formAction}>
                      <input type="hidden" name="vendorId" value={vendorId} />
                      <input type="hidden" name="inviteId" value={i.id} />
                      <Button
                        type="submit"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:bg-red-500/10 hover:text-red-700"
                        aria-label={t("حذف من القائمة", "Remove from the list")}
                        title={t("حذف من القائمة", "Remove from the list")}
                        disabled={drop.pending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-8 gap-1 text-xs"
                        onClick={() => copy(url, i.id)}
                      >
                        {copied === i.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {t("نسخ الرابط", "Copy link")}
                      </Button>

                      <form action={revoke.formAction}>
                        <input type="hidden" name="vendorId" value={vendorId} />
                        <input type="hidden" name="inviteId" value={i.id} />
                        <Button
                          type="submit"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                          aria-label={t("إلغاء الدعوة", "Cancel invitation")}
                          disabled={revoke.pending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── Removing somebody ──────────────────────────────────────────── */}
      <AlertDialog open={Boolean(pendingRemove)} onOpenChange={(v) => !v && setPendingRemove(null)}>
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingRemove?.userId === myUserId
                ? t("مغادرة هذا المعرض؟", "Leave this showroom?")
                : t("إزالة هذا العضو؟", "Remove this member?")}
            </AlertDialogTitle>
            {/* Says what SURVIVES, because that is the fear that stops somebody
                pressing the button. Everything is keyed by vendor_id, so the
                cars a salesperson listed stay with the showroom — see
                removeMember in queries/team.js. */}
            <AlertDialogDescription>
              {pendingRemove?.userId === myUserId
                ? t(
                    "ستفقد الوصول إلى لوحة تحكم هذا المعرض. لا شيء من بياناته يُحذف.",
                    "You will lose access to this showroom’s dashboard. None of its data is deleted."
                  )
                : t(
                    "سيفقد الوصول إلى لوحة التحكم فوراً. السيارات والصور والعملاء المحتملون الذين أضافهم تبقى للمعرض.",
                    "They lose access to the dashboard immediately. The cars, photos and leads they added stay with the showroom."
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {remove.result?.error ? (
            <p className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorText(remove.result.error, locale)}
            </p>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>{t("إلغاء", "Cancel")}</AlertDialogCancel>
            {/* A plain submit, NOT AlertDialogAction. That component closes the
                dialog on click, and this is a request that can legitimately be
                refused — "a showroom must keep at least one owner" is exactly
                what somebody meets here. A dialog that vanished on click would
                leave the member still in the list and no sign why. It stays
                open, shows the reason above, and closes on success (the hook's
                onSuccess clears pendingRemove). */}
            <form action={remove.formAction}>
              <input type="hidden" name="vendorId" value={vendorId} />
              <input type="hidden" name="userId" value={pendingRemove?.userId ?? ""} />
              <Button
                type="submit"
                disabled={remove.pending}
                className="gap-2 bg-red-600 text-white hover:bg-red-700"
              >
                {remove.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {pendingRemove?.userId === myUserId ? t("مغادرة", "Leave") : t("إزالة", "Remove")}
              </Button>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
