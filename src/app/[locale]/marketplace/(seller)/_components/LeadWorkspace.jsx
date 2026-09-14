"use client";

/**
 * One lead, and the four things a salesperson does to it.
 *
 * ── The pipeline is buttons, not a select ───────────────────────────────────
 *
 * Five stages that a deal moves through in order. A dropdown hides four of them
 * behind a click and gives no sense of direction; a row of chips shows where
 * this lead is and what the next step would be, which is the whole point of
 * having stages at all.
 *
 * Each chip submits on click rather than staging a change for a Save button.
 * Moving a card is one decision and it is instantly reversible — asking someone
 * to confirm it is a second click for nothing.
 *
 * ── Everything else is one form ─────────────────────────────────────────────
 *
 * Owner, callback date and outcome note save together, because they are one
 * thought: a seller picking the lead up puts their name on it, sets a date and
 * writes a line. Three separate saves would be three round trips for that.
 */

import Link from "next/link";
import { useState, useEffect } from "react";
import { Loader2, Check, Trash2, AlertCircle } from "lucide-react";
import { useActionResult } from "./useActionResult";
import { setLeadStage, updateLead, deleteLead } from "../_actions/leads";
import { SELLER_STAGES } from "@/marketplace/lib/lead-stages";

/* Was a second hand-written copy of the stage list, already drifting from the
   table's ("Quoted" here, "Offer made" there). One source now. */
const STAGES = SELLER_STAGES;

const MESSAGES = {
  NOT_FOUND: { ar: "لم يعد هذا العميل موجوداً.", en: "That lead no longer exists." },
  MISSING_VENDOR: { ar: "لم نتعرّف على متجرك.", en: "We could not identify your store." },
  NOT_YOUR_VENDOR: { ar: "هذا العميل يخص متجراً آخر.", en: "That lead belongs to another store." },
  SAVE_FAILED: { ar: "تعذّر الحفظ.", en: "Could not save." },
  STAGE_NOT_YOURS: {
    ar: "«ألغاه المشتري» يضعه المشتري وحده. استخدم «لم يشترِ».",
    en: "Only the buyer can set “Buyer cancelled”. Use “Didn't buy”.",
  },
  NOTE_TOO_LONG: { ar: "الملاحظة طويلة جداً.", en: "That note is too long." },
  DATE_INVALID: { ar: "تاريخ غير صالح.", en: "That is not a valid date." },
  LEADS_NOT_MIGRATED: {
    ar: "جدول العملاء غير موجود — شغّل schema.sql (القسم 21).",
    en: "The leads table does not exist — run schema.sql (section 21).",
  },
};

export default function LeadWorkspace({ locale = "ar", vendorId, lead, answers = [] }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);


  const stage = useActionResult(setLeadStage, { ok: false, error: null }, {
    // A refusal — someone else closed it, or the value was rejected — has to
    // put the buttons back where they were. Optimism that never reverts is a
    // lie with good timing.
    onAny: (result) => { if (!result?.ok) setShownStage(lead.stage); },
  });
  const details = useActionResult(updateLead);

  // Back to the list on success. Staying here would leave the seller looking at
  // a lead that no longer exists, and a refresh would 404 on them.
  /**
   * No onSuccess navigation: the action redirects (see the hidden redirectTo
   * below), so a successful delete never returns a result here at all. Leaving
   * a router.replace() in place would be a second navigation racing the first.
   */
  const remove = useActionResult(deleteLead, { ok: false, error: null }, {
    autoClearMs: 0,
  });

  const [confirming, setConfirming] = useState(false);

  const msg = (r) =>
    r?.error ? MESSAGES[r.error]?.[locale] ?? MESSAGES[r.error]?.en ?? r.error : null;

  // The stage the SERVER last confirmed, falling back to the row. Without this
  // the chips snap back to the old value for the length of the revalidation.
  /**
   * The stage as SHOWN, which is not always the stage as saved.
   *
   * It used to be `stage.result?.ok ? stage.result.saved : lead.stage` — the
   * button only lit up once the server had answered. On a slow connection that
   * is half a second of a seller pressing "Price sent" and watching nothing
   * happen, which is how you get somebody pressing it three times.
   *
   * Now the click moves it immediately and the server confirms afterwards. Two
   * things keep that honest rather than merely fast:
   *
   *   · a FAILED save puts it back (the onAny below). An optimistic update that
   *     never reverts is just a lie with good timing;
   *   · a new `lead.stage` from the server always wins, so a colleague moving
   *     the same lead is reflected on the next render rather than being held
   *     off by this component's memory of what it did.
   */
  const [shownStage, setShownStage] = useState(lead.stage);

  useEffect(() => { setShownStage(lead.stage); }, [lead.stage]);

  const current = shownStage;

  // `follow_up_at` is an ISO string with a zone; datetime-local wants
  // YYYY-MM-DDTHH:mm and nothing else, so it is trimmed rather than reformatted
  // through Date — which would shift it by the server's offset.
  const followUpValue = lead.follow_up_at ? String(lead.follow_up_at).slice(0, 16) : "";

  const input =
    "w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5 dark:text-white";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      {/* ── What they said ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {/* ── Pipeline ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <p className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
            {t("المرحلة", "Stage")}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* buyerOnly is filtered out: "Buyer cancelled" is the customer's
                own decision (schema.sql §21.6). If a seller could also set it,
                it would blur with "Didn't buy" and the one report worth having
                — how many people walked away by themselves — would stop being
                trustworthy. It still SHOWS below when it is the current stage. */}
            {STAGES.filter((s) => !s.buyerOnly).map((s) => (
              <form key={s.key} action={stage.formAction}>
                <input type="hidden" name="vendorId" value={vendorId} />
                <input type="hidden" name="leadId" value={lead.id} />
                <input type="hidden" name="stage" value={s.key} />
                <button
                  type="submit"
                  disabled={stage.pending}
                  // Before the request leaves, not after it lands.
                  onClick={() => setShownStage(s.key)}
                  aria-pressed={current === s.key}
                  className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                    current === s.key
                      ? "bg-brand-primary text-white"
                      : "border border-gray-200 text-gray-600 hover:border-brand-primary hover:text-brand-primary dark:border-white/10 dark:text-gray-400"
                  }`}
                  title={t(s.hintAr, s.hintEn)}
                >
                  {t(s.ar, s.en)}
                </button>
              </form>
            ))}
          </div>
          {msg(stage.result) ? (
            <p className="mt-2 text-xs text-red-600">{msg(stage.result)}</p>
          ) : null}
        </div>

        {/* ── The message ──────────────────────────────────────────────── */}
        {lead.message ? (
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
            <p className="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">
              {t("رسالة المشتري", "What the buyer wrote")}
            </p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-gray-300">
              {lead.message}
            </p>
          </div>
        ) : null}

        {/* ── The answers ──────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          <p className="mb-3 text-sm font-medium text-gray-800 dark:text-gray-200">
            {t("إجابات النموذج", "Form answers")}
          </p>

          {answers.length ? (
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {answers.map((a) => (
                <div key={a.key}>
                  {/* The label the question was asked under, off the ANSWER —
                      so renaming or deleting the field later does not rewrite
                      what four hundred buyers were shown. */}
                  <dt className="text-xs text-muted-foreground">{a.label}</dt>
                  <dd className="mt-0.5 break-words text-sm text-gray-900 dark:text-gray-100">
                    {String(a.value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t(
                "لم يملأ هذا المشتري أي أسئلة — لم تكن هناك أسئلة وقت الإرسال.",
                "No answers on this one — there were no questions at the time it was sent."
              )}{" "}
              <Link
                href={`/${locale}/marketplace/seller/lead-form`}
                className="text-brand-primary underline underline-offset-4"
              >
                {t("أضف أسئلة", "Add questions")}
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* ── Working it ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        <form
          action={details.formAction}
          className="flex flex-col gap-3 rounded-2xl border border-gray-200 p-4 dark:border-white/10"
        >
          <input type="hidden" name="vendorId" value={vendorId} />
          <input type="hidden" name="leadId" value={lead.id} />

          <div>
            <label htmlFor="assignedTo" className="mb-1 block text-xs font-medium">
              {t("المسؤول", "Owner")}
            </label>
            <input
              id="assignedTo"
              name="assignedTo"
              defaultValue={lead.assigned_to ?? ""}
              placeholder={t("اسم الموظف", "Who is on it")}
              className={input}
            />
          </div>

          <div>
            <label htmlFor="followUpAt" className="mb-1 block text-xs font-medium">
              {t("متابعة في", "Follow up")}
            </label>
            <input
              id="followUpAt"
              name="followUpAt"
              type="datetime-local"
              defaultValue={followUpValue}
              dir="ltr"
              className={input}
            />
          </div>

          <div>
            <label htmlFor="outcomeNote" className="mb-1 block text-xs font-medium">
              {t("ملاحظة", "Note")}
            </label>
            <textarea
              id="outcomeNote"
              name="outcomeNote"
              rows={4}
              maxLength={2000}
              defaultValue={lead.outcome_note ?? ""}
              placeholder={t(
                "ما قيل في المكالمة، أو لماذا انتهى…",
                "What was said on the call, or why it ended…"
              )}
              className={`${input} resize-none`}
            />
          </div>

          <button
            type="submit"
            disabled={details.pending}
            className="raised-solid flex items-center justify-center gap-2 rounded-xl bg-brand-primary py-2 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          >
            {details.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {details.result?.ok ? <Check className="h-4 w-4" /> : null}
            {details.result?.ok ? t("حُفظ", "Saved") : t("حفظ", "Save")}
          </button>

          {msg(details.result) ? (
            <p className="flex items-start gap-1.5 text-xs text-red-600">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {msg(details.result)}
            </p>
          ) : null}
        </form>

        {/* ── Delete ───────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-gray-200 p-4 dark:border-white/10">
          {confirming ? (
            <form action={remove.formAction} className="flex flex-col gap-2">
              <input type="hidden" name="vendorId" value={vendorId} />
              <input type="hidden" name="leadId" value={lead.id} />
              {/* The action navigates, not this component. Deleting the lead
                  revalidates the page we are standing on, so it re-renders,
                  finds nothing and 404s — a router.replace() afterwards is
                  already too late. See deleteLead(). */}
              <input
                type="hidden"
                name="redirectTo"
                value={`/${locale}/marketplace/seller/leads`}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  "ينتقل إلى تبويب «المحذوفة» لمدة 30 يوماً، ويمكنك استعادته خلالها.",
                  "Moves to the Deleted tab for 30 days. You can put it back from there."
                )}
              </p>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={remove.pending}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  {remove.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {t("احذف", "Delete")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-xl border border-gray-200 py-2 text-xs dark:border-white/10"
                >
                  {t("إلغاء", "Cancel")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="flex items-center gap-1.5 text-xs text-red-600 hover:underline"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("احذف هذا العميل", "Delete this lead")}
            </button>
          )}

          {msg(remove.result) ? (
            <p className="mt-2 text-xs text-red-600">{msg(remove.result)}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
