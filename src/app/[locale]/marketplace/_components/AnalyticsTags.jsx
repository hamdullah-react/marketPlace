import Script from 'next/script';
import { getSiteSettings } from '@/marketplace/db/queries/site';

/**
 * The measurement tags, built from the IDS an admin saved (§32).
 *
 * ── Nothing here renders anything an admin typed ───────────────────────────
 *
 * This is the whole security argument for the shape of the feature. The
 * tempting version of "let marketing add a pixel without a deploy" is a
 * textarea that stores a <script> block and a page that prints it: that is
 * arbitrary JavaScript on our own origin, with every session cookie and every
 * form on the page in reach, and one phished admin account is then the whole
 * site.
 *
 * So the database holds an ID, checked against the shape its vendor issues
 * (`G-…`, `GTM-…`, a run of digits) in TWO places — the action that saves it
 * and the query that reads it — and the snippet below is written here, in the
 * repository, where it is reviewed like any other code. An id that does not
 * match its pattern never reaches this file.
 *
 * ── Where it is NOT loaded ─────────────────────────────────────────────────
 *
 * The browse pages only. The seller dashboard, the admin screens and a buyer's
 * account pages mount this nowhere, because measuring your own team's clicks
 * pollutes every number you are trying to read — and because a dashboard is
 * full of customer names and phone numbers that have no business being sent to
 * six third parties.
 *
 * ── afterInteractive ───────────────────────────────────────────────────────
 *
 * Not `beforeInteractive`: an analytics tag that blocks first paint is a tag
 * that costs more in bounced visitors than it earns in data. Everything here
 * is fire-and-forget and none of it needs to run before the page does.
 */
export default async function AnalyticsTags() {
  const site = await getSiteSettings().catch(() => null);
  const ids = site?.analytics ?? {};

  if (!Object.keys(ids).length) return null;

  return (
    <>
      {/* Google Tag Manager — if a container is set it usually carries GA4 as
          well, but both are rendered when both are present: an admin who has
          GTM for marketing tags and GA4 wired directly is a normal setup, and
          silently dropping one of the two would be a mystery to debug. */}
      {ids.gtm ? (
        <Script id="gtm" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${ids.gtm}');`}
        </Script>
      ) : null}

      {ids.ga4 ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ids.ga4}`}
            strategy="afterInteractive"
          />
          <Script id="ga4" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());gtag('config','${ids.ga4}');`}
          </Script>
        </>
      ) : null}

      {ids.meta_pixel ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');fbq('init','${ids.meta_pixel}');fbq('track','PageView');`}
        </Script>
      ) : null}

      {ids.tiktok_pixel ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
ttq.setAndDefer=function(e,n){e[n]=function(){e.push([n].concat(Array.prototype.slice.call(arguments,0)))}};
for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
ttq.instance=function(e){for(var n=ttq._i[e]||[],i=0;i<ttq.methods.length;i++)ttq.setAndDefer(n,ttq.methods[i]);return n};
ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};
var o=d.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;
var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
ttq.load('${ids.tiktok_pixel}');ttq.page();}(window,document,'ttq');`}
        </Script>
      ) : null}

      {ids.snapchat_pixel ? (
        <Script id="snap-pixel" strategy="afterInteractive">
          {`(function(e,t,n){if(e.snaptr)return;var a=e.snaptr=function(){a.handleRequest?
a.handleRequest.apply(a,arguments):a.queue.push(arguments)};a.queue=[];var s='script';
var r=t.createElement(s);r.async=!0;r.src=n;var u=t.getElementsByTagName(s)[0];
u.parentNode.insertBefore(r,u);})(window,document,'https://sc-static.net/scevent.min.js');
snaptr('init','${ids.snapchat_pixel}');snaptr('track','PAGE_VIEW');`}
        </Script>
      ) : null}

      {ids.clarity ? (
        <Script id="clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,'clarity','script','${ids.clarity}');`}
        </Script>
      ) : null}
    </>
  );
}
