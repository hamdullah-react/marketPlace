"use client";

/**
 * The pencil on a showroom's own cover and logo.
 *
 * Rendered ONLY for a member of the showroom (the page decides), so a visitor
 * never downloads it — a client component that is not rendered is not in the
 * payload, and the media library it opens is the heaviest thing in the seller
 * dashboard.
 *
 * It draws the button and nothing else. The photo itself stays server-rendered
 * markup in the page: duplicating it here would mean two <img> tags to keep in
 * step, and the one a visitor sees would be the one nobody was looking at.
 * After a save the action revalidates the route and the server's own <img>
 * comes back with the new URL.
 */

import { useState, startTransition } from "react";
import { Pencil, Images, Loader2, AlertCircle, Trash2 } from "lucide-react";
import MediaGallery from "@/app/[locale]/marketplace/(seller)/_components/MediaGallery";
import { useActionResult } from "@/app/[locale]/marketplace/(seller)/_components/useActionResult";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { saveStorefrontPhoto } from "../_actions/photos";

export default function PhotoEditButton({
  locale = "ar",
  vendorId,
  field,
  kind = "photo",
  assets = [],
  label,
  className = "",
  /* Whether there is a picture to remove. The page knows; this component
     only ever sees the button. */
  hasPhoto = false,
  removeLabel,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [open, setOpen] = useState(false);

  const { result, formAction, pending } = useActionResult(
    saveStorefrontPhoto,
    { ok: false, error: null },
    // Closing on the way back rather than on the click: a dialog that shuts
    // before the save lands leaves a seller looking at the old picture with no
    // idea whether anything happened.
    { onSuccess: () => setOpen(false) }
  );

  const MESSAGES = {
    NOT_SIGNED_IN: t("سجّل الدخول أولاً.", "Sign in first."),
    NOT_A_VENDOR: t("هذا الحساب غير مرتبط بمعرض.", "This account is not linked to a showroom."),
    NOT_YOUR_STORE: t("هذا المعرض ليس لك.", "This showroom is not yours."),
    // Only reachable now by posting a URL that is in no media library at
    // all — never by choosing something the dialog offered.
    NOT_YOUR_IMAGE: t("هذه الصورة غير موجودة في المكتبة.", "That image is not in the media library."),
    NO_IMAGE: t("لم تُختر صورة.", "No image was chosen."),
    SAVE_FAILED: t("تعذّر الحفظ. حاول مرة أخرى.", "Could not save. Try again."),
  };

  const send = (url, clear = false) => {
    const body = new FormData();
    body.set("vendorId", vendorId);
    body.set("field", field);
    body.set("url", url ?? "");
    if (clear) body.set("clear", "1");

    /**
     * Inside a transition, and both halves of that matter.
     *
     * React only wraps the dispatch for you when it is handed to a <form
     * action> prop. Called by hand, as it is here, it needs startTransition —
     * without it React warns, `pending` never flips, and worse: the re-render
     * the save triggers is treated as urgent, so the page suspends and the
     * whole storefront goes white until the server answers. In a transition
     * React keeps the old screen on display and swaps it when the new one is
     * ready, which is the difference between a blank flash and a picture
     * changing.
     */
    startTransition(() => {
      formAction(body);
    });
  };

  const pick = (next) => {
    const url = next[next.length - 1]?.url;
    if (url) send(url);
  };

  const chip =
    "inline-flex items-center justify-center rounded-full bg-white/90 p-2 shadow-sm backdrop-blur transition-colors hover:bg-white dark:bg-black/70 dark:hover:bg-black";

  return (
    /* The pair travels together, so the page positions one thing and the
       bin appears beside the pencil rather than needing its own corner. */
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={label}
        aria-label={label}
        className={`${chip} text-neutral-800 dark:text-white`}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
      </button>

      {/* Only when there is a picture. A bin over an empty placeholder is a
          button that can do nothing. */}
      {hasPhoto ? (
        <button
          type="button"
          onClick={() => send("", true)}
          title={removeLabel}
          aria-label={removeLabel}
          className={`${chip} text-red-600`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : null}

      {/* A remove happens with the dialog SHUT, so its refusal has nowhere
          else to appear. Without this a failed removal looks exactly like a
          successful one: nothing happens and the picture is still there. */}
      {!open && result?.error ? (
        <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-700 shadow-sm dark:bg-red-950/80 dark:text-red-300">
          {MESSAGES[result.error] ?? MESSAGES.SAVE_FAILED}
        </span>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          dir={isAr ? "rtl" : "ltr"}
          className="flex max-h-[88vh] flex-col sm:max-w-3xl"
        >
          <DialogHeader className="pr-12">
            <DialogTitle className="flex items-center gap-2 text-brand-primary">
              <Images className="h-4 w-4" />
              {label}
            </DialogTitle>
          </DialogHeader>

          {result?.error ? (
            <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {MESSAGES[result.error] ?? MESSAGES.SAVE_FAILED}
            </p>
          ) : null}

          {/* The dialog does not scroll; its body does — so the heading stays
              put once the library is longer than the screen. */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <MediaGallery
              locale={locale}
              vendorId={vendorId}
              initialAssets={assets}
              mode="pick"
              initialKind={kind}
              selected={[]}
              onSelect={pick}
              max={1}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
