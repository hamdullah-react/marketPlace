/**
 * A specification's mark, drawn from the icon set this application ships.
 *
 * The companion to lib/spec-icons.js: that file is the vocabulary and the
 * search, this one is the token → component map. Two files because the
 * vocabulary is imported by server code (the template, the queries) and must
 * not drag lucide into a server bundle for a list of names.
 *
 * ── It replaces SpecIcon for specifications ───────────────────────────────
 *
 * ui/SpecIcon.jsx draws an <img> from a URL and tints it by routing the file
 * through /api/marketplace/icon, which substitutes the brand colour as it
 * hands the file over. That machinery exists because the old spec icons were
 * two-tone bitmap-like SVGs that CSS cannot colour — a mask reads alpha, so
 * hexagon and symbol came out the same colour and the symbol disappeared.
 *
 * None of that is needed here. These are stroke icons that inherit
 * `currentColor`, so they follow the showroom's theme by doing nothing at all:
 * no request, no substitution, no cache, no `brightness-0 invert` on a
 * selected tab. SpecIcon stays for the catalog's uploaded artwork — brands,
 * models, colours — which is genuinely an image.
 *
 * ── An unknown token draws something ──────────────────────────────────────
 *
 * `icon` comes out of a database column, so it can hold a token this build
 * does not know: a row written by a newer deploy, or one somebody edited by
 * hand. Falling back to a neutral mark rather than rendering nothing keeps the
 * row's shape stable — a sheet where some rows have a 16px gutter and others
 * do not reads as broken, and the missing icon is the lesser of the two.
 *
 * Pass `fallback={null}` where no icon at all is the better answer.
 */

import { createElement } from 'react';
import {
  Car, CarFront, Truck, Bus, Caravan, Bike,
  Settings2, Fuel, Flame, Gauge, CircleGauge, Cog, Settings, Bolt, Activity,
  Timer, Leaf, Recycle, Wrench, Droplet, Wind,
  Zap, Battery, BatteryCharging, Plug, PlugZap, Cable, Cpu, Route,
  Ruler, MoveHorizontal, MoveVertical, Scaling, Weight, Scale, Luggage,
  Package, DoorOpen, Users, RotateCw, Anchor,
  Disc, Disc3, CircleDot, Waves, Mountain, Layers, LifeBuoy, Compass,
  Snowflake, AirVent, Fan, Thermometer, Heater, Sun, Umbrella, CloudRain, Droplets,
  Armchair, Sofa, Bed, Rows3, Baby, Crown, Palette, Gem, Frame, Lamp, Table,
  Lightbulb, SunDim, Blinds, PanelTop, Footprints, FlipHorizontal2, Sparkles,
  Monitor, Tv, Smartphone, Bluetooth, Wifi, Usb, Volume2, Speaker, Headphones,
  Radio, Mic, Navigation, Projector, Gamepad2, Watch,
  Shield, ShieldCheck, ShieldAlert, TriangleAlert, Siren, Lock, KeyRound,
  Fingerprint, Camera, Video, Radar, ScanEye, Eye, SquareParking, OctagonAlert,
  Signpost, BellRing, Cross, Hand, PhoneCall,
  FileText, BadgeCheck, CalendarDays, MapPin, Hash, Percent, Star, Info,
  CircleCheck, ListChecks,
} from 'lucide-react';

/**
 * token → component.
 *
 * Every key here exists in SPEC_ICONS and every SPEC_ICONS token exists here;
 * the two are checked against each other by the spec-template test, because a
 * token in the picker with no component would render the fallback for an icon
 * somebody deliberately chose.
 */
const GLYPHS = {
  car: Car, 'car-front': CarFront, truck: Truck, bus: Bus, caravan: Caravan, bike: Bike,

  engine: Settings2, fuel: Fuel, flame: Flame, gauge: Gauge, 'gauge-circle': CircleGauge,
  cog: Cog, settings: Settings, bolt: Bolt, activity: Activity, timer: Timer,
  leaf: Leaf, recycle: Recycle, wrench: Wrench, droplet: Droplet, wind: Wind,

  zap: Zap, battery: Battery, 'battery-charging': BatteryCharging, plug: Plug,
  'plug-zap': PlugZap, cable: Cable, cpu: Cpu, route: Route,

  ruler: Ruler, 'move-horizontal': MoveHorizontal, 'move-vertical': MoveVertical,
  scaling: Scaling, weight: Weight, scale: Scale, luggage: Luggage, package: Package,
  'door-open': DoorOpen, users: Users, 'rotate-cw': RotateCw, anchor: Anchor,

  disc: Disc, 'disc-3': Disc3, 'circle-dot': CircleDot, waves: Waves,
  mountain: Mountain, layers: Layers, 'life-buoy': LifeBuoy, compass: Compass,

  snowflake: Snowflake, 'air-vent': AirVent, fan: Fan, thermometer: Thermometer,
  heater: Heater, sun: Sun, umbrella: Umbrella, 'cloud-rain': CloudRain, droplets: Droplets,

  armchair: Armchair, sofa: Sofa, bed: Bed, 'rows-3': Rows3, baby: Baby,
  crown: Crown, palette: Palette, gem: Gem, frame: Frame, lamp: Lamp, table: Table,

  lightbulb: Lightbulb, 'sun-dim': SunDim, blinds: Blinds, 'panel-top': PanelTop,
  footprints: Footprints, mirror: FlipHorizontal2, sparkles: Sparkles,

  monitor: Monitor, tv: Tv, smartphone: Smartphone, bluetooth: Bluetooth, wifi: Wifi,
  usb: Usb, 'volume-2': Volume2, speaker: Speaker, headphones: Headphones, radio: Radio,
  mic: Mic, navigation: Navigation, projector: Projector, 'gamepad-2': Gamepad2, watch: Watch,

  shield: Shield, 'shield-check': ShieldCheck, 'shield-alert': ShieldAlert,
  'triangle-alert': TriangleAlert, siren: Siren, lock: Lock, 'key-round': KeyRound,
  fingerprint: Fingerprint, camera: Camera, video: Video, radar: Radar,
  'scan-eye': ScanEye, eye: Eye, 'square-parking': SquareParking,
  'octagon-alert': OctagonAlert, signpost: Signpost, 'bell-ring': BellRing,
  'life-ring': Cross, hand: Hand, 'phone-call': PhoneCall,

  'file-text': FileText, 'badge-check': BadgeCheck, 'calendar-days': CalendarDays,
  'map-pin': MapPin, hash: Hash, percent: Percent, star: Star, info: Info,
  'circle-check': CircleCheck, 'list-checks': ListChecks,
};

/** The component for a token, or null. Exported for the picker's own preview. */
export function glyphFor(token) {
  return GLYPHS[String(token ?? '')] ?? null;
}

export default function SpecGlyph({
  icon,
  className = 'h-4 w-4',
  fallback = Info,
  ...rest
}) {
  const Glyph = glyphFor(icon) ?? fallback;
  if (!Glyph) return null;

  /**
   * createElement rather than <Glyph />, and not for style.
   *
   * A capitalised local rendered as a JSX tag is what react-hooks reads as a
   * component CREATED during render — it cannot see that `glyphFor` only ever
   * returns one of the module-scope icons above, and a component made per
   * render would lose its state on every one. These are stateless marks out of
   * a frozen map, so the warning is wrong here; createElement says "render
   * this component type" instead of declaring a new tag, which is both the
   * honest description and the thing the rule is happy with.
   *
   * aria-hidden by default: every place this is drawn already shows the
   * specification's NAME beside it, so announcing the mark as well would read
   * the same thing twice. A caller that draws it alone passes its own label.
   */
  return createElement(Glyph, {
    className: `shrink-0 ${className}`,
    'aria-hidden': 'true',
    ...rest,
  });
}
