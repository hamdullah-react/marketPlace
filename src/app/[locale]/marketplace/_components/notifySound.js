"use client";

/**
 * The notification sound, and nothing else.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 *
 * It used to live in (seller)/_components/useLiveLeads.js, next to the hook
 * that rings it. That read well and cost 252 KB on every page of the site.
 *
 * The header's NotificationBell wants exactly two things from that file,
 * `ting` and `unlockAudio` — two AudioContext helpers that touch no React and
 * no database. But an import is of a MODULE, not of a binding: pulling `ting`
 * in pulled useLiveLeads.js, which imports the Supabase browser client, which
 * is @supabase/supabase-js plus Realtime plus GoTrue. Tree shaking cannot drop
 * it, because `useLiveLeads` in the same module genuinely uses it.
 *
 * The header is in (browse)/layout.js, so the chain
 *
 *   layout -> HeaderSlot -> MarketplaceHeader -> NotificationBell
 *          -> PushToggle -> usePushRegistration -> useLiveLeads -> supabase
 *
 * put a realtime WebSocket client and an auth library into the shared bundle
 * of every public page — paid for by a signed-out buyer browsing cars, who has
 * no socket to open and no session to read.
 *
 * Splitting the file is the whole fix. Nothing here changed; it only stopped
 * being an edge in the import graph that reaches the database client.
 */

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

/* ── The notification sound ──────────────────────────────────
   A recording, with the synthesised chime below it as the fallback. Both are
   kept on purpose: the file is the better sound and the synth is the one that
   cannot fail, and a notification that makes no noise because a 33 KB asset
   404'd on a bad connection would be the same complaint all over again.

   ── This was a car horn ────────────────────────────────────

   It was chosen because a horn is the sound of the thing being sold, which is a
   better argument about a marketplace than about the person hearing it forty
   times a day: a horn is an ALARM, and an alarm is what somebody switches off.
   It also came from a stock library whose licence was never confirmed, which is
   a second reason not to keep shipping it.

   ── Played whole, not trimmed ────────────────────────────────

   The horn was played from 0.45s because its first 0.451 seconds were measured
   silence, and starting at zero made a working sound feel broken. Those numbers
   belonged to THAT file. This one is unmeasured — there was no decoder on the
   machine that swapped it — so it plays in full rather than to a guess. If it
   turns out to open with silence, measure the gap and put an offset back; a
   wrong number here is worse than none. */
const CHIME_URL = "/sounds/smile.mp3";

let chimeBuffer = null;
let chimeAsked = false;

/** Fetched once, on the first gesture — never on page load. */
function loadChime(ctx) {
  if (chimeAsked || !ctx) return;
  chimeAsked = true;

  fetch(CHIME_URL)
    .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
    .then((bytes) => ctx.decodeAudioData(bytes))
    .then((buf) => {
      chimeBuffer = buf;
    })
    .catch(() => {
      // Offline, blocked, missing, or a browser that cannot decode it. The
      // synthesised horn below carries on as though the file never existed.
    });
}

/* Whether this context has ever played anything inside a gesture. See the
   ritual below for why that is a different question from "is it running". */
let primed = false;

/**
 * ── Bringing the audio back with the page ───────────────────────────────────
 *
 * A phone suspends an AudioContext when its page goes to the background, and a
 * notification that arrives afterwards finds it suspended. resume() then needs
 * activation — and a push arriving is not activation, so the horn is refused
 * and nothing is heard. That is the gap between the test button, which carries
 * its own press, and a real event, which carries none.
 *
 * Chrome keeps STICKY activation for the life of a page: once somebody has
 * interacted with it at all, resume() is allowed again. So the context is woken
 * the moment the page comes back to the front, rather than at the moment a
 * notification needs it — by which time the chance has usually passed.
 *
 * Registered once, at module scope, because this is a property of the page and
 * not of any component that happens to be mounted on it.
 */
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!audioCtx || audioCtx.state !== "suspended") return;

    audioCtx.resume().catch(() => {
      // Still refused. The buzz in ting() is what is left.
    });
  });
}

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
    loadChime(audioCtx);
  } catch {
    // No Web Audio, or a policy that refuses outright. The badge still counts.
  }
}

/**
 * The fallback chime, synthesised rather than shipped.
 *
 * It used to be a car horn: two sawtooth tones a minor third apart through a
 * lowpass — acoustically a decent horn, and the wrong thing to make somebody
 * hear forty times a day. A horn is an alarm, and an alarm is what people
 * switch off, which is the opposite of what a notification wants.
 *
 * So it is a chime again, and the argument for having a synth at all is
 * unchanged: it is the sound that cannot fail. No network, no cache entry and
 * no decode, so the very first notification — the one that arrives while the
 * mp3 is still downloading — is never silent.
 *
 * ── What makes it read as "look here" rather than "something is wrong" ──
 *
 * A RISING pair. Two notes going up is an arrival; going down is a failure,
 * which is why every error sound falls. A perfect fourth (A5 to D6) rather than
 * a third: wide enough to be deliberate, consonant enough not to grate on the
 * fiftieth time.
 *
 * Triangle rather than sawtooth, because a chime is a struck bar and a sawtooth
 * is a reed — and gentler on a laptop speaker, which turns sawtooth harmonics
 * into fizz. The lowpass stays for the same reason, lower now.
 *
 * Silent when the context was never unlocked, which is the correct outcome for
 * a page nobody has touched — not a bug to work around.
 */
function blast(ctx, at, length, freq) {
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2000;

  const vol = ctx.createGain();

  /* The envelope IS the character. A struck bar starts instantly and DECAYS —
     no flat hold, which is what made the horn sound like a horn. The ramps also
     exist because a square-edged gate on a tone is an audible click. */
  vol.gain.setValueAtTime(0, at);
  vol.gain.linearRampToValueAtTime(0.16, at + 0.008);
  vol.gain.exponentialRampToValueAtTime(0.0001, at + length);

  filter.connect(vol).connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  osc.connect(filter);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** The two synthesised taps, scheduled from wherever the clock is NOW. */
function synth(ctx) {
  const now = ctx.currentTime;
  // A5 then D6 — a perfect fourth up, the second ringing longer.
  blast(ctx, now, 0.18, 880);
  blast(ctx, now + 0.13, 0.32, 1174.66);
}

/**
 * The recording if it has arrived, the synthesised pair if it has not.
 *
 * The first press of all is the one that STARTS the download, so it plays the
 * synth — everything after it plays the file. Two horns rather than a wait:
 * making the first notification silent while 51 KB loads would trade a small
 * difference in timbre for the one failure this whole thing exists to avoid.
 */
function chime(ctx) {
  if (!chimeBuffer) {
    synth(ctx);
    return;
  }

  const source = ctx.createBufferSource();
  source.buffer = chimeBuffer;

  /* Unity gain. The horn was lifted 1.6× because its peak had been MEASURED at
     0.327; this file's peak is unmeasured, and multiplying an unknown is how a
     notification becomes a fright. Turn it up once somebody has heard it and
     said it is quiet. */
  source.connect(ctx.destination);
  source.start(0);
}

/* When the last horn sounded, so one event cannot produce two. */
let lastHonk = 0;

export function ting() {
  /* ── One event, one horn ───────────────────────────────────────────────
     A single thing happening now announces itself twice: the action that
     caused it broadcasts on the showroom's own topic, and recordNotification
     broadcasts again so that EVERY notification chimes rather than only the
     handful that were wired for it one at a time. Both arrive within a few
     milliseconds and both are correct; two horns for one lead is not.

     It also covers the case that has nothing to do with wiring: four requests
     landing together should be one noise, not four overlapping ones. */
  const now = Date.now();
  if (now - lastHonk < 700) return;
  lastHonk = now;

  /* ── The buzz comes first, and outside everything ──────────────────────
     It used to live inside chime(), which meant it only happened when a sound
     was ALREADY about to play — so in every case where audio was impossible
     there was no cue at all. That is backwards: the moment audio cannot play
     is exactly the moment a buzz is the only thing left.

     Two of those cases are ordinary on a phone:

       · the page has never been touched this visit, so there is no audio
         context to play through
       · the browser suspended the context while the page was in the
         background, and resume() is refused without a gesture

     Both end in silence, and both are a real notification arriving. Android
     only — iOS has no vibrate API at all, and a desktop ignores it. */
  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch {
    // Some browsers throw rather than return false when it is disallowed.
  }

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
        () => chime(ctx),
        () => {
          // Refused — no gesture, or an autoplay policy. Silence is the only
          // option and the notification itself has still arrived.
        }
      );
      return;
    }

    chime(ctx);
  } catch {
    // A blocked or unavailable AudioContext is not a reason to lose the badge.
  }
}
