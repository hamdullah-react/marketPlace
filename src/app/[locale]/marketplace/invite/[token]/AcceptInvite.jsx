"use client";

/**
 * The accept button, and the one thing that can go wrong after it.
 *
 * A client component for a single reason: the action can REFUSE — the link may
 * have been revoked in the seconds since this page rendered, or accepted in
 * another tab — and a plain form would reload the page and lose the message.
 * On success the action redirects into the dashboard, so there is no success
 * state to render here.
 */

import { Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { errorText } from "@/marketplace/lib/errors";
import { acceptInvitation } from "../../(seller)/_actions/team";

export default function AcceptInvite({ locale = "ar", token }) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const accept = useActionResult(acceptInvitation, { ok: false, error: null });

  return (
    <form action={accept.formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      <Button
        type="submit"
        disabled={accept.pending}
        className="w-full gap-2 bg-brand-primary text-white hover:bg-brand-dark"
      >
        {accept.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {t("قبول الدعوة", "Accept the invitation")}
      </Button>

      {accept.result?.error ? (
        <p className="flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {errorText(accept.result.error, locale)}
        </p>
      ) : null}
    </form>
  );
}
