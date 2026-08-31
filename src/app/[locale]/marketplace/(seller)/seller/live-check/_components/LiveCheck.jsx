"use client";

/**
 * Why new leads are, or are not, arriving on their own.
 *
 * ── Why this page exists ────────────────────────────────────────────────────
 *
 * The live-lead path is a chain — env, session, RLS, the realtime.messages
 * policy, a WebSocket upgrade, the browser's audio policy — and EVERY link
 * fails the same way from the desk: an empty list. Debugging it by changing one
 * thing and asking "is it working now?" costs a round trip per guess, and the
 * console output that would answer it lives somewhere nobody looks.
 *
 * So each link is tested separately and the result is on screen. One look says
 * which one is broken.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";
import { pingMyDashboard } from "../_actions/ping";

export default function LiveCheck({ vendorId, locale }) {
  const isAr = locale === "ar";

  const [log, setLog] = useState([]);
  const [checks, setChecks] = useState({});

  // A log line survives re-renders and keeps its order, so the sequence of
  // events is readable rather than a set of final values.
  const say = useCallback((text) => {
    const at = new Date().toLocaleTimeString();
    setLog((prev) => [...prev, at + "  " + text]);
  }, []);

  const set = useCallback((key, ok, detail) => {
    setChecks((prev) => ({ ...prev, [key]: { ok, detail } }));
  }, []);

  const channelRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      /* ── 1. The showroom id ──────────────────────────────────────────────
         Null here and nothing else can work: every query and the channel
         topic are built from it. */
      set("vendor", Boolean(vendorId), vendorId || "null — the shell never resolved it");
      if (!vendorId) return;

      /* ── 2. The browser's Supabase client ───────────────────────────────
         Throws if NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL / ANON_KEY are not in
         the bundle, which is silent everywhere else. */
      let supabase;
      try {
        supabase = getMarketplaceAuthClient();
        set("client", true, "created");
      } catch (e) {
        set("client", false, e.message);
        return;
      }

      /* ── 3. A session IN THE BROWSER ────────────────────────────────────
         The server having one proves nothing: the page renders from cookies
         the server reads. This is whether JS can read them. Without it the
         realtime socket silently falls back to the anon key and the private
         channel is refused. */
      let token = null;
      try {
        const { data, error } = await supabase.auth.getSession();
        token = data?.session?.access_token ?? null;
        set(
          "session",
          Boolean(token),
          token
            ? data.session.user.email +
                " · expires " +
                new Date(data.session.expires_at * 1000).toLocaleTimeString()
            : error?.message || "no session readable by JavaScript"
        );
      } catch (e) {
        set("session", false, e.message);
      }

      /* ── 4. The count query, under RLS ──────────────────────────────────
         The 8-second poll is this query. If it fails, leads never appear
         however healthy the socket is. */
      try {
        const { count, error } = await supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("vendor_id", vendorId)
          .is("read_at", null);
        set("query", !error, error ? error.code + " " + error.message : count + " unread");
      } catch (e) {
        set("query", false, e.message);
      }

      /* ── 5. A raw WebSocket ─────────────────────────────────────────────
         Separates "the network will not carry a WebSocket" — shields, an
         extension, an office proxy — from "the server refused this topic".
         Those two look identical through supabase-js and have completely
         different fixes. */
      try {
        const wsUrl =
          process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_URL.replace(/^http/, "ws") +
          "/realtime/v1/websocket?apikey=" +
          process.env.NEXT_PUBLIC_MARKETPLACE_SUPABASE_ANON_KEY +
          "&vsn=1.0.0";
        const ws = new WebSocket(wsUrl);
        const timer = setTimeout(() => {
          if (ws.readyState !== 1) {
            set("websocket", false, "did not open within 8s — blocked or unreachable");
            try {
              ws.close();
            } catch {}
          }
        }, 8000);
        ws.onopen = () => {
          clearTimeout(timer);
          set("websocket", true, "opened");
          ws.close();
        };
        ws.onerror = () => {
          clearTimeout(timer);
          set("websocket", false, "refused — a shield, an extension or the network is blocking it");
        };
      } catch (e) {
        set("websocket", false, e.message);
      }

      if (cancelled) return;

      /* ── 6. The private channel ─────────────────────────────────────────
         The real thing the sidebar uses, joined the same way. */
      if (token) supabase.realtime.setAuth(token);

      const channel = supabase
        .channel("leads:" + vendorId, { config: { private: true } })
        .on("broadcast", { event: "lead_new" }, (m) => {
          say("RECEIVED lead_new " + JSON.stringify(m.payload));
          set("received", true, "a message arrived on the channel");
        })
        .on("broadcast", { event: "lead_changed" }, (m) => {
          say("RECEIVED lead_changed " + JSON.stringify(m.payload));
          set("received", true, "a message arrived on the channel");
        })
        .subscribe((state, err) => {
          say("channel: " + state + " " + (err?.message ?? ""));
          set("channel", state === "SUBSCRIBED", state + " " + (err?.message ?? ""));
        });

      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      if (channelRef.current) getMarketplaceAuthClient().removeChannel(channelRef.current);
    };
  }, [vendorId, say, set]);

  const rows = [
    ["vendor", isAr ? "معرّف المعرض" : "Showroom id"],
    ["client", isAr ? "عميل Supabase في المتصفح" : "Supabase client in the browser"],
    ["session", isAr ? "جلسة يمكن لجافاسكربت قراءتها" : "Session readable by JavaScript"],
    ["query", isAr ? "استعلام العدّ (يشغّل التحديث كل ٨ ثوانٍ)" : "Count query (drives the 8s poll)"],
    ["websocket", isAr ? "اتصال WebSocket خام" : "Raw WebSocket connection"],
    ["channel", isAr ? "الانضمام للقناة الخاصة" : "Private channel join"],
    ["received", isAr ? "وصلت رسالة فعلياً" : "A message actually arrived"],
  ];

  return (
    <div className="flex flex-col gap-6 px-4 py-6 lg:px-6">
      <div>
        <h1 className="text-2xl font-bold text-brand-primary">
          {isAr ? "فحص الاتصال المباشر" : "Live connection check"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAr
            ? "كل خطوة تُختبر على حدة. الخطوة الحمراء هي المشكلة."
            : "Each link tested on its own. The red one is the problem."}
        </p>
      </div>

      {/* ── The checks ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border">
        {rows.map(([key, label], i) => {
          const r = checks[key];
          return (
            <div
              key={key}
              className={`flex flex-wrap items-center gap-3 px-4 py-3 text-sm ${i ? "border-t" : ""}`}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  r === undefined ? "bg-gray-300" : r.ok ? "bg-green-500" : "bg-red-500"
                }`}
              />
              <span className="min-w-[16rem] font-medium">{label}</span>
              <span className="break-all font-mono text-xs text-muted-foreground">
                {r === undefined ? (isAr ? "جارٍ..." : "checking…") : String(r.detail ?? "")}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Send one to yourself ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={async () => {
            say("→ asking the server to broadcast…");
            try {
              const r = await pingMyDashboard();
              say("→ server sent it (" + r.vendorId + ")");
            } catch (e) {
              say("→ server FAILED: " + e.message);
            }
          }}
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {isAr ? "أرسل رسالة اختبار إلى هذه الصفحة" : "Send a test message to this page"}
        </button>
        <span className="text-xs text-muted-foreground">
          {isAr
            ? "إن ظهرت رسالة RECEIVED في السجل فالمسار كامل يعمل."
            : "A RECEIVED line in the log below means the whole path works."}
        </span>
      </div>

      {/* ── What happened, in order ─────────────────────────────────────── */}
      <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/40 p-4 text-xs leading-relaxed">
        {log.length ? log.join("\n") : isAr ? "لا شيء بعد." : "Nothing yet."}
      </pre>
    </div>
  );
}
