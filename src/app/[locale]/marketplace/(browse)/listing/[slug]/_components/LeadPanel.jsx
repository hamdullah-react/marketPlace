"use client";

/**
 * The contact panel under the price.
 *
 * ── One button, not two ─────────────────────────────────────────────────────
 *
 * There used to be "Send enquiry" beside "Request a quote": one opened a chat
 * thread, the other filled in the seller's form. The threads are gone, so there
 * is one ask — and that is a better panel anyway. Two buttons that both mean
 * "talk to this seller" is a decision pushed onto a buyer who has no way of
 * knowing which one gets answered.
 *
 * What the seller wants to know still varies, and that is what their own fields
 * are for: a showroom that needs a budget adds a Budget question, and it appears
 * here. A showroom that has built nothing gets message plus phone, which is a
 * complete lead.
 *
 * ── Signed out ──────────────────────────────────────────────────────────────
 *
 * The button still LOOKS like a button and still opens the panel. What the
 * panel shows is the reason and a way in — not a redirect fired on click, which
 * throws away the page someone spent a minute reading and reads as a refusal.
 * The sign-in link carries ?next back to this listing with #contact on it, and
 * the panel reopens on arrival, so signing in continues the sentence rather
 * than starting a new one.
 *
 * The seller's phone is NOT in this component's props. It is fetched by an
 * action when the person asks for it, because a number rendered into the page
 * is a number in every scraper's database whether or not a button guards it.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOnChange } from "@/hooks/use-on-change";
import {
  Phone, X, Loader2, CheckCircle2, AlertCircle, LogIn, ArrowRight, ClipboardList,
} from "lucide-react";
import LeadFields from "../../../../_components/LeadFields";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";
import { OPEN_STAGE_KEYS } from "@/marketplace/lib/lead-stages";
import { useActionResult } from "../../../../(seller)/_components/useActionResult";
import { sendLead, revealSellerPhone } from "../_actions/lead";

const MESSAGES = {
  NOT_SIGNED_IN: {
    ar: "انتهت جلستك. سجّل الدخول مرة أخرى.",
    en: "Your session has ended. Sign in again.",
  },
  NOT_FOUND: { ar: "هذا الإعلان لم يعد متاحاً.", en: "This listing is no longer available." },
  LISTING_UNAVAILABLE: {
    ar: "هذه السيارة لم تعد معروضة للبيع.",
    en: "This car is no longer for sale.",
  },
  OWN_LISTING: {
    ar: "هذه سيارتك — لا يمكنك إرسال طلب لنفسك.",
    en: "This is your own car — you cannot send yourself a request.",
  },
  MESSAGE_REQUIRED: { ar: "اكتب ما تريد معرفته.", en: "Write what you want to know." },
  MESSAGE_TOO_LONG: { ar: "الرسالة طويلة جداً.", en: "That message is too long." },
  PHONE_REQUIRED: {
    ar: "رقم الجوال مطلوب — به يتصل بك البائع.",
    en: "A mobile number is required — it is how the seller calls you back.",
  },
  PHONE_INVALID: { ar: "رقم جوال سعودي غير صالح.", en: "That is not a valid Saudi mobile number." },
  NO_PHONE: {
    ar: "هذا المعرض لم يضف رقماً. أرسل طلباً بدلاً من ذلك.",
    en: "This showroom has not added a number. Send a request instead.",
  },
  SAVE_FAILED: { ar: "تعذّر إرسال الطلب.", en: "Could not send your request." },
  // Not an error the buyer did anything wrong to cause — see the panel state
  // below, which is what they actually see. This is the fallback wording.
  ALREADY_SENT: {
    ar: "لقد أرسلت طلباً على هذه السيارة بالفعل.",
    en: "You have already sent a request about this car.",
  },
  VALIDATION: { ar: "راجع الحقول أدناه.", en: "Check the fields below." },
  // Only ever seen if the code is deployed ahead of the SQL, which is the
  // normal order. Says what happened rather than blaming the form.
  LEADS_NOT_MIGRATED: {
    ar: "استقبال الطلبات غير مفعّل بعد على هذا المتجر.",
    en: "This showroom is not set up to receive requests yet.",
  },
  // The codes validateAnswer() actually returns, for the seller's own fields.
  // Getting these names wrong is invisible until a buyer fails validation and
  // is shown the literal string "FIELD_REQUIRED" under the box.
  FIELD_REQUIRED: { ar: "هذا الحقل مطلوب.", en: "This field is required." },
  FIELD_NUMBER: { ar: "أدخل رقماً.", en: "Enter a number." },
  FIELD_OPTION_UNKNOWN: { ar: "اختر من الخيارات المعروضة.", en: "Choose one of the options shown." },
  EMAIL_INVALID: { ar: "بريد إلكتروني غير صالح.", en: "That is not a valid email address." },
};

export default function LeadPanel({
  listingId,
  locale = "ar",
  signedIn = false,
  isOwn = false,
  buyerPhone = "",
  /**
   * When this buyer's still-open request on this car was sent, or null.
   *
   * Known BEFORE the panel opens, so the ask can be replaced rather than
   * offered and then refused. sendLead() checks again regardless — this page
   * may have been open for an hour, and a prop is a hint, never a rule.
   */
  alreadySentAt = null,
  vendorName = "",
  /**
   * What THIS showroom asks for, on top of message and phone.
   *
   * Built by the seller in Dashboard → Lead form and read by the page. What
   * renders here is a convenience: sendLead() re-reads the same list from the
   * database and validates against that, so a field cannot be invented, skipped
   * or renamed by editing the HTML.
   */
  fields = [],
  // Which of the five presets the seller picked, and the accent / corner /
  // density they chose on top of it. See lib/form-styles.
  styleKey = "classic",
  theme = null,
  // Sections, when the seller grouped a long form. Empty renders flat.
  tabs = [],
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const pathname = usePathname();

  const [open, setOpen] = useState(false);
  const dialog = useRef(null);

  const lead = useActionResult(sendLead, { ok: false, error: null }, { autoClearMs: 0 });
  const phone = useActionResult(revealSellerPhone, { ok: false, error: null }, { autoClearMs: 0 });

  /* Coming back from sign-in. The link that sent them away put #contact on the
     end, so the panel reopens where they left it. Read once on mount — a hash
     that stays in the URL must not fight the close button afterwards. */
  useEffect(() => {
    // set-state-in-effect is disabled here rather than worked around: the URL
    // fragment is not sent to the server, so this genuinely cannot be read
    // during render, and it is read exactly once on mount. Deriving it would
    // mean touching window during render, which is the worse of the two.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof window !== "undefined" && window.location.hash === "#contact") setOpen(true);
  }, []);

  // Escape closes, and focus moves into the panel when it opens. A dialog that
  // does neither is one a keyboard user cannot leave.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const signInHref =
    `/${locale}/marketplace/login?next=${encodeURIComponent(`${pathname}#contact`)}`;

  const err = (r) =>
    r?.error ? MESSAGES[r.error]?.[locale] ?? MESSAGES[r.error]?.en ?? null : null;

  const fieldError = (name) => {
    const key = lead.result?.errors?.[name];
    return key ? MESSAGES[key]?.[locale] ?? MESSAGES[key]?.en ?? null : null;
  };

  /**
   * The seller's own fields, with their errors TRANSLATED.
   *
   * validateAnswer returns codes — REQUIRED, NOT_AN_OPTION — and LeadFields
   * renders whatever it is handed. Passing the raw result through showed the
   * buyer the literal word "REQUIRED" under a field, in both languages.
   */
  const leadFieldErrors = Object.fromEntries(
    Object.entries(lead.result?.errors ?? {})
      .filter(([name]) => name.startsWith("field__"))
      .map(([name, code]) => [
        name,
        MESSAGES[code]?.[locale] ?? MESSAGES[code]?.en ?? code,
      ])
  );

  const sent = lead.result?.ok ? lead.result : null;

  /**
   * Asking the database, rather than trusting the page that was rendered.
   *
   * ── Why the prop is not enough ──────────────────────────────────────────
   *
   * `alreadySentAt` is correct at the moment the server renders it and can be
   * stale by the time anybody looks. The buyer sends a request, goes to My
   * requests, withdraws it, and comes back to the car — and the browser serves
   * the page it cached when the request still existed. The button says
   * "Request sent" for a request that no longer exists anywhere, and there is
   * no way to ask again short of a hard reload. Next serves back/forward
   * navigations from the client cache by design, so revalidating cannot fully
   * close this.
   *
   * So the panel confirms for itself: one indexed read of this buyer's own
   * leads for this car, on mount and whenever the tab comes back to the front.
   *
   * `null` means "not checked yet" and the server's answer stands — so the
   * first paint is never wrong or flickering, and the check only ever CORRECTS
   * it. Any failure leaves it null, which means the prop keeps winning.
   *
   * Scoped by buyer_user_id from the SESSION as well as by listing: RLS lets a
   * showroom member read leads on their own cars too, and without that filter
   * a seller browsing their own listing would see another buyer's request
   * reported as their own.
   */
  /**
   * ONE piece of state: does this buyer have an open request for this car?
   *
   * ── Why everything writes into the same variable ────────────────────────
   *
   * There were three separate answers before — the server's prop, the action's
   * result, and a database check — and the button OR'd them together. That
   * makes "yes" permanent: once a send had succeeded in this tab, `sent` was
   * truthy for the life of the component, so the buyer could withdraw the
   * request, come back, and the button would still read "Request sent" with no
   * way for a later check to say otherwise. An OR can only ever add a yes.
   *
   * So they all WRITE here instead, and the most recent writer wins:
   *
   *   · the server, on render        — seeded below, and re-seeded if it changes
   *   · a successful send            — we know one exists, instantly, no round trip
   *   · a refused duplicate          — the action found one this page did not know about
   *   · the database check           — the only one that can say NO
   *
   * A date means yes; null means no.
   */
  const [openAt, setOpenAt] = useState(alreadySentAt || null);

  /* The three SYNCHRONOUS writers below moved out of effects and into render.
     Each still fires on exactly the transition it fired on before — useOnChange
     compares the same value the dependency array did — so "the most recent
     writer wins" is unchanged. What is gone is the extra commit: the button
     used to paint "Request a quote" for one frame after a send succeeded,
     which is the flicker the second comment below was already trying to avoid.

     The fourth writer, the database check, stays an effect: it is asynchronous
     and it talks to Supabase, which is what an effect is actually for. */

  // The server re-rendered with a different answer — a navigation, or a
  // revalidate after the buyer cancelled.
  useOnChange(alreadySentAt, (next) => setOpenAt(next || null));

  // Just sent one. sendLead returns sentAt precisely so this needs no round
  // trip and cannot flicker through "Request a quote" on the way.
  useOnChange(
    lead.result?.ok ? lead.result.sentAt ?? null : null,
    (sentAt) => { if (sentAt) setOpenAt(sentAt); }
  );

  // Refused as a duplicate: there IS one, and the page did not know.
  useOnChange(
    lead.result?.error === "ALREADY_SENT" ? (lead.result.sentAt || true) : null,
    (sentAt) => { if (sentAt) setOpenAt(sentAt); }
  );

  /**
   * Asking the database, because it is the only source that can say NO.
   *
   * `alreadySentAt` is correct when the server renders it and stale by the time
   * anybody looks: the buyer sends a request, withdraws it from My requests,
   * comes back to the car, and the browser serves the page it cached while the
   * request still existed. Next serves back/forward navigations from the client
   * cache by design, so revalidating cannot fully close this.
   *
   * On mount, when the tab returns to the front, and on a bfcache restore —
   * the three moments the buyer is looking at this button again after having
   * been somewhere else.
   *
   * Scoped by buyer_user_id from the SESSION as well as by listing: RLS lets a
   * showroom member read leads on their own cars too, and without that filter a
   * seller browsing their own listing would see another buyer's request
   * reported as their own.
   */
  useEffect(() => {
    if (!signedIn || !listingId) return;

    let cancelled = false;

    const check = async () => {
      try {
        const supabase = getMarketplaceAuthClient();

        const { data: session } = await supabase.auth.getSession();
        const uid = session?.session?.user?.id;
        if (!uid || cancelled) return;

        const { data, error } = await supabase
          .from("leads")
          .select("created_at")
          .eq("listing_id", listingId)
          .eq("buyer_user_id", uid)
          .in("stage", OPEN_STAGE_KEYS)
          // Matches getOpenLead(): a lead in the showroom's bin holds no slot,
          // so the buyer may ask again.
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // On error, leave whatever is there. A failed check must never be able
        // to offer a second request the server would then refuse.
        if (!cancelled && !error) setOpenAt(data?.created_at ?? null);
      } catch {
        // Offline, or no public env. Whatever is on screen stands.
      }
    };

    check();

    const onVisible = () => { if (document.visibilityState === "visible") check(); };
    const onPageShow = (e) => { if (e.persisted) check(); };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [signedIn, listingId]);

  const already = Boolean(openAt);

  const askedOn = (() => {
    const iso = typeof openAt === "string" ? openAt : null;
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString(isAr ? "ar-SA" : "en-GB", {
        day: "numeric", month: "long",
      });
    } catch { return null; }
  })();

  const requestsPath = lead.result?.requestsPath || `/${locale}/marketplace/account/requests`;

  return (
    <>
      {/* ── The buttons ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2" id="contact">
        {/* The ask is REPLACED, not disabled. A greyed-out button says "you
            may not" and leaves the reason to be guessed; this says what
            happened and where the request went. It still opens the panel,
            because the one thing they might want is the date and a way back
            to it. */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            already
              ? "flex w-full items-center justify-center gap-2 rounded-2xl border border-green-300 bg-green-50 py-2.5 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
              : "flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          }
        >
          {already ? <CheckCircle2 className="h-4 w-4" /> : <ClipboardList className="h-4 w-4" />}
          {already ? t("طلبك مُرسَل", "Request sent") : t("اطلب عرض سعر", "Request a quote")}
        </button>

        {/* Reveals in place rather than opening the panel: asking for a phone
            number is one decision, and a dialog for it would be a second. */}
        {phone.result?.ok && phone.result.phone ? (
          <a
            href={`tel:${phone.result.phone}`}
            dir="ltr"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary/10 py-2.5 text-sm font-semibold tabular-nums text-brand-primary transition-colors hover:bg-brand-primary/20"
          >
            <Phone className="h-4 w-4" />
            {phone.result.phone}
          </a>
        ) : signedIn ? (
          <form action={phone.formAction}>
            <input type="hidden" name="listingId" value={listingId} />
            <button
              type="submit"
              disabled={phone.pending}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary/10 py-2.5 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary/20 disabled:opacity-60"
            >
              {phone.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
              {t("أظهر رقم البائع", "Show seller's number")}
            </button>
          </form>
        ) : (
          <Link
            href={signInHref}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary/10 py-2.5 text-sm font-semibold text-brand-primary transition-colors hover:bg-brand-primary/20"
          >
            <Phone className="h-4 w-4" />
            {t("اتصل بالبائع", "Call seller")}
          </Link>
        )}

        {err(phone.result) ? (
          <p className="pt-1 text-center text-[11px] text-red-600">{err(phone.result)}</p>
        ) : (
          <p className="pt-1 text-center text-[11px] text-gray-400">
            {signedIn
              ? t("يتواصل معك البائع على رقمك مباشرة.", "The seller contacts you on your number.")
              : t("سجّل الدخول للتواصل مع البائع.", "Sign in to contact the seller.")}
          </p>
        )}
      </div>

      {/* ── The panel ─────────────────────────────────────────────────────── */}
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            ref={dialog}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            /**
             * Wider when the seller actually asks something.
             *
             * The panel was a flat 448px, which is right for message-and-phone
             * and wrong for a form with half and third-width fields: two halves
             * in a 408px column are two fields nobody can type in, and a third
             * is a stub. The seller sets those widths deliberately, so the
             * dialog has to give them somewhere to happen.
             *
             * Still capped, and still full-width on a phone — a lead form is
             * not a page.
             */
            className={`max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl dark:bg-gray-900 ${
              fields.length ? "sm:max-w-xl" : "sm:max-w-md"
            }`}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                  {sent
                    ? t("تم الإرسال", "Sent")
                    : already
                      ? t("أرسلت طلباً بالفعل", "You already asked")
                      : !signedIn
                        ? t("سجّل الدخول للمتابعة", "Sign in to continue")
                        : t("اطلب عرض سعر", "Request a quote")}
                </h2>
                {vendorName ? (
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{vendorName}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t("إغلاق", "Close")}
                className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Sent ──────────────────────────────────────────────────── */}
            {sent ? (
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <p className="text-sm text-green-800 dark:text-green-300">
                    {t(
                      "وصل طلبك إلى البائع. سيتواصل معك على رقمك.",
                      "The seller has your request. They will contact you on your number."
                    )}
                  </p>
                </div>

                <Link
                  href={sent.requestsPath}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-2.5 text-sm font-semibold text-white"
                >
                  {t("طلباتي", "My requests")}
                  <ArrowRight className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-gray-500 underline-offset-4 hover:underline"
                >
                  {t("متابعة التصفح", "Keep browsing")}
                </button>
              </div>
            ) : already ? (
              /* ── Already asked ──────────────────────────────────────────
                 Deliberately not styled as an error. Nothing went wrong: the
                 showroom has their request and is working it. The only useful
                 things here are WHEN they asked and how to get back to it, so
                 that is all this shows. */
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/40">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
                  <div className="text-sm text-green-800 dark:text-green-300">
                    <p>
                      {askedOn
                        ? t(
                            `أرسلت طلباً على هذه السيارة في ${askedOn}، والبائع يعمل عليه.`,
                            `You sent a request about this car on ${askedOn}, and the seller is working on it.`
                          )
                        : t(
                            "أرسلت طلباً على هذه السيارة، والبائع يعمل عليه.",
                            "You sent a request about this car, and the seller is working on it."
                          )}
                    </p>
                    <p className="mt-1.5 text-xs opacity-80">
                      {t(
                        "لا داعي لإرساله مرة أخرى — سيتواصل معك على رقمك.",
                        "No need to send it again — they will contact you on your number."
                      )}
                    </p>
                  </div>
                </div>

                <Link
                  href={requestsPath}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-2.5 text-sm font-semibold text-white"
                >
                  {t("طلباتي", "My requests")}
                  <ArrowRight className={`h-4 w-4 ${isAr ? "rotate-180" : ""}`} />
                </Link>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-gray-500 underline-offset-4 hover:underline"
                >
                  {t("متابعة التصفح", "Keep browsing")}
                </button>
              </div>
            ) : !signedIn ? (
              /* ── Signed out ──────────────────────────────────────────── */
              <div className="flex flex-col gap-4">
                <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
                  {t(
                    "نحتاج حساباً حتى يعرف البائع بمن يتصل، ولحماية أرقام البائعين من الجمع الآلي.",
                    "An account is what tells the seller who to call back — and it is what keeps sellers' numbers out of scrapers."
                  )}
                </p>
                <Link
                  href={signInHref}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-2.5 text-sm font-semibold text-white"
                >
                  <LogIn className="h-4 w-4" />
                  {t("تسجيل الدخول", "Sign in")}
                </Link>
                <Link
                  href={`/${locale}/marketplace/signup?next=${encodeURIComponent(`${pathname}#contact`)}`}
                  className="text-center text-sm text-brand-primary underline-offset-4 hover:underline"
                >
                  {t("ليس لديك حساب؟ أنشئ واحداً", "No account? Create one")}
                </Link>
                <p className="text-center text-[11px] text-gray-400">
                  {t("تعود إلى هذه السيارة مباشرة.", "You come straight back to this car.")}
                </p>

                {/* What they are being asked, shown BEFORE they sign in.

                    A buyer deciding whether an account is worth creating is
                    entitled to see what it buys them. Hiding the questions
                    behind the sign-in wall asked them to take that on trust,
                    and the seller who carefully built a three-question form
                    got a blank panel doing the persuading.

                    Disabled and nameless — see LeadFields preview mode — so it
                    is legible and not submittable. */}
                {fields.length ? (
                  <div className="rounded-2xl border border-gray-200 p-3 dark:border-white/10">
                    <p className="mb-3 text-xs font-medium text-muted-foreground">
                      {t("ما سيسألك عنه البائع", "What the seller will ask you")}
                    </p>
                    <div className="pointer-events-none opacity-70">
                      <LeadFields
                        fields={fields}
                        tabs={tabs}
                        locale={locale}
                        styleKey={styleKey}
                        theme={theme}
                        preview
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : isOwn ? (
              /* ── Own listing ─────────────────────────────────────────── */
              <p className="rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300">
                {MESSAGES.OWN_LISTING[locale] ?? MESSAGES.OWN_LISTING.en}
              </p>
            ) : (
              /* ── The form ────────────────────────────────────────────── */
              <form action={lead.formAction} className="flex flex-col gap-4">
                <input type="hidden" name="listingId" value={listingId} />
                <input type="hidden" name="locale" value={locale} />

                <div className="grid gap-1.5">
                  <label htmlFor="phone" className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {t("رقم جوالك", "Your mobile")}
                    <span className="text-red-500"> *</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    dir="ltr"
                    inputMode="tel"
                    defaultValue={buyerPhone}
                    placeholder="05XXXXXXXX"
                    className="w-full rounded-2xl border border-gray-200 px-4 py-2.5 text-sm tabular-nums outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {t(
                      "يصل مع طلبك ليتصل بك البائع مباشرة.",
                      "Sent with your request so the seller can call you back."
                    )}
                  </p>
                  {fieldError("phone") ? (
                    <p className="text-xs text-red-600">{fieldError("phone")}</p>
                  ) : null}
                </div>

                <div className="grid gap-1.5">
                  <label htmlFor="message" className="text-sm font-medium text-gray-800 dark:text-gray-200">
                    {fields.length
                      ? t("رسالة (اختياري)", "Message (optional)")
                      : t("ما الذي تريد معرفته؟", "What would you like to know?")}
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    rows={3}
                    maxLength={2000}
                    placeholder={t(
                      "هل السيارة ما زالت متاحة؟ ما حالة…",
                      "Is it still available? What is the condition of…"
                    )}
                    className="w-full resize-none rounded-2xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-white/5 dark:text-white"
                  />
                  {fieldError("message") ? (
                    <p className="text-xs text-red-600">{fieldError("message")}</p>
                  ) : null}
                </div>

                {/* The seller's own questions, in the style they chose.
                    Rendered by the SAME component the builder previews with, so
                    what they arranged is what a buyer gets. Below the two every
                    showroom asks, and separated by a rule, so it is clear where
                    the standard form ends and this dealer's own begins. */}
                {fields.length ? (
                  <div className="border-t border-gray-100 pt-4 dark:border-white/10">
                    <LeadFields
                      fields={fields}
                      tabs={tabs}
                      locale={locale}
                      styleKey={styleKey}
                      theme={theme}
                      errors={leadFieldErrors}
                    />
                  </div>
                ) : null}

                {err(lead.result) ? (
                  <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    {err(lead.result)}
                  </div>
                ) : null}

                <button
                  type="submit"
                  disabled={lead.pending}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-primary py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {lead.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("أرسل الطلب", "Send request")}
                </button>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
