"use client";

/**
 * Unread leads, live.
 *
 * A showroom's dashboard is open all day on a screen behind the desk. A lead
 * that only appears on the next page load is a lead nobody calls for an hour,
 * and the whole point of a pipeline is that the top of it is fresh.
 *
 * ── It counts UNREAD, not "arrived since you loaded this page" ───────────────
 *
 * The first version of this counted leads that landed while the tab was open.
 * That is a notification, not a state, and it was wrong in all the ways a
 * notification is wrong once you rely on it: zero after every refresh, zero
 * every morning however many leads came in overnight, and emptied by clicking
 * the page whether or not anybody had read a single one.
 *
 * The count is now `leads where read_at is null` (schema.sql §21.3) — a fact
 * about the pipeline rather than about this browser tab. It starts from a
 * number the server counted, and every live event re-asks the database instead
 * of adding one locally.
 *
 * ── Why re-ask rather than keep a running total ──────────────────────────────
 *
 * A local +1/-1 drifts, and the ways it drifts are all invisible: a colleague
 * reads a lead in another office, a second tab of this same dashboard opens
 * one, the socket drops for ninety seconds and reconnects having missed three
 * events. A count is one integer over an indexed partial (`leads_unread_idx`),
 * so asking again is cheaper than any of the bookkeeping needed to avoid it —
 * and it is self-healing, which arithmetic on a stream you can miss is not.
 *
 * The optimistic bump still happens first, so the badge moves the instant the
 * chime plays rather than a round trip later. The recount then overrules it.
 *
 * ── How the events arrive: BROADCAST, not postgres_changes ──────────────────
 *
 * This used to listen to postgres_changes on the `leads` table. On this project
 * that does not work, and the failure is silent in the worst way: the channel
 * reports SUBSCRIBED and then delivers nothing, for ever.
 *
 * That was measured rather than guessed. A client holding the SERVICE ROLE key,
 * which bypasses RLS entirely, subscribed and received nothing when a lead was
 * inserted; a schema-wide postgres_changes subscription on the same connection
 * reported TIMED_OUT; and a plain Broadcast round-tripped perfectly on that
 * same websocket seconds later. So the socket, the URL and the key are fine and
 * postgres_changes specifically is not — it needs a publication, a replication
 * slot and the realtime service's WAL reader, and broadcast needs none of them.
 *
 * A trigger now calls realtime.send() onto the topic `leads:<vendorId>`
 * (schema.sql §21.7). The channel is PRIVATE, so delivery is gated by a policy
 * on realtime.messages that checks the topic's uuid against owns_vendor() —
 * one showroom cannot listen to another's.
 *
 * The payload carries an id, a stage and an unread flag. Nothing else: the
 * browser is told THAT something changed and re-reads the count through the
 * ordinary RLS-protected query, so the socket never becomes a second, weaker
 * way to read the pipeline.
 *
 * Both the subscription and the recount use the ANON client with the seller's
 * session — never the service role, which must not reach a browser.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getMarketplaceAuthClient } from "@/marketplace/auth/browser";

/**
 * The shared AudioContext, and the gesture that unlocks it.
 *
 * ── Why this exists as its own step ─────────────────────────────────────────
 *
 * Browsers refuse to start audio until the user has interacted with the page,
 * and the refusal is stricter than "has clicked at some point": a context
 * created before any gesture starts SUSPENDED, and resume() called outside a
 * gesture handler is commonly ignored.
 *
 * The chime used to create the context and call resume() at the moment a lead
 * arrived — which is never during a gesture, by definition. It was reliably
 * silent. Creating and resuming it on the first pointerdown or keydown, while
 * the browser is still treating that event as user activation, is what actually
 * unlocks it; every chime afterwards plays because the context is already
 * running.
 *
 * `once: true` on both listeners: this needs to happen one time, and a seller
 * should not carry two event listeners around the dashboard all day for it.
 */
let audioCtx = null;

function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    audioCtx ||= new Ctx();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    // No Web Audio, or a policy that refuses outright. The badge still counts.
  }
}

/**
 * A short two-note chime, synthesised rather than shipped.
 *
 * No audio file: an mp3 is a network request, a cache entry and a deploy asset
 * for eight-tenths of a second of sound, and the browser can make this exact
 * noise from three numbers.
 *
 * Silent when the context was never unlocked, which is the correct outcome for
 * a page nobody has touched — not a bug to work around.
 */
function ting() {
  try {
    // Not created here on purpose: a context first built at chime time starts
    // suspended and stays that way. See unlockAudio.
    const ctx = audioCtx;
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;

    // Two notes a fifth apart, the second a touch later — a rising interval
    // reads as "something arrived", where a single beep reads as an error.
    [
      { freq: 880, at: 0, gain: 0.16 },
      { freq: 1320, at: 0.09, gain: 0.12 },
    ].forEach(({ freq, at, gain }) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();

      osc.type = "sine";
      osc.frequency.value = freq;

      // An exponential tail, not an abrupt stop. A square-edged gate on a sine
      // wave is an audible click at both ends.
      vol.gain.setValueAtTime(0, now + at);
      vol.gain.linearRampToValueAtTime(gain, now + at + 0.01);
      vol.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.35);

      osc.connect(vol).connect(ctx.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.4);
    });
  } catch {
    // A blocked or unavailable AudioContext is not a reason to lose the badge.
  }
}

/**
 * @param vendorId  the showroom to watch. Null until the shell resolves it.
 * @param initial   the unread count the server rendered with, so the badge is
 *                  right on the first paint rather than flashing 0 and filling
 *                  in a moment later.
 * @param onLead    called when anything changes — a lead arriving, a stage
 *                  moving, a row being deleted — with the event's payload, for
 *                  refreshing whatever is on screen. The payload carries an id
 *                  and sometimes `deleted`; it is a hint about WHAT to do, never
 *                  data to render.
 */
export function useLiveLeads(vendorId, { initial = 0, onLead } = {}) {
  const [count, setCount] = useState(initial);
  const [live, setLive] = useState(false);

  /**
   * The raw channel status, surfaced so the dashboard can SHOW it.
   *
   * A live feed that has quietly died looks exactly like a quiet afternoon, and
   * a seller has no way to tell the difference. The sidebar draws this, so
   * "nothing is arriving" is either visibly fine or visibly broken.
   */
  const [status, setStatus] = useState("connecting");

  /**
   * Why it is not connected, in words, for the dashboard to show.
   *
   * A seller is not going to open devtools, so a failure that only exists in a
   * console is a failure nobody will ever read. This is the same text the
   * console gets, put somewhere a person will actually find it.
   */
  const [reason, setReason] = useState("");

  // Held in a ref so changing the callback does not tear down the subscription
  // and rebuild it — a resubscribe drops any lead that lands in the gap.
  const handler = useRef(onLead);
  handler.current = onLead;

  // The latest count, readable from a callback that must not be rebuilt every
  // time the number changes — recount() is a subscription dependency.
  const countRef = useRef(count);
  countRef.current = count;

  // The server's number wins whenever the page re-renders with a fresh one —
  // a navigation, or a router.refresh() after something was marked read.
  useEffect(() => { setCount(initial); }, [initial]);

  /**
   * Unlock the audio on the seller's first interaction, whatever it is.
   *
   * Has to happen INSIDE a gesture handler — see unlockAudio. Registered once
   * for the life of the dashboard, and removed as soon as it fires.
   */
  useEffect(() => {
    const opts = { once: true, passive: true };
    window.addEventListener("pointerdown", unlockAudio, opts);
    window.addEventListener("keydown", unlockAudio, opts);
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  /**
   * Ask the database how many are unread.
   *
   * head:true — one integer, no rows. On ANY error the previous count is kept
   * rather than replaced with zero: a momentarily unreachable socket must not
   * announce that the inbox is empty.
   */
  const recount = useCallback(async ({ announce = false } = {}) => {
    if (!vendorId) return;
    try {
      const { count: fresh, error } = await getMarketplaceAuthClient()
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", vendorId)
        .is("read_at", null);

      if (!error && typeof fresh === "number") {
        // `announce` is the poll below saying that a RISE in this number is
        // the only evidence of a new lead anyone is going to get — so it is
        // this, rather than a socket event, that has to chime and refresh.
        if (announce && fresh > countRef.current) {
          ting();
          handler.current?.();
        }
        setCount(fresh);
      }
    } catch {
      // Offline, or the anon client cannot see the table. The optimistic
      // count stands until the next page load corrects it.
    }
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    const supabase = getMarketplaceAuthClient();

    let cancelled = false;
    let channel = null;
    let authSub = null;

    // Coalesces a burst — marking twelve leads read fires twelve UPDATEs, and
    // that should cost one count query, not twelve.
    let timer = null;
    const soon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => recount(), 250);
    };

    /**
     * The socket has to carry the SELLER'S token, not the anon key.
     *
     * A PRIVATE channel is gated by a policy on realtime.messages, and that
     * policy resolves through owns_vendor() — which reads auth.uid(). On a
     * socket authenticated with the bare anon key auth.uid() is NULL, the
     * policy returns false, and the subscription is refused.
     *
     * supabase-js does set this from onAuthStateChange, but the session here
     * comes out of a cookie and resolves asynchronously, so subscribing on
     * mount can win the race and connect before the token is applied. Setting
     * it explicitly first removes the race rather than usually winning it.
     */
    (async () => {
      let hasToken = false;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (token) {
          supabase.realtime.setAuth(token);
          hasToken = true;
        }
      } catch {
        // No session, or it could not be read. The subscription is attempted
        // anyway — it will simply receive nothing, which is the correct outcome
        // for a browser that cannot prove who it is.
      }

      if (cancelled) return;

      // A refreshed token has to reach the socket too, or the subscription
      // stops receiving an hour in with no visible error.
      authSub = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.access_token) supabase.realtime.setAuth(session.access_token);
      });

      /**
       * Said out loud, because every failure this hook can have is invisible.
       *
       * No token means the private channel is REFUSED — measured: the server
       * answers "Unauthorized: You do not have permissions to read from this
       * Channel topic". That is a different bug from a channel that joins and
       * then hears nothing, and the two are indistinguishable from the badge.
       */
      if (!hasToken) {
        setReason("no sign-in token in this browser");
        console.warn(
          "[live-leads] no Supabase session in this browser — the private channel will be refused. The seller is signed in on the SERVER but the browser client cannot read the auth cookie."
        );
      }
      channel = supabase
        .channel(`leads:${vendorId}`, { config: { private: true } })
        .on("broadcast", { event: "lead_new" }, (m) => {
          // Optimistic, so the badge and the chime happen together. The
          // recount below confirms or corrects it a moment later.
          setCount((n) => n + 1);
          ting();
          handler.current?.(m?.payload);
          soon();
        })
        // A lead read in another tab, moved by a colleague, or cancelled by the
        // buyer. No chime — nothing arrived — but the number has changed.
        /**
         * Read in another tab, moved by a colleague, or withdrawn by the buyer.
         *
         * No chime — nothing arrived — but this DOES call the handler now. It
         * used to only recount, which kept the badge honest and left the table
         * underneath it showing a stage that had changed and a row that had
         * been deleted. A seller looking straight at a lead is exactly the
         * person who most needs it to be current.
         */
        .on("broadcast", { event: "lead_changed" }, (m) => {
          handler.current?.(m?.payload);
          soon();
        })
        .subscribe((state, err) => {
          setStatus(state);
          setLive(state === "SUBSCRIBED");
          if (state === "SUBSCRIBED") setReason("");
          else if (err?.message) setReason(err.message);
          else if (state !== "connecting") setReason(state);

          // A reconnect has a hole in it — anything that happened while the
          // socket was down was never delivered. Recounting on every
          // SUBSCRIBED, not only the first, is what closes it.
          if (state === "SUBSCRIBED") recount();

          if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
            // On a PRIVATE channel this is the policy on realtime.messages
            // (schema.sql §21.7) or a socket carrying no seller token. Both
            // refuse the join outright rather than joining and going quiet.
            console.warn(
              "[live-leads] unavailable:",
              state,
              err?.message ?? "",
              "— either the browser has no Supabase session, or leads_broadcast_receive on realtime.messages (schema.sql §21.7) has not been run."
            );
          }
        });
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      authSub?.data?.subscription?.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [vendorId, recount]);

  /**
   * Read events from elsewhere in THIS tab.
   *
   * The badge lives in the layout and the leads list is a page. A server action
   * that revalidates the page does not re-render the layout above it, so
   * marking leads read would leave the number stale until a full reload — and
   * Realtime, which would otherwise catch it, is exactly the thing that might
   * not be switched on.
   *
   * So the two places that mark leads read say so directly. The count is
   * adjusted first, because the action has already succeeded by the time this
   * fires and the number is known to be wrong; the recount then confirms it.
   */
  useEffect(() => {
    const onRead = (event) => {
      if (event.detail?.all) setCount(0);
      else setCount((n) => Math.max(0, n - 1));
      recount();
    };

    window.addEventListener("marketplace:leads-read", onRead);
    return () => window.removeEventListener("marketplace:leads-read", onRead);
  }, [recount]);

  /**
   * Asking, on a timer. THE PRIMARY MECHANISM.
   *
   * ── Why this is not the fallback any more ───────────────────────────────────
   *
   * The websocket was the primary path and polling was the safety net, and that
   * is backwards for the thing a showroom actually runs on. Realtime has to
   * clear a long list of hurdles before a single lead appears — a policy on
   * realtime.messages, a token the browser can read, and a WebSocket upgrade
   * that survives whatever the seller's browser, extensions and office network
   * do to it. Any one of those failing produces the same view from the desk: an
   * empty list on a day when somebody enquired.
   *
   * A count over `leads_unread_idx` needs none of it. It is one integer over a
   * partial index on an ordinary authenticated request, so it works wherever
   * the dashboard itself works — which is the actual bar. Eight seconds is not
   * instant and it is not pretending to be; it is the difference between
   * "within a few seconds" and "whenever somebody happens to reload the page",
   * and that is the difference that was costing calls.
   *
   * The socket is now an OPTIMISATION. When it is joined this drops to a slow
   * safety net, because Realtime delivers in milliseconds and a poll would only
   * be confirming what the seller already heard. When it is not, this is the
   * whole notification system and it does the chiming.
   *
   * ── Not while the tab is in the background ──────────────────────────────────
   *
   * Nobody is looking, the chime is for a person at the desk, and
   * visibilitychange below catches everything up the moment they return. A
   * dashboard left open overnight should not spend the night querying.
   */
  useEffect(() => {
    if (!vendorId) return;

    // Joined: Realtime is doing the work, so this is only a net for events the
    // socket dropped while it thought it was healthy.
    const every = live ? 60000 : 8000;

    const id = setInterval(() => {
      if (document.visibilityState === "visible") recount({ announce: true });
    }, every);

    return () => clearInterval(id);
  }, [vendorId, live, recount]);

  /**
   * A tab coming back to the front.
   *
   * The socket is commonly asleep in a background tab, and a laptop that was
   * shut has missed everything. This is the cheap catch-up: one count query
   * when the seller looks at the page again.
   */
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") recount(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [recount]);

  return { count, live, status, reason, recount };
}
