"use client";

/**
 * The conversation between a showroom and the platform, in a drawer.
 *
 * ── One component, both ends ────────────────────────────────────────────────
 *
 * A seller sees one thread — theirs. An admin sees a list of showrooms and then
 * a thread. Those are the same screen with one extra column, and writing them
 * separately would mean two message bubbles, two attachment renderers and two
 * ideas about what "unread" means, drifting apart from the first change. `side`
 * is the only thing that differs, and it comes from the server.
 *
 * ── It opens from the RIGHT ─────────────────────────────────────────────────
 *
 * Where the trigger is. The bell, the countdown and this button all sit in the
 * same corner, and a panel that slid in from the opposite edge crossed the whole
 * screen to reach the thing that had just been pressed — which reads as a
 * different part of the app opening rather than as this one expanding.
 *
 * In RTL the sheet flips with the page: `side="right"` is direction-aware, so
 * "right" means the same side as the trigger in both languages rather than the
 * same pixels.
 *
 * ── Real time, over BROADCAST ───────────────────────────────────────────────
 *
 * Not postgres_changes: §21.7 of schema.sql records at length that it reports
 * SUBSCRIBED on this project and then delivers nothing, even to a service-role
 * client. The server action that inserts the message sends the event, on the
 * topic each side is already allowed to listen to — `leads:<vendorId>` for a
 * showroom, the admin's own `buyer:<userId>` — so there is no new realtime
 * policy and no SQL for any of this.
 *
 * A socket is an optimisation, never the mechanism: everything it triggers is a
 * refetch of the same endpoint the drawer reads on open, so a dropped
 * connection costs freshness and never correctness.
 */

import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Download, Loader2, MessageSquare, Paperclip, Search,
  Send, Smile, Store, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";
import { errorText } from "@/marketplace/lib/errors";
import { localized } from "@/marketplace/lib/listing";
import { matches } from "@/marketplace/lib/search";
import { useActionResult } from "@/marketplace/ui/useActionResult";
import { sendMessage, markConversationRead, signalTyping } from "@/marketplace/actions/messages";

const INITIAL = { ok: false, error: null };

/* How long an indicator stays up after the last signal, and how often we send
   one. TTL is comfortably the longer of the two, so a continuous typist never
   flickers — and a typist who walks away disappears about four seconds later
   without anything having to be sent. */
const TYPING_TTL = 4000;
const TYPING_EVERY = 2500;

/* A picture is shown in the bubble; everything else is a link that downloads.
   The test is the stored mime rather than the extension, because the extension
   is part of a filename the sender chose. */
const isImage = (file) => String(file?.mime ?? "").startsWith("image/");

/* The same limits the action enforces, repeated here so the refusal happens
   BEFORE anything is uploaded. Not a substitute for the server's check — a
   client can be edited — but the only place the person finds out in time to
   choose a different file, and the only place that stops a 40MB attempt being
   sent at all.

   They are also what keeps the framework's own body limit out of the way: over
   it, Next refuses the request before the action runs and there is no sentence
   to show. See serverActions.bodySizeLimit in next.config.mjs. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;

const mb = (bytes) => Math.round((bytes / (1024 * 1024)) * 10) / 10;

/* A fixed set, not a picker library. Every emoji package is hundreds of
   kilobytes of data and a virtualised grid, on a control that in a business
   conversation is used for about eight characters. These are those eight,
   plus enough to acknowledge, agree, thank and apologise — which is what this
   thread is actually for. */
const EMOJI = [
  "🙂", "😀", "😅", "😊", "👍", "🙏", "👌", "🤝",
  "✅", "❌", "⚠️", "❗", "❓", "⏰", "📎", "📄",
  "💰", "🚗", "🔑", "🎉", "🔥", "💯", "👀", "✍️",
];

export default function MessagesDrawer({
  locale = "ar",
  /* 'admin' or 'vendor', decided by the server from the session. Never inferred
     here: a client that chose its own side would be a client that could ask to
     be the platform. */
  side = "vendor",
  /** The seller's own showroom. Ignored on the admin side. */
  vendorId = null,
  /** Admin: every showroom with a thread, newest first, each with `vendors`. */
  conversations = [],
  /** Admin: every approved showroom, so a new conversation can be started. */
  vendors = [],
  /** Admin: [[vendorId, count]] — a Map does not survive the boundary. */
  unreadPairs = [],
  /** The number on the button. */
  unreadTotal = 0,
  /** This admin's user id, for the realtime topic. Null on the seller side. */
  userId = null,
}) {
  const isAr = locale === "ar";
  const t = (ar, en) => (isAr ? ar : en);
  const router = useRouter();

  const [open, setOpen] = useState(false);

  /* Which showroom's thread is on screen. On the admin side this is a choice,
     and null means "show me the list". */
  const [picked, setPicked] = useState(null);
  const setActive = setPicked;

  /* ── SELF, rather than the seller's own id ───────────────────────
     The seller's shell resolves its vendorId in the browser, a moment after it
     mounts — so reading it into state at mount captures null and the thread
     never loads. It is not needed anyway: the API and the action both fall back
     to the caller's OWN showroom when none is named, which is the safer default
     regardless, since a client that names its own vendor is a client that could
     name somebody else's.

     So on the seller side the thread is the sentinel "self" and no id is sent.
     The realtime topic still wants the real one, and waits for it. */
  const active = side === "vendor" ? "self" : picked;
  const named = active && active !== "self" ? active : null;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(true);

  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  /* A file the browser refused to attach, and why. Kept apart from the action's
     own error: this one is ours and is cleared the moment the offending file is
     removed, while that one describes a request that actually happened. */
  const [refused, setRefused] = useState(null);
  /* Previews that failed to load, keyed `messageId-index`. A signed URL
     expires, a file can be too large for the browser to decode, and a bucket can
     be missing — none of which should leave a broken-image glyph sitting in a
     conversation. The picture is replaced by the same filename link every other
     attachment gets, which still downloads. */
  const [broken, setBroken] = useState(() => new Set());

  /* ── The other side is typing ────────────────────────────────
     A timestamp rather than a boolean, and it EXPIRES on this clock. A "stopped
     typing" signal that never arrives — a closed tab, a dropped socket, a
     refused broadcast — would otherwise leave the indicator on for ever, which
     is the classic way this feature goes wrong. Nothing has to arrive for it to
     switch off. */
  const [typingAt, setTypingAt] = useState(0);
  const [, setTick] = useState(0);

  const fileInput = useRef(null);
  const bottom = useRef(null);
  const textarea = useRef(null);
  /* When we last TOLD the other side. The action is a server round trip, so it
     is throttled here rather than fired per keystroke — see signalTyping. */
  const toldAt = useRef(0);

  const unread = useMemo(() => new Map(unreadPairs), [unreadPairs]);

  const send = useActionResult(sendMessage, INITIAL, {
    onSuccess: () => {
      setDraft("");
      setFiles([]);
      setRefused(null);
      load({ quiet: true });
      // The layout owns the badge, so the count only moves when it re-renders.
      router.refresh();
    },
  });

  const seen = useActionResult(markConversationRead, INITIAL, { autoClearMs: 0 });

  /* Its result is never read and its errors are never shown: a refused typing
     signal is not worth a line in somebody's chat window, and the send itself
     will refuse for the same reason a moment later. */
  const typing = useActionResult(signalTyping, INITIAL, { autoClearMs: 0 });

  /* ── Reading the thread ────────────────────────────────────────────────────
     `quiet` skips the spinner. A refetch caused by an arriving message must not
     blank the conversation somebody is reading — the list is replaced when the
     answer lands and looks like nothing happened until then. */
  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!active) return;
      if (!quiet) setLoading(true);

      try {
        const url = new URL("/api/marketplace/messages", window.location.origin);
        if (named) url.searchParams.set("vendor", named);
        if (search.trim()) url.searchParams.set("q", search.trim());

        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          setReady(false);
          return;
        }

        const data = await res.json();
        setReady(data.ready !== false);
        setItems(Array.isArray(data.items) ? data.items : []);
      } catch {
        // Keep whatever is on screen rather than emptying a conversation
        // because one fetch failed.
      } finally {
        setLoading(false);
      }
    },
    [active, named, search]
  );

  useEffect(() => {
    if (open && active) load();
  }, [open, active, load]);

  /* Opening a thread is reading it. Fired from the effect rather than the click
     so it also covers the admin switching between showrooms, and it is
     idempotent — one column, one timestamp. */
  useEffect(() => {
    if (!open || !active) return;

    /* startTransition, like every other action call in this codebase. Without
       it React warns that an async useActionState function was called outside a
       transition — and it is right to: `pending` never flips, so a slow mark-read
       would leave the drawer with no idea it was in flight. It matters least
       here and the rule is the same everywhere, which is why it is the rule. */
    const fd = new FormData();
    if (named) fd.set("vendorId", named);
    seen.dismiss();
    startTransition(() => seen.formAction(fd));
    // `seen` is a stable action runner; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active]);

  /* ── Expiring the indicator ───────────────────────────────
     A second's tick, and ONLY while something is showing. `typingAt` is compared
     against the clock during render, so without a re-render the indicator would
     sit there until the next message arrived — and a permanent interval would be
     a timer running all day in a drawer nobody has opened. */
  useEffect(() => {
    if (!typingAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [typingAt]);

  const showTyping = typingAt > 0 && Date.now() - typingAt < TYPING_TTL;

  // Newest message in view, the way every thread behaves.
  useEffect(() => {
    if (!open) return;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [items, open, showTyping]);

  /* ── The socket ───────────────────────────────────────────────────────────
     One topic per side, both of which already have a policy (schema.sql §21.7
     and §21.9). The handler refetches rather than appending the payload: the
     broadcast carries no message body on purpose, so a topic somebody should
     not be reading never leaks one. */
  useEffect(() => {
    const topic = side === "admin" ? (userId ? `buyer:${userId}` : null) : vendorId ? `leads:${vendorId}` : null;
    if (!topic) return;

    const supabase = getMarketplaceAuthClient();
    let cancelled = false;
    let channel = null;
    let authSub = null;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) supabase.realtime.setAuth(token);
      } catch {
        // Subscribe anyway; the refresh below still catches up.
      }

      if (cancelled) return;

      authSub = supabase.auth.onAuthStateChange((_e, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      channel = supabase
        .channel(topic, { config: { private: true } })
        /* ── …is typing ────────────────────────────────────
           Ignored when it is our own side's — an admin's own typing comes back
           on the admin topic, and showing a person their own indicator is the
           kind of bug that is funny once.

           On the admin side a vendorId rides along, so typing in one showroom's
           thread does not put "typing…" on another's. */
        .on("broadcast", { event: "message_typing" }, ({ payload }) => {
          if (payload?.side === side) return;
          if (side === "admin" && payload?.vendorId && payload.vendorId !== picked) return;
          setTypingAt(Date.now());
        })
        .on("broadcast", { event: "message_new" }, () => {
          // Whatever they were typing, they have sent it.
          setTypingAt(0);
          /* Two things, and they are different: the open thread reloads, and
             the server re-renders so the badge and the conversation list move
             for somebody who is NOT looking at this thread. */
          load({ quiet: true });
          router.refresh();
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      try {
        authSub?.data?.subscription?.unsubscribe?.();
      } catch {
        // Already gone.
      }
      if (channel) supabase.removeChannel(channel);
    };
  }, [side, userId, vendorId, picked, load, router]);

  /* ── Attaching, with the refusals said out loud ──────────────────
     A file that is too big is REJECTED here and never enters `files`, so it
     cannot be sent by pressing Send afterwards. The ones that fit are still
     attached — picking four photographs of which one is enormous should not
     throw away the other three and make somebody start again. */
  const pick = (e) => {
    const chosen = [...(e.target.files ?? [])];
    // Cleared first, so choosing the same file twice in a row still fires
    // onChange — and so an early return below cannot leave it stuck.
    if (fileInput.current) fileInput.current.value = "";
    if (!chosen.length) return;

    const tooBig = chosen.filter((f) => f.size > MAX_FILE_BYTES);
    const fits = chosen.filter((f) => f.size <= MAX_FILE_BYTES);

    setRefused(
      tooBig.length
        ? t(
            `${tooBig[0].name} حجمه ${mb(tooBig[0].size)} ميجابايت — الحد ١٠ ميجابايت للملف.`,
            `${tooBig[0].name} is ${mb(tooBig[0].size)}MB — the limit is 10MB per file.`
          )
        : null
    );

    if (!fits.length) return;

    setFiles((current) => {
      const next = [...current];

      for (const file of fits) {
        if (next.length >= MAX_FILES) {
          setRefused(
            t(
              `خمسة ملفات كحد أقصى في الرسالة الواحدة.`,
              `Five files at most in one message.`
            )
          );
          break;
        }

        // The running total, so five files that each fit but do not fit
        // together are caught here rather than by the transport.
        const total = next.reduce((n, f) => n + f.size, 0) + file.size;
        if (total > MAX_TOTAL_BYTES) {
          setRefused(
            t(
              `مجموع الملفات أكبر من ٢٠ ميجابايت. أرسلها على رسائل متفرقة.`,
              `Those come to over 20MB together. Send them in separate messages.`
            )
          );
          break;
        }

        next.push(file);
      }

      return next;
    });
  };

  const submit = (e) => {
    e?.preventDefault();
    if (!active) return;
    if (!draft.trim() && !files.length) return;

    const fd = new FormData();
    if (named) fd.set("vendorId", named);
    fd.set("body", draft);
    for (const file of files) fd.append("files", file);

    toldAt.current = 0;
    send.dismiss();
    startTransition(() => send.formAction(fd));
  };

  /* Called on every keystroke and sent at most once per TYPING_EVERY. The
     receiver's indicator lasts TYPING_TTL, which is longer, so a continuous
     typist keeps it alight with roughly one request every three seconds rather
     than one per character. */
  const announceTyping = () => {
    if (!active) return;

    const now = Date.now();
    if (now - toldAt.current < TYPING_EVERY) return;
    toldAt.current = now;

    const fd = new FormData();
    if (named) fd.set("vendorId", named);
    startTransition(() => typing.formAction(fd));
  };

  const insertEmoji = (glyph) => {
    setDraft((d) => d + glyph);
    setEmojiOpen(false);
    textarea.current?.focus();
  };

  const error = send.result?.error
    ? errorText(send.result.error, locale, send.result.params)
    : null;

  /* ── The admin's list ─────────────────────────────────────────────────────
     Showrooms that have a thread, then the rest. Both in one list, because an
     admin looking for a showroom does not know or care whether anybody has
     written to it yet — and two lists would mean searching twice. */
  const rows = useMemo(() => {
    if (side !== "admin") return [];

    const withThread = conversations.map((c) => ({
      vendorId: c.vendor_id,
      vendor: c.vendors ?? null,
      preview: c.last_message_preview,
      at: c.last_message_at,
      lastSender: c.last_sender,
    }));

    const seenIds = new Set(withThread.map((r) => r.vendorId));
    const rest = vendors
      .filter((v) => !seenIds.has(v.id))
      .map((v) => ({ vendorId: v.id, vendor: v, preview: null, at: null, lastSender: null }));

    const all = [...withThread, ...rest];
    if (!listSearch.trim()) return all;

    return all.filter((r) =>
      matches(listSearch, [r.vendor?.name, r.vendor?.slug, r.vendor?.city, r.preview])
    );
  }, [side, conversations, vendors, listSearch]);

  const activeVendor = useMemo(() => {
    if (side !== "admin") return null;
    return rows.find((r) => r.vendorId === picked)?.vendor ?? null;
  }, [rows, picked, side]);

  const when = (iso) =>
    iso
      ? new Date(iso).toLocaleString(isAr ? "ar-SA-u-ca-gregory" : "en-GB", {
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Riyadh",
        })
      : "";

  const Back = isAr ? ArrowRight : ArrowLeft;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 shrink-0"
          aria-label={t("الرسائل", "Messages")}
        >
          <MessageSquare className="h-4 w-4" />
          {unreadTotal > 0 ? (
            <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold tabular-nums text-white">
              {unreadTotal > 99 ? "99+" : unreadTotal}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      {/* Same edge as the button that opened it. Direction-aware, so this is
          one value for both languages rather than two. */}
      <SheetContent
        side="right"
        dir={isAr ? "rtl" : "ltr"}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        <SheetHeader className="shrink-0 border-b p-4 dark:border-white/10">
          <SheetTitle className="flex items-center gap-2 text-start">
            {side === "admin" && active ? (
              <button
                type="button"
                onClick={() => setActive(null)}
                className="rounded-lg p-1 hover:bg-black/5 dark:hover:bg-white/10"
                aria-label={t("رجوع", "Back")}
              >
                <Back className="h-4 w-4" />
              </button>
            ) : null}

            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="min-w-0 truncate">
              {side === "admin"
                ? active
                  ? localized(activeVendor?.name, locale) || t("محادثة", "Conversation")
                  : t("الرسائل", "Messages")
                : t("مراسلة فريق المنصة", "Message the platform team")}
            </span>
          </SheetTitle>
        </SheetHeader>

        {!ready ? (
          <p className="m-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            {t(
              "المحادثات غير مفعّلة على هذه النسخة بعد.",
              "Messaging has not been set up on this installation yet."
            )}
          </p>
        ) : side === "admin" && !active ? (
          /* ── Which showroom ──────────────────────────────────────────── */
          <>
            <div className="shrink-0 border-b p-3 dark:border-white/10">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                  placeholder={t("ابحث عن معرض…", "Find a showroom…")}
                  className="h-9 ps-8"
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {rows.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {t("لا معرض يطابق البحث.", "No showroom matches that.")}
                </p>
              ) : (
                <ul>
                  {rows.map((row) => {
                    const n = unread.get(row.vendorId) ?? 0;

                    return (
                      <li key={row.vendorId}>
                        <button
                          type="button"
                          onClick={() => setActive(row.vendorId)}
                          className="flex w-full items-start gap-3 border-b p-3 text-start hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-primary/10">
                            <Store className="h-4 w-4 text-brand-primary" />
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {localized(row.vendor?.name, locale) || row.vendor?.slug}
                              </span>
                              {n > 0 ? (
                                <span className="rounded-full bg-red-600 px-1.5 text-[10px] font-bold tabular-nums text-white">
                                  {n}
                                </span>
                              ) : null}
                            </span>

                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {row.preview
                                ? `${row.lastSender === "admin" ? t("أنت: ", "You: ") : ""}${row.preview}`
                                : t("لم تبدأ المحادثة بعد", "No messages yet")}
                            </span>
                          </span>

                          {row.at ? (
                            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                              {when(row.at)}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          /* ── The thread ──────────────────────────────────────────────── */
          <>
            <div className="shrink-0 border-b p-3 dark:border-white/10">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("ابحث في المحادثة…", "Search this conversation…")}
                  className="h-9 ps-8 pe-8"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={t("مسح", "Clear")}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {loading ? (
                <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("جارٍ التحميل…", "Loading…")}
                </p>
              ) : items.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {search
                    ? t("لا رسالة تطابق البحث.", "No message matches that.")
                    : side === "admin"
                      ? t("لا رسائل بعد. اكتب أول رسالة.", "No messages yet. Write the first one.")
                      : t(
                          "لا رسائل بعد. اكتب لنا وسيصلك الرد هنا.",
                          "No messages yet. Write to us and the reply arrives here."
                        )}
                </p>
              ) : (
                items.map((m) => {
                  // "Mine" is my SIDE, not my user — a colleague's message is
                  // the showroom's message, the same way read state is shared.
                  const mine = m.sender === side;
                  const list = Array.isArray(m.attachments) ? m.attachments : [];

                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                          mine
                            ? "rounded-ee-sm bg-brand-primary text-white"
                            : "rounded-es-sm bg-gray-100 dark:bg-white/10"
                        }`}
                      >
                        {/* Who, on the other side's messages only. On my own
                            the answer is always "us" and printing it is noise. */}
                        {!mine && m.sender_name ? (
                          <p className="mb-0.5 text-[11px] font-semibold opacity-70">
                            {m.sender_name}
                          </p>
                        ) : null}

                        {m.body ? (
                          // whitespace-pre-wrap, so a message written with line
                          // breaks arrives with them. break-words, so a pasted
                          // URL cannot widen the drawer.
                          <p className="whitespace-pre-wrap break-words">{m.body}</p>
                        ) : null}

                        {/* ── What is attached ───────────────────────
                            A picture is SHOWN — both sides, whoever sent it —
                            because a conversation about a damaged wing or a
                            transfer screenshot is unreadable as a row of
                            filenames. Everything else is a link, and every link
                            downloads: see the attachment route for why a
                            document from the other party is not rendered on our
                            own origin.

                            The preview URL is the same route with ?preview=1,
                            so the permission check is not duplicated, and the
                            route refuses to inline anything that is not an
                            image whatever the query string says. */}
                        {list.length ? (
                          <div className="mt-1.5 grid gap-1.5">
                            {list.map((file, i) => {
                              const href = `/api/marketplace/messages/${m.id}/attachment?i=${i}`;
                              const key = `${m.id}-${i}`;

                              return isImage(file) && !broken.has(key) ? (
                                <a
                                  key={`${m.id}-${i}`}
                                  href={href}
                                  className="group relative block overflow-hidden rounded-lg"
                                  title={t("تنزيل", "Download")}
                                >
                                  {/* A plain <img>, not next/image: the source is
                                      a redirect to a URL signed for an hour, so
                                      there is nothing stable for the optimiser
                                      to cache or re-request. */}
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`${href}&preview=1`}
                                    alt={file.name || t("صورة", "Picture")}
                                    loading="lazy"
                                    className="max-h-56 w-full object-cover"
                                    onError={() =>
                                      setBroken((current) => {
                                        // A new Set, because React compares by
                                        // identity — mutating this one would
                                        // change nothing on screen.
                                        if (current.has(key)) return current;
                                        const next = new Set(current);
                                        next.add(key);
                                        return next;
                                      })
                                    }
                                  />

                                  <span className="absolute end-1.5 top-1.5 rounded-full bg-black/55 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100">
                                    <Download className="h-3.5 w-3.5" />
                                  </span>
                                </a>
                              ) : (
                                <a
                                  key={`${m.id}-${i}`}
                                  href={href}
                                  className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs underline-offset-2 hover:underline ${
                                    mine ? "bg-white/15" : "bg-black/5 dark:bg-white/10"
                                  }`}
                                >
                                  <Paperclip className="h-3 w-3 shrink-0" />
                                  <span className="min-w-0 flex-1 truncate">
                                    {file.name || t("مرفق", "Attachment")}
                                  </span>
                                  <Download className="h-3 w-3 shrink-0 opacity-70" />
                                </a>
                              );
                            })}
                          </div>
                        ) : null}

                        <p className={`mt-1 text-[10px] tabular-nums ${mine ? "opacity-70" : "text-muted-foreground"}`}>
                          {when(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}

              {/* ── …is typing ─────────────────────────────────
                  In the flow rather than floating over it, so the thread scrolls
                  to it the way it scrolls to a message — an indicator hidden
                  below the fold is one nobody sees. Three dots on the same
                  staggered delay every chat uses. */}
              {showTyping ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1 rounded-2xl rounded-es-sm bg-gray-100 px-3 py-2.5 dark:bg-white/10">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                    <span className="ms-1.5 text-[11px] text-muted-foreground">
                      {side === "admin"
                        ? t("المعرض يكتب…", "The showroom is typing…")
                        : t("فريق المنصة يكتب…", "The platform team is typing…")}
                    </span>
                  </div>
                </div>
              ) : null}

              <div ref={bottom} />
            </div>

            {/* ── Writing ──────────────────────────────────────────────── */}
            <form onSubmit={submit} className="shrink-0 border-t p-3 dark:border-white/10">
              {/* Ours first: it describes a file sitting in the picker right
                  now, where the action's error describes a request that has
                  already been and gone. */}
              {refused ? (
                <p className="mb-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                  {refused}
                </p>
              ) : null}

              {error ? (
                <p className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </p>
              ) : null}

              {files.length ? (
                <ul className="mb-2 grid gap-1">
                  {files.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-2 rounded-lg bg-black/5 px-2 py-1 text-xs dark:bg-white/10"
                    >
                      <Paperclip className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setFiles((c) => c.filter((_, j) => j !== i));
                          setRefused(null);
                        }}
                        className="text-muted-foreground hover:text-red-600"
                        aria-label={t("إزالة", "Remove")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {emojiOpen ? (
                <div className="mb-2 grid grid-cols-8 gap-1 rounded-lg border p-2 dark:border-white/10">
                  {EMOJI.map((glyph) => (
                    <button
                      key={glyph}
                      type="button"
                      onClick={() => insertEmoji(glyph)}
                      className="rounded p-1 text-lg hover:bg-black/5 dark:hover:bg-white/10"
                    >
                      {glyph}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                  onChange={pick}
                />

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => fileInput.current?.click()}
                  aria-label={t("إرفاق ملف", "Attach a file")}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => setEmojiOpen((v) => !v)}
                  aria-pressed={emojiOpen}
                  aria-label={t("رموز", "Emoji")}
                >
                  <Smile className="h-4 w-4" />
                </Button>

                <textarea
                  ref={textarea}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    announceTyping();
                  }}
                  onKeyDown={(e) => {
                    /* Enter sends, Shift+Enter is a new line — what every chat
                       does, and the reason the field is a textarea rather than
                       an input in the first place. */
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={1}
                  placeholder={t("اكتب رسالة…", "Write a message…")}
                  className="max-h-32 min-h-9 flex-1 resize-y rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:border-brand-primary dark:border-white/10 dark:bg-[#161616]"
                />

                <Button
                  type="submit"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  disabled={send.pending || (!draft.trim() && !files.length)}
                  aria-label={t("إرسال", "Send")}
                >
                  {send.pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
