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
import { useOnChange } from "@/hooks/use-on-change";

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

/* ── The real horn ─────────────────────────────────────────────────────────
   A recording, with the synthesised pair below it as the fallback. Both are
   kept on purpose: the file is the better sound and the synth is the one that
   cannot fail, and a notification that makes no noise because a 51 KB asset
   404'd on a bad connection would be the same complaint all over again.

   ── Why it is played from 0.45s ────────────────────────────────────────────

   Measured, not guessed: the file is 2.57s long and the first 0.451s of it are
   SILENCE. Played from the start, pressing the button would do nothing for
   almost half a second — which is exactly how a working sound gets reported as
   broken. The horn itself runs 0.45s → 1.50s and the rest is silence again, so
   only that slice is played.

   Trimmed at playback rather than by re-encoding the file: no build step, and
   the numbers sit next to the reason for them. */
const HORN_URL = "/sounds/horn.mp3";
const HORN_START = 0.45;
const HORN_LENGTH = 1.1;

let hornBuffer = null;
let hornAsked = false;

/** Fetched once, on the first gesture — never on page load. */
function loadHorn(ctx) {
  if (hornAsked || !ctx) return;
  hornAsked = true;

  fetch(HORN_URL)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buf) => {
      hornBuffer = buf;
    })
    .catch(() => {
      // Offline, blocked, missing, or a browser that cannot decode it. The
      // synthesised horn below carries on as though the file never existed.
    });
}

/* Whether this context has ever played anything inside a gesture. See the
   ritual below for why that is a different question from "is it running". */
let primed = false;

export function unlockAudio() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    audioCtx ||= new Ctx();

    /* ── 1. Tell iOS this is PLAYBACK, not ambient noise ────────────────
       Safari treats Web Audio as "ambient" by default, and ambient audio obeys
       the hardware ring/silent switch — so an iPhone with that switch flicked
       is silent however loud the page plays, with no error and nothing to see.
       It is the single commonest reason a sound works on a desktop and not on
       a phone.

       navigator.audioSession arrived in Safari 16.4. Everywhere else it is
       undefined and this does nothing, which is why it is only guarded and not
       feature-detected in some cleverer way. */
    try {
      if (navigator.audioSession) navigator.audioSession.type = "playback";
    } catch {
      // Present but not writable on some versions. Not worth failing over.
    }

    if (audioCtx.state === "suspended") audioCtx.resume();

    /* ── 2. The iOS unlock ritual ───────────────────────────────────────
       A context that has never PLAYED anything during a user gesture stays
       effectively muted on iOS, whatever `state` claims. resume() alone is not
       enough — something has to actually start.

       So a one-frame silent buffer is started here, synchronously, inside the
       gesture. It makes no sound, it costs nothing, and it is what makes the
       first real horn audible rather than the second one.

       Harmless on desktop and on Android: a silent buffer is a silent
       buffer. */
    if (!primed) {
      primed = true;
      const silence = audioCtx.createBuffer(1, 1, 22050);
      const source = audioCtx.createBufferSource();
      source.buffer = silence;
      source.connect(audioCtx.destination);
      source.start(0);
    }

    // The gesture that unlocks the sound is also the moment to go and get it.
    loadHorn(audioCtx);
  } catch {
    // No Web Audio, or a policy that refuses outright. The badge still counts.
  }
}

/**
 * A car horn, synthesised rather than shipped.
 *
 * ── Why a horn, and why it is still made of three numbers ───────────────────
 *
 * This was a rising two-note chime, which is the sound every web app makes. A
 * horn is the sound of the thing being sold, and on a screen full of cars it is
 * recognised before it is understood.
 *
 * Still no audio file. An mp3 would be a network request, a cache entry and a
 * deploy asset for half a second of sound — and a horn is, acoustically, two
 * detuned tones and a filter. What makes it read as a HORN rather than a beep
 * is the interval: a real car horn is two notes a minor third apart sounding
 * together, which is why one tone alone sounds like an alarm clock.
 *
 * Sawtooth rather than sine, because a horn is a reed and a sine is a whistle.
 * The lowpass takes the top off it so a laptop speaker does not turn the
 * harmonics into fizz.
 *
 * Two blasts, short then slightly longer — the way somebody actually taps a
 * horn. One long note reads as a fault; two taps read as "look here".
 *
 * Silent when the context was never unlocked, which is the correct outcome for
 * a page nobody has touched — not a bug to work around.
 */
function blast(ctx, at, length) {
  // A minor third, the classic pairing: 440 Hz with 370 Hz under it.
  const tones = [440, 370];

  // One filter and one gain for the pair, so they sound like a single horn
  // rather than two instruments that happen to agree.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2600;

  const vol = ctx.createGain();

  /* The envelope IS the character. A horn starts almost instantly (a reed
     under pressure), holds flat, and stops — no long tail. The ramps exist
     because a square-edged gate on a tone is an audible click at both ends. */
  vol.gain.setValueAtTime(0, at);
  vol.gain.linearRampToValueAtTime(0.2, at + 0.012);
  vol.gain.setValueAtTime(0.2, at + length - 0.03);
  vol.gain.exponentialRampToValueAtTime(0.0001, at + length);

  filter.connect(vol).connect(ctx.destination);

  for (const freq of tones) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(filter);
    osc.start(at);
    osc.stop(at + length + 0.02);
  }
}

/** The two synthesised taps, scheduled from wherever the clock is NOW. */
function synth(ctx) {
  const now = ctx.currentTime;
  blast(ctx, now, 0.16);
  blast(ctx, now + 0.24, 0.26);
}

/**
 * The recording if it has arrived, the synthesised pair if it has not.
 *
 * The first press of all is the one that STARTS the download, so it plays the
 * synth — everything after it plays the file. Two horns rather than a wait:
 * making the first notification silent while 51 KB loads would trade a small
 * difference in timbre for the one failure this whole thing exists to avoid.
 */
function honk(ctx) {
  /* ── And a buzz ─────────────────────────────────────────────────────────
     A phone whose MEDIA volume is down — which is separate from its ringer,
     and is down far more often than people expect — makes no sound whatever
     we play. Vibration is the one cue left, and it is the difference between
     a notification that arrives and one that may as well not have.

     Android only: navigator.vibrate does not exist on iOS at all, and does
     nothing on a desktop. Optional-chained rather than feature-detected
     because "not there" and "there but refused" want the same handling. */
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // Some browsers throw rather than return false when it is disallowed.
  }

  if (!hornBuffer) {
    synth(ctx);
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = hornBuffer;

  // The file peaks at 0.327, so a little gain brings it up to roughly where
  // the synthesised version sits rather than being noticeably quieter.
  const vol = ctx.createGain();
  vol.gain.value = 1.6;

  source.connect(vol).connect(ctx.destination);
  source.start(0, HORN_START, HORN_LENGTH);
}

export function ting() {
  try {
    // Not created here on purpose: a context first built at chime time starts
    // suspended and stays that way. See unlockAudio.
    const ctx = audioCtx;
    if (!ctx) return;

    /* ── WAIT for the context to start ────────────────────────────────────
       This was `if (suspended) ctx.resume();` followed immediately by
       scheduling, and that is why nothing could be heard.

       resume() is ASYNCHRONOUS, and a suspended context's `currentTime` does
       not advance — it is frozen at whatever it was. So both notes were
       scheduled at a timestamp that had already gone by the moment the clock
       actually started, and the browser dropped them. No error, no warning,
       no sound.

       It bit hardest exactly where it was most visible: the "send a test"
       button calls unlockAudio() and ting() one after the other, so the
       context was always still starting up when the notes were booked.

       Scheduling from INSIDE the resolve means currentTime is real by then. */
    if (ctx.state === "suspended") {
      ctx.resume().then(
        () => honk(ctx),
        () => {
          // Refused — no gesture, or an autoplay policy. Silence is the only
          // option and the notification itself has still arrived.
        }
      );
      return;
    }

    honk(ctx);
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

  // The latest count, readable from a callback that must not be rebuilt every
  // time the number changes — recount() is a subscription dependency.
  const countRef = useRef(count);

  /**
   * Both refs are written on COMMIT, not during render.
   *
   * They used to be assigned in the component body, which is a mutation during
   * render: React is allowed to render a component and throw the result away —
   * a discarded concurrent attempt, or StrictMode's double render — and a ref
   * written on a render that never commits leaves the subscription calling a
   * handler for a tree that does not exist, or counting from a number that was
   * never shown. No dependency array on purpose: the point is "after every
   * render that actually landed".
   */
  useEffect(() => {
    handler.current = onLead;
    countRef.current = count;
  });

  // The server's number wins whenever the page re-renders with a fresh one —
  // a navigation, or a router.refresh() after something was marked read.
  // Applied during render so the badge never shows the stale count for a frame.
  useOnChange(initial, (next) => setCount(next));

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
        /**
         * The platform team approved, rejected or ended one of this showroom's
         * promotions. Chimes — it is news the seller is waiting for — and tells
         * any open Promotions or Listings page to re-read (LiveBoostRefresher).
         * Leads are untouched, so no recount.
         */
        .on("broadcast", { event: "boost_changed" }, (m) => {
          ting();
          window.dispatchEvent(
            new CustomEvent("marketplace:boost-changed", { detail: m?.payload ?? null })
          );
        })
        /**
         * The platform team switched this showroom's subscription on or off.
         *
         * A FULL reload, not router.refresh(): access is decided by
         * requireVendor() on the server, and the answer changes which page the
         * browser should be on at all — a blocked showroom belongs on
         * /marketplace/subscription, not on the dashboard it is looking at.
         * Reloading re-runs every guard from the top with no stale client cache
         * in the way.
         *
         * Without this, a showroom switched off mid-session keeps its open tab
         * working until it happens to navigate — which is exactly the tab
         * somebody would use to carry on for free.
         */
        .on("broadcast", { event: "access_changed" }, ({ payload }) => {
          /* Switched OFF: go to the wall directly instead of reloading into a
             redirect, carrying a marker so it announces itself rather than
             looking like a page they wandered onto by accident.
             requireVendor() on the server is still what ENFORCES this — the
             navigation only makes it immediate, and honest about why. */
          if (payload?.allowed === false) {
            const seg = window.location.pathname.split("/")[1] || "";
            const locale = /^[a-z]{2}$/.test(seg) ? seg : "ar";
            window.location.assign(`/${locale}/marketplace/subscription?blocked=1`);
            return;
          }

          /* Switched back on, or extended: re-run every guard from the top. */
          window.location.reload();
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
