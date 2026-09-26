"use client";

/**
 * A card that sits in 3D space and turns towards the pointer.
 *
 * ── The transform is written to the DOM, not to state ───────────────────────
 *
 * A pointermove fires dozens of times a second. Putting the angle in useState
 * would re-render this component — and everything inside it — on every one of
 * those, which on a page holding four of these is a hundred renders a second to
 * move a card two degrees. The angle is presentation and nothing else reads it,
 * so it is set straight onto the element's style in the handler.
 *
 * Mutating the DOM from an event handler is not the rule this breaks: the rule
 * is about doing it DURING RENDER. React owns what the element is; this owns
 * where it is pointing.
 *
 * ── Three degrees of depth, not one ─────────────────────────────────────────
 *
 * A tilt on its own reads as a flat picture being waved about. What makes it
 * look like an object is that the parts move by DIFFERENT amounts:
 *
 *   the card   rotates
 *   the ribbon and the button lift off it (translateZ)
 *   a highlight slides across the surface, as though the light stayed put
 *
 * `transform-style: preserve-3d` is what lets a child have its own Z — without
 * it every descendant is flattened onto the card's own plane and the lift does
 * nothing at all.
 *
 * ── It switches itself off in three cases, and each is a real one ───────────
 *
 *   reduced motion   somebody has told their system that movement makes them
 *                    unwell. This is not decoration worth overriding that for.
 *   coarse pointer   a finger has no hover. On a phone the card would tilt on
 *                    tap and stay tilted, which reads as broken.
 *   no pointer events at all — an old browser simply gets a still card.
 *
 * Checked at event time rather than on mount: a laptop plugged into a touch
 * screen, or somebody changing the system setting with the tab open, both get
 * the right answer without this component watching for it.
 */

import { useCallback, useRef } from "react";

/** Degrees at the very corner. Small on purpose — see the note below. */
const MAX_TILT = 7;

const allowsMotion = () => {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return (
    window.matchMedia("(pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
};

export default function TiltCard({ children, className = "" }) {
  const card = useRef(null);
  const shine = useRef(null);

  const follow = useCallback((event) => {
    const el = card.current;
    if (!el || !allowsMotion()) return;

    const box = el.getBoundingClientRect();

    // -0.5 … 0.5 from the centre, so the corners are the extremes and the
    // middle of the card is flat.
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;

    /* Y drives rotateX and X drives rotateY — they cross over, because tilting
       the TOP of a card away from you is a rotation about the horizontal axis.
       The minus is what makes it follow the pointer rather than flee it. */
    el.style.transform = `rotateX(${(-y * MAX_TILT).toFixed(2)}deg) rotateY(${(x * MAX_TILT).toFixed(2)}deg)`;
    // No transition while tracking: the pointer is already the easing, and a
    // duration here would make the card lag behind the cursor.
    el.style.transition = "none";

    if (shine.current) {
      shine.current.style.opacity = "1";
      shine.current.style.background = `radial-gradient(38rem circle at ${((x + 0.5) * 100).toFixed(1)}% ${((y + 0.5) * 100).toFixed(1)}%, rgba(255,255,255,0.35), transparent 42%)`;
    }
  }, []);

  const settle = useCallback(() => {
    const el = card.current;
    if (!el) return;

    // The one place a transition belongs: the card is returning to rest on its
    // own, and an instant snap back would look like a glitch.
    el.style.transition = "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)";
    el.style.transform = "rotateX(0deg) rotateY(0deg)";

    if (shine.current) shine.current.style.opacity = "0";
  }, []);

  return (
    /* The perspective lives on the WRAPPER, not the card. Perspective applies
       to an element's children, so a card carrying its own would be its own
       vanishing point and the rotation would look orthographic — turning
       without ever getting nearer or further away. */
    <div style={{ perspective: "1100px" }} className="h-full">
      <div
        ref={card}
        onPointerMove={follow}
        onPointerLeave={settle}
        onBlur={settle}
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
        className={`relative h-full ${className}`}
      >
        {children}

        {/* The light. pointer-events-none so it can never swallow a press on
            the button underneath it, and translateZ(1px) so it sits ON the
            card's surface rather than being flattened into it. */}
        <div
          ref={shine}
          aria-hidden
          style={{ transform: "translateZ(1px)", opacity: 0 }}
          className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300 dark:mix-blend-overlay"
        />
      </div>
    </div>
  );
}

/**
 * Lifts its children off the card's surface.
 *
 * Exported separately so a page decides WHAT stands proud — the price and the
 * button on a pricing card, which are the two things a reader reaches for.
 * Applying it to everything would lift the card's own background with it and
 * the depth would cancel out.
 */
export function Raise({ z = 28, className = "", children }) {
  return (
    <div style={{ transform: `translateZ(${z}px)` }} className={className}>
      {children}
    </div>
  );
}
