"use client";

/**
 * Admin → Content → FAQ.
 *
 * The whole list on one screen with one Save, because that is how it is
 * actually edited: somebody adds three questions, reorders them and switches
 * one off in a single sitting. Hero slides get four separate actions and are
 * right to — each slide carries an uploaded image — but a FAQ is text, and
 * four round trips to do what the screen presents as one change is four
 * chances for half of it to land.
 *
 * The rows themselves are FaqListEditor, the same component the listing form
 * uses for a car's own questions. The two lists differ in who writes them and
 * in nothing a person editing one would notice.
 */

import { useActionState, useMemo, useState, startTransition } from "react";
import { Check, Loader2, Save, TriangleAlert } from "lucide-react";
import FaqListEditor from "@/marketplace/ui/FaqListEditor";
import { SITE_FAQ_FALLBACK, faqEditorRows, savedFaqRows } from "@/marketplace/lib/faq";
import { saveSiteFaqs } from "../admin/_actions/site";
import { errorText } from "@/marketplace/lib/errors";

const INITIAL = { ok: false, error: null };

export default function SiteFaqManager({ locale = "en", faqs: initial = [], mode = "both" }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [state, formAction, pending] = useActionState(saveSiteFaqs, INITIAL);

  /**
   * Seeded from the server and owned here afterwards.
   *
   * Deliberately NOT re-synced from props when the action returns: the server
   * sends back exactly what was just saved, so re-seeding would be a no-op on
   * a good save and would throw away unsaved edits if somebody kept typing
   * while the request was in flight.
   */
  const [rows, setRows] = useState(() => savedFaqRows(initial));

  /* The five the public page and the footer are showing while this list is
     empty. Offered as editable rows rather than inserted on anybody's behalf
     — see lib/faq.js. */
  const defaults = useMemo(() => faqEditorRows(SITE_FAQ_FALLBACK), []);

  return (
    /* startTransition around the dispatch: a formAction called outside one
       throws in React 19. The same rule every other form in this dashboard
       follows. */
    <form
      action={formAction}
      onSubmit={(e) => {
        e.preventDefault();
        const body = new FormData(e.currentTarget);
        startTransition(() => formAction(body));
      }}
      className="space-y-4"
    >
      <FaqListEditor
        value={rows}
        onChange={setRows}
        locale={locale}
        name="faqs"
        max={60}
        mode={mode}
        defaults={defaults}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="raised-solid inline-flex items-center gap-2 rounded-lg bg-brand-primary px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("حفظ", "Save")}
        </button>

        {state?.ok ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
            <Check className="h-4 w-4" />
            {t(`تم الحفظ — ${state.count} سؤال`, `Saved — ${state.count} question${state.count === 1 ? "" : "s"}`)}
          </span>
        ) : null}

        {state?.error ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-red-600">
            <TriangleAlert className="h-4 w-4" />
            {errorText(state.error, locale)}
          </span>
        ) : null}
      </div>

      {/* Said here because it is the reason to bother filling this in, and an
          admin who does not know it will treat the page as optional. */}
      <p className="text-xs text-muted-foreground">
        {t(
          "تُنشر هذه الأسئلة على صفحة الأسئلة الشائعة مع بيانات FAQPage المنظّمة، وهو ما يجعلها مؤهلة للظهور كنتيجة منسّقة في البحث.",
          "These publish to the public FAQ page with FAQPage structured data, which is what makes them eligible to appear as a rich result in search."
        )}
      </p>
    </form>
  );
}
