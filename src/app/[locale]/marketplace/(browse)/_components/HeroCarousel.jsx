"use client";

/**
 * The hero's rotating artwork.
 *
 * Built on the project's shadcn Carousel (embla underneath), the same one the
 * compare page uses for its car cards — so the swipe physics and the arrow
 * controls behave identically in both places.
 *
 * ── Autoplay without the plugin ─────────────────────────────────────────────
 *
 * embla-carousel-autoplay is not a dependency here, and one interval is not
 * worth adding it for. The timer lives in an effect, advances the API embla
 * hands back, and stops on hover, on focus and when the tab is hidden —
 * the three cases where a slide changing under somebody is an annoyance
 * rather than a feature.
 *
 * ── Why the dots are buttons ────────────────────────────────────────────────
 *
 * A carousel a keyboard cannot drive is a carousel half the audience cannot
 * use. The dots are real buttons with labels; the arrows come from the shared
 * component and are already focusable.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext,
} from "@/components/ui/carousel";
import { localized } from "@/marketplace/lib/listing";

export default function HeroCarousel({ data, locale = "ar" }) {
  const isAr = locale === "ar";
  const slides = data?.slides ?? [];
  const intervalMs = data?.intervalMs ?? null;

  const [api, setApi] = useState(null);
  const [current, setCurrent] = useState(0);
  const [paused, setPaused] = useState(false);

  /* embla is an external store: subscribe, and read the initial value in the
     same place. See ui/carousel for the same pattern. */
  useEffect(() => {
    if (!api) return undefined;
    const sync = () => setCurrent(api.selectedScrollSnap());
    sync();
    api.on("select", sync);
    return () => api.off("select", sync);
  }, [api]);

  useEffect(() => {
    if (!api || !intervalMs || paused || slides.length < 2) return undefined;

    const tick = () => {
      // Not scrollNext(): at the last slide that does nothing and the carousel
      // silently stops. This wraps.
      if (api.canScrollNext()) api.scrollNext();
      else api.scrollTo(0);
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [api, intervalMs, paused, slides.length]);

  /* A slide changing while the tab is in the background is motion nobody asked
     for and nobody sees — and it means returning to the tab lands somewhere
     unrelated to where it was left. */
  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState !== "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  if (!slides.length) return null;

  return (
    <div
      className="group/hero relative h-full w-full"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {/*
        ── Why [&>div]:h-full ──────────────────────────────────────

        CarouselContent renders TWO divs: an `overflow-hidden` viewport it owns,
        and the flex track inside it that takes the className. The viewport
        accepts no class of its own and has no height — so `h-full` on the track
        resolved against a zero-height parent, every slide computed to 0px, and
        the images and captions were in the DOM at no size at all. The child
        selector is the only way to reach that middle element without editing
        the shared ui/carousel, which the compare page also uses.

        ml-0 / pl-0 undo the -ml-4 / pl-4 gutter the component adds between
        slides. It is right for a row of cards and wrong for a full-bleed
        photograph, where it shows up as a 16px slice of the next image.
      */}
      <Carousel
        setApi={setApi}
        opts={{ loop: true, direction: isAr ? "rtl" : "ltr", align: "center" }}
        className="h-full [&>div]:h-full"
      >
        <CarouselContent className="ml-0 h-full">
          {slides.map((slide, i) => (
            <CarouselItem key={slide.id} className="h-full pl-0">
              {/*
                Not a link. A full-bleed photograph that navigates on click is a
                trap on a touch screen — the same gesture that starts a swipe
                also fires the tap, so half the attempts to move to the next
                slide end up on a page nobody asked for. The buttons under the
                hero are the way out of it.
              */}
              <div className="relative h-full w-full">
                {/*
                  next/image, which is why images.unsplash.com is in
                  next.config's remotePatterns — see the note there, it is meant
                  to come out with the placeholder art.

                  ── What it buys over a bare <img> ─────────────────────────

                  AVIF and WebP, generated per width, from one source file. On a
                  photograph this wide that is usually the difference between
                  ~300KB and ~60KB, and it is the single biggest thing available
                  on this screen.

                  `fill` rather than width/height: the slide is a full-bleed box
                  of unknown aspect ratio, and fill + object-cover is how
                  next/image expresses that. It needs a positioned ancestor,
                  which the wrapper above provides.

                  `sizes="100vw"` is the truth here and is what stops a phone
                  downloading the desktop rendition.

                  ONLY THE FIRST IS PRIORITY. It is the LCP element; the other
                  four are off-screen at load, and fetching five full-width
                  photographs to paint one is the most expensive mistake a hero
                  can make. priority implies eager + fetchPriority=high, so
                  saying both would be saying it twice.
                */}
                <Image
                  src={slide.image}
                  alt={localized(slide.alt, locale)}
                  fill
                  sizes="100vw"
                  /* Full strength. The 20% belongs to the OVERLAY above this,
                     not to the photograph — dimming the image itself left the
                     car barely there, which is the opposite of what a hero
                     photo is for. See the scrim in (browse)/page.js. */
                  className="object-cover"
                  priority={i === 0}
                  loading={i === 0 ? undefined : "lazy"}
                  draggable={false}
                />

                {/* ── The words, on the image ────────────────────────────

                    Per slide rather than one fixed headline, because that is
                    what makes five slides worth having — five photographs of
                    cars saying the same sentence is a slideshow with nothing to
                    say.

                    <h2>, not <h1>. All five are in the DOM at once and a page
                    with five h1s has none; the page's real h1 is above this,
                    visually hidden. Only the slide on screen is exposed to a
                    screen reader — inert ones are aria-hidden, so the heading
                    list does not fill with captions nobody can see.
                    -------------------------------------------------------- */}
                <div
                  aria-hidden={i === current ? undefined : "true"}
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center sm:px-8"
                >
                  <h2 className="max-w-3xl text-balance text-lg font-extrabold leading-[1.2] tracking-tight text-white drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)] sm:text-3xl sm:leading-[1.15] lg:text-5xl">
                    {localized(slide.title, locale)}
                  </h2>
                  <p className="mt-2 max-w-xl text-balance text-[11px] leading-relaxed text-white/85 drop-shadow-[0_1px_10px_rgba(0,0,0,0.55)] sm:mt-4 sm:text-base">
                    {localized(slide.description, locale)}
                  </p>
                </div>
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>

        {/* Visible on a pointer device, hidden on touch where the swipe is the
            control. Faded until hover so they do not compete with the car. */}
        <CarouselPrevious className="start-3 hidden border-brand-primary/25 bg-white/85 text-brand-primary opacity-0 transition-opacity group-hover/hero:opacity-100 focus-visible:opacity-100 dark:bg-white/10 dark:text-[var(--brand-on-dark)] sm:flex" />
        <CarouselNext className="end-3 hidden border-brand-primary/25 bg-white/85 text-brand-primary opacity-0 transition-opacity group-hover/hero:opacity-100 focus-visible:opacity-100 dark:bg-white/10 dark:text-[var(--brand-on-dark)] sm:flex" />
      </Carousel>

      {/* ── Dots ───────────────────────────────────────────────────────────
          Position AND control. A wide pill marks where you are, so the row
          reads at a glance without counting. */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-4 z-30 flex items-center justify-center gap-1.5">
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => api?.scrollTo(i)}
            aria-label={
              isAr ? `الشريحة ${i + 1} من ${slides.length}` : `Slide ${i + 1} of ${slides.length}`
            }
            aria-current={i === current ? "true" : undefined}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === current
                ? "w-6 bg-brand-primary dark:bg-[var(--brand-on-dark)]"
                : "w-1.5 bg-brand-primary/30 hover:bg-brand-primary/60 dark:bg-white/30"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
