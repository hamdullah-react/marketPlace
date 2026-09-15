"use client";

/**
 * The About editor — headings, lists, links and pictures.
 *
 * ── What it POSTS is a document, not HTML ───────────────────────────────────
 *
 * The hidden input carries the editor's JSON. Nothing here ever produces markup
 * for storage, and RichTextRender walks that JSON to build React elements, so
 * there is no path from what a seller types to raw HTML on a public page. See
 * schema.sql §28 — on a multi-vendor marketplace that is the security model,
 * not a preference: storing one showroom's HTML and printing it back is how
 * they run a script in a buyer's browser on our domain.
 *
 * ── Pictures come from the library ──────────────────────────────────────────
 *
 * The image button opens the same MediaGallery every other picker uses, so a
 * picture in an About page is a file the showroom owns, in their own bucket,
 * with a URL that keeps working. Typing a remote URL is not offered: it would
 * be a hotlink that breaks when someone else's server moves, and a tracking
 * pixel aimed at every visitor if it were not.
 */

import { useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, ImagePlus, Link2, Unlink,
  AlignLeft, AlignCenter, AlignRight, Undo2, Redo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import MediaGallery from "@/app/[locale]/marketplace/(seller)/_components/MediaGallery";

export default function RichText({
  locale = "ar",
  name,
  vendorId,
  assets = [],
  label,
  hint,
  /* The stored document, or null for a page nobody has written yet. */
  value = null,
  dir,
  /* Optional (file) => Promise<url>. When given, the picture button uploads a
     file with it instead of opening a showroom's MediaGallery — the site's own
     pages (About us) have no showroom library to pick from. */
  uploadImage = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);

  const [doc, setDoc] = useState(value ?? null);
  const [picking, setPicking] = useState(false);
  const fileInput = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [linking, setLinking] = useState(false);
  const [href, setHref] = useState("");

  const editor = useEditor({
    /* Next renders this on the server first; letting TipTap paint immediately
       gives a tree the client then disagrees with. */
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          /* The protocols a link may use. Without this a seller could paste a
             `javascript:` URL and the page would render it as a link — which is
             the one way this editor could still put executable code on a public
             page. */
          protocols: ["http", "https", "mailto", "tel"],
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Image.configure({ HTMLAttributes: { class: "rounded-lg" } }),
      /* start/center/end, NOT left/center/right. TextAlign's default list is
         the physical one, and this page is written in Arabic half the time —
         a paragraph aligned "left" in an RTL page is aligned to the wrong end
         of it. The stored value has to be the logical one, because the same
         document is rendered in both directions. */
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["start", "center", "end"],
        defaultAlignment: "start",
      }),
    ],
    content: value ?? "",
    editorProps: {
      attributes: {
        dir: dir ?? (isAr ? "rtl" : "ltr"),
        class:
          "prose-sm min-h-56 max-w-none px-3 py-2 outline-hidden [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-1.5 [&_h3]:mt-3 [&_h3]:font-semibold [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:ps-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:ps-5 [&_blockquote]:border-s-2 [&_blockquote]:border-brand-primary [&_blockquote]:ps-3 [&_blockquote]:italic [&_img]:my-3 [&_img]:h-auto [&_img]:max-h-80 [&_img]:w-auto [&_img]:max-w-full [&_img]:rounded-lg [&_a]:text-brand-primary [&_a]:underline",
      },
    },
    onUpdate: ({ editor: e }) => setDoc(e.getJSON()),
  });

  const chain = () => editor?.chain().focus();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !uploadImage) return;
    setUploading(true);
    setUploadFailed(false);
    try {
      const src = await uploadImage(file);
      if (src) chain()?.setImage({ src }).run();
    } catch {
      setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-w-0">
      {label ? <span className="mb-1.5 block text-sm font-medium">{label}</span> : null}

      {/* What actually gets submitted. */}
      <input type="hidden" name={name} value={doc ? JSON.stringify(doc) : ""} />

      {/* No overflow-hidden: it would make this box the scroll container
          the toolbar sticks to, and this box never scrolls. Corners are
          rounded on the halves instead. */}
      <div className="rounded-lg border">
        {/* Follows you down a long page. Opaque, or the text scrolls
            through it. */}
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-lg border-b bg-muted p-1">
          <Tool title={t("عريض", "Bold")} on={editor?.isActive("bold")} onClick={() => chain()?.toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </Tool>
          <Tool title={t("مائل", "Italic")} on={editor?.isActive("italic")} onClick={() => chain()?.toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </Tool>
          <Tool title={t("تحته خط", "Underline")} on={editor?.isActive("underline")} onClick={() => chain()?.toggleUnderline().run()}>
            <UnderlineIcon className="h-4 w-4" />
          </Tool>
          <Tool title={t("مشطوب", "Strikethrough")} on={editor?.isActive("strike")} onClick={() => chain()?.toggleStrike().run()}>
            <Strikethrough className="h-4 w-4" />
          </Tool>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tool title={t("عنوان", "Heading")} on={editor?.isActive("heading", { level: 2 })} onClick={() => chain()?.toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-4 w-4" />
          </Tool>
          <Tool title={t("عنوان فرعي", "Subheading")} on={editor?.isActive("heading", { level: 3 })} onClick={() => chain()?.toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </Tool>
          <Tool title={t("قائمة", "Bullet list")} on={editor?.isActive("bulletList")} onClick={() => chain()?.toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </Tool>
          <Tool title={t("قائمة مرقّمة", "Numbered list")} on={editor?.isActive("orderedList")} onClick={() => chain()?.toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </Tool>
          <Tool title={t("اقتباس", "Quote")} on={editor?.isActive("blockquote")} onClick={() => chain()?.toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </Tool>
          <Tool title={t("فاصل", "Divider")} onClick={() => chain()?.setHorizontalRule().run()}>
            <Minus className="h-4 w-4" />
          </Tool>

          <Separator orientation="vertical" className="mx-1 h-6" />

          {/* start/center/end, not left/center/right: this page is written in
              Arabic half the time and "left" is the wrong end of it. */}
          <Tool title={t("محاذاة البداية", "Align start")} on={editor?.isActive({ textAlign: "start" })} onClick={() => chain()?.setTextAlign("start").run()}>
            <AlignLeft className="h-4 w-4 rtl:-scale-x-100" />
          </Tool>
          <Tool title={t("توسيط", "Centre")} on={editor?.isActive({ textAlign: "center" })} onClick={() => chain()?.setTextAlign("center").run()}>
            <AlignCenter className="h-4 w-4" />
          </Tool>
          <Tool title={t("محاذاة النهاية", "Align end")} on={editor?.isActive({ textAlign: "end" })} onClick={() => chain()?.setTextAlign("end").run()}>
            <AlignRight className="h-4 w-4 rtl:-scale-x-100" />
          </Tool>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tool
            title={t("رابط", "Link")}
            on={editor?.isActive("link")}
            onClick={() => {
              setHref(editor?.getAttributes("link")?.href ?? "");
              setLinking(true);
            }}
          >
            <Link2 className="h-4 w-4" />
          </Tool>
          <Tool
            title={t("إزالة الرابط", "Remove link")}
            disabled={!editor?.isActive("link")}
            onClick={() => chain()?.unsetLink().run()}
          >
            <Unlink className="h-4 w-4" />
          </Tool>
          <Tool
            title={t("صورة", "Picture")}
            disabled={uploading}
            onClick={() => (uploadImage ? fileInput.current?.click() : setPicking(true))}
          >
            <ImagePlus className={`h-4 w-4 ${uploading ? "animate-pulse" : ""}`} />
          </Tool>

          <Separator orientation="vertical" className="mx-1 h-6" />

          <Tool title={t("تراجع", "Undo")} disabled={!editor?.can().undo()} onClick={() => chain()?.undo().run()}>
            <Undo2 className="h-4 w-4 rtl:-scale-x-100" />
          </Tool>
          <Tool title={t("إعادة", "Redo")} disabled={!editor?.can().redo()} onClick={() => chain()?.redo().run()}>
            <Redo2 className="h-4 w-4 rtl:-scale-x-100" />
          </Tool>
        </div>

        <EditorContent editor={editor} className="rounded-b-lg" />
      </div>

      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}

      {uploadImage ? (
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onFile} />
      ) : null}
      {uploadFailed ? (
        <p className="mt-1 text-xs text-red-600">{t("تعذّر رفع الصورة. حاول مرة أخرى.", "Could not upload the picture. Please try again.")}</p>
      ) : null}

      {/* ── Picture, from the showroom's own library ───────────────────── */}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="flex max-h-[88vh] flex-col sm:max-w-3xl">
          <DialogHeader className="pr-12">
            <DialogTitle className="text-start text-brand-primary">
              {t("اختر صورة", "Choose a picture")}
            </DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <MediaGallery
              locale={locale}
              vendorId={vendorId}
              initialAssets={assets}
              mode="pick"
              selected={[]}
              max={1}
              onSelect={(next) => {
                const url = next[next.length - 1]?.url;
                if (url) chain()?.setImage({ src: url }).run();
                setPicking(false);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Link ───────────────────────────────────────────────────────── */}
      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent dir={isAr ? "rtl" : "ltr"} className="sm:max-w-sm">
          <DialogHeader className="pr-12">
            <DialogTitle className="text-start text-brand-primary">
              {t("رابط", "Link")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={`${name}-href`} className="text-sm">
              {t("العنوان", "Address")}
            </Label>
            <Input
              id={`${name}-href`}
              dir="ltr"
              value={href}
              onChange={(e) => setHref(e.target.value)}
              placeholder="https://example.com"
            />
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button
              type="button"
              onClick={() => {
                const v = href.trim();
                setLinking(false);
                if (!v) { chain()?.unsetLink().run(); return; }
                /* Bare domains are what people type. Given a scheme here so the
                   editor's protocol allowlist has something to check, rather
                   than silently dropping the link. */
                const url = /^(https?:|mailto:|tel:)/i.test(v) ? v : `https://${v}`;
                chain()?.setLink({ href: url }).run();
              }}
            >
              {t("تطبيق", "Apply")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setLinking(false)}>
              {t("إلغاء", "Cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * One toolbar button, in two states, so the toolbar reads as a toolbar rather
 * than a row of unrelated icons. `on` is what the cursor is currently inside.
 *
 * MODULE SCOPE, not declared inside RichText. TipTap fires onUpdate on every
 * keystroke and this component calls setDoc from it, so the editor re-renders
 * as fast as somebody can type. A component declared inside another is a new
 * TYPE each time, so every button in the toolbar was being torn down and
 * rebuilt on each character — throwing away focus and any open tooltip along
 * with it.
 */
function Tool({ onClick, on = false, disabled = false, title, children }) {
  return (
    <Button
      type="button"
      size="icon"
      variant={on ? "secondary" : "ghost"}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={on}
      className="h-8 w-8"
    >
      {children}
    </Button>
  );
}
