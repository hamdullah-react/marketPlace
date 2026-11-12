/**
 * The icon vocabulary a specification may wear.
 *
 * ── Why this replaced the icon URLs ────────────────────────────────────────
 *
 * `spec_attributes.attribute_icon_url` and `category_icon_url` held links to
 * SVG files — two-tone hexagons with a symbol knocked out of them — that were
 * SCRAPED FROM ANOTHER COMPANY'S SITE along with the 79-row specification
 * template. They live in this deployment's bucket, which made them look like
 * ours; they are not, and a marketplace sold to somebody else must not ship
 * another dealership's artwork as its own.
 *
 * They were also awkward in every other way: an icon was a file somebody had to
 * upload before a specification could have one, the files are raster-like SVGs
 * that CSS cannot tint (hence SpecIcon's per-request colour substitution route
 * and its `brightness-0 invert` hack), and a seller adding "Sunroof" had no way
 * to give it a mark at all.
 *
 * So an icon is now a TOKEN naming one of the icons this application already
 * ships — `fuel`, `snowflake`, `shield-check` — resolved to a component by
 * ui/SpecGlyph.jsx. It inherits `currentColor`, so it follows the showroom's
 * theme with nothing substituted and nothing cached; it needs no upload; and
 * the set is closed, so a seller cannot point an icon at a tracking pixel on
 * somebody else's host. The same argument §20's form styles and §25.1's badge
 * colours make, applied to catalog marks.
 *
 * ── Why a curated list rather than all of lucide ──────────────────────────
 *
 * lucide-react ships 1,600-odd icons. A picker over all of them would mean
 * importing all of them into the browser — around a megabyte to let somebody
 * choose a mark for "Turbo" — and a search across 1,600 names returns
 * `AlignHorizontalDistributeCenter` when a seller types "car".
 *
 * These are the ones a car actually needs, each with Arabic and English search
 * words, because a seller typing "مقاعد" has to find the seat icon. Adding one
 * is two lines here plus one import in SpecGlyph.
 */

/**
 * token → the icon's own name and what finds it.
 *
 * `token` is what goes in the database. It is kebab-case and stable: renaming
 * one orphans every row that stored it, so a token is never changed, only
 * added. SpecGlyph falls back to a neutral mark for a token it does not know,
 * which is what makes adding and removing entries here safe.
 */
export const SPEC_ICONS = [
  /* ── The car itself ───────────────────────────────────────────────────── */
  { token: 'car', ar: 'سيارة', en: 'Car', keywords: 'سيارة مركبة vehicle auto' },
  { token: 'car-front', ar: 'مقدمة السيارة', en: 'Car front', keywords: 'امامي front bonnet' },
  { token: 'truck', ar: 'شاحنة', en: 'Truck', keywords: 'شاحنة نقل pickup lorry' },
  { token: 'bus', ar: 'باص', en: 'Van', keywords: 'باص فان حافلة van bus' },
  { token: 'caravan', ar: 'كرفان', en: 'Caravan', keywords: 'كرفان مقطورة trailer' },
  { token: 'bike', ar: 'دراجة', en: 'Bike', keywords: 'دراجة موتور motorcycle' },

  /* ── Engine, fuel, drivetrain ─────────────────────────────────────────── */
  { token: 'engine', ar: 'محرك', en: 'Engine', keywords: 'محرك مكينة motor engine cylinder' },
  { token: 'fuel', ar: 'وقود', en: 'Fuel', keywords: 'وقود بنزين ديزل تانكي petrol diesel tank' },
  { token: 'flame', ar: 'احتراق', en: 'Combustion', keywords: 'احتراق حرارة شعلة burn heat turbo' },
  { token: 'gauge', ar: 'عداد', en: 'Gauge', keywords: 'عداد قياس سرعة speed meter rpm' },
  { token: 'gauge-circle', ar: 'قياس', en: 'Meter', keywords: 'قياس عداد ضغط pressure measure' },
  { token: 'cog', ar: 'تروس', en: 'Gears', keywords: 'تروس جير ناقل gearbox transmission' },
  { token: 'settings', ar: 'ميكانيكا', en: 'Mechanical', keywords: 'ميكانيكا ضبط setup mechanical' },
  { token: 'bolt', ar: 'قوة', en: 'Power', keywords: 'قوة حصان عزم power torque horsepower' },
  { token: 'activity', ar: 'أداء', en: 'Performance', keywords: 'اداء تسارع performance acceleration' },
  { token: 'timer', ar: 'مؤقت', en: 'Timer', keywords: 'وقت تسارع ثانية time seconds 0-100' },
  { token: 'leaf', ar: 'انبعاثات', en: 'Emissions', keywords: 'انبعاثات بيئة نظيف eco green emission' },
  { token: 'recycle', ar: 'استرجاع', en: 'Recovery', keywords: 'استرجاع تدوير regen recycle' },
  { token: 'wrench', ar: 'صيانة', en: 'Service', keywords: 'صيانة ورشة اصلاح service repair' },
  { token: 'droplet', ar: 'سائل', en: 'Fluid', keywords: 'زيت سائل ماء oil fluid consumption' },
  { token: 'wind', ar: 'هواء', en: 'Air', keywords: 'هواء شفط تيربو air intake turbo aero' },

  /* ── Electric and hybrid ──────────────────────────────────────────────── */
  { token: 'zap', ar: 'كهرباء', en: 'Electric', keywords: 'كهرباء كهربائي electric ev volt' },
  { token: 'battery', ar: 'بطارية', en: 'Battery', keywords: 'بطارية battery kwh' },
  { token: 'battery-charging', ar: 'شحن', en: 'Charging', keywords: 'شحن بطارية charge charging' },
  { token: 'plug', ar: 'قابس', en: 'Plug', keywords: 'قابس شاحن منفذ plug socket charger' },
  { token: 'plug-zap', ar: 'شحن سريع', en: 'Fast charge', keywords: 'شحن سريع dc fast charge' },
  { token: 'cable', ar: 'كيبل', en: 'Cable', keywords: 'كيبل سلك cable wire' },
  { token: 'cpu', ar: 'وحدة تحكم', en: 'Control unit', keywords: 'كمبيوتر وحدة ecu computer chip' },
  { token: 'route', ar: 'مدى', en: 'Range', keywords: 'مدى مسافة range distance km' },

  /* ── Dimensions, weight, capacity ─────────────────────────────────────── */
  { token: 'ruler', ar: 'قياس', en: 'Dimension', keywords: 'طول عرض ارتفاع قياس length width height mm' },
  { token: 'move-horizontal', ar: 'العرض', en: 'Width', keywords: 'عرض مسافة width wheelbase' },
  { token: 'move-vertical', ar: 'الارتفاع', en: 'Height', keywords: 'ارتفاع خلوص height clearance' },
  { token: 'scaling', ar: 'أبعاد', en: 'Size', keywords: 'ابعاد حجم size scale' },
  { token: 'weight', ar: 'الوزن', en: 'Weight', keywords: 'وزن حمولة weight kg payload' },
  { token: 'scale', ar: 'الحمولة', en: 'Load', keywords: 'حمولة وزن توازن load balance gvw' },
  { token: 'luggage', ar: 'الشنطة', en: 'Boot', keywords: 'شنطة صندوق امتعة boot trunk luggage cargo' },
  { token: 'package', ar: 'سعة', en: 'Capacity', keywords: 'سعة حجم لتر capacity volume litre' },
  { token: 'door-open', ar: 'الأبواب', en: 'Doors', keywords: 'باب ابواب door doors' },
  { token: 'users', ar: 'المقاعد', en: 'Occupants', keywords: 'مقاعد اشخاص راكب seats passengers' },
  { token: 'rotate-cw', ar: 'دوران', en: 'Turning', keywords: 'دوران انعطاف turning radius' },
  { token: 'anchor', ar: 'سحب', en: 'Towing', keywords: 'سحب قطر جر tow towing hitch' },

  /* ── Chassis, suspension, brakes, wheels ──────────────────────────────── */
  { token: 'disc', ar: 'فرامل', en: 'Brakes', keywords: 'فرامل بريك ديسك brake disc' },
  { token: 'disc-3', ar: 'جنط', en: 'Wheel', keywords: 'جنط عجل اطار wheel rim alloy' },
  { token: 'circle-dot', ar: 'إطارات', en: 'Tyres', keywords: 'اطار كفر tyre tire' },
  { token: 'waves', ar: 'تعليق', en: 'Suspension', keywords: 'تعليق مساعد ممتص suspension damper' },
  { token: 'mountain', ar: 'طرق وعرة', en: 'Off-road', keywords: 'وعر طين رمل offroad terrain 4x4' },
  { token: 'layers', ar: 'الهيكل', en: 'Structure', keywords: 'هيكل شاسي بناء chassis body structure' },
  { token: 'life-buoy', ar: 'المقود', en: 'Steering', keywords: 'مقود توجيه steering wheel' },
  { token: 'compass', ar: 'اتجاه', en: 'Direction', keywords: 'اتجاه دفع جر direction drive awd' },

  /* ── Climate and comfort ──────────────────────────────────────────────── */
  { token: 'snowflake', ar: 'تبريد', en: 'Cooling', keywords: 'مكيف تبريد برد ac cold cooling climate' },
  { token: 'air-vent', ar: 'فتحات التكييف', en: 'Air vents', keywords: 'فتحة تكييف هواء vent ac' },
  { token: 'fan', ar: 'مروحة', en: 'Fan', keywords: 'مروحة تهوية fan blower ventilated' },
  { token: 'thermometer', ar: 'حرارة', en: 'Temperature', keywords: 'حرارة درجة temperature thermometer' },
  { token: 'heater', ar: 'تدفئة', en: 'Heating', keywords: 'تدفئة مدفأة سخان heater heated warm' },
  { token: 'sun', ar: 'شمس', en: 'Sun', keywords: 'شمس سقف فتحة sun sunroof shade' },
  { token: 'umbrella', ar: 'مطر', en: 'Rain', keywords: 'مطر ممسحة rain wiper' },
  { token: 'cloud-rain', ar: 'مساحات', en: 'Wipers', keywords: 'مساحة ممسحة مطر wiper rain sensing' },
  { token: 'droplets', ar: 'غسيل', en: 'Washer', keywords: 'غسيل ماء washer spray' },

  /* ── Seats and interior ───────────────────────────────────────────────── */
  { token: 'armchair', ar: 'مقعد', en: 'Seat', keywords: 'مقعد كرسي seat chair' },
  { token: 'sofa', ar: 'المقاعد الخلفية', en: 'Rear seats', keywords: 'مقاعد خلفي بنش rear bench seats' },
  { token: 'bed', ar: 'انحناء المقعد', en: 'Recline', keywords: 'استلقاء انحناء recline flat' },
  { token: 'rows-3', ar: 'صفوف', en: 'Rows', keywords: 'صفوف صف row rows third' },
  { token: 'baby', ar: 'مقعد أطفال', en: 'Child seat', keywords: 'طفل اطفال isofix child baby' },
  { token: 'crown', ar: 'فخامة', en: 'Luxury', keywords: 'فخامة جلد luxury premium leather' },
  { token: 'palette', ar: 'الألوان', en: 'Colour', keywords: 'لون فرش تنجيد colour trim upholstery' },
  { token: 'gem', ar: 'كماليات', en: 'Trim', keywords: 'كروم زينة chrome trim ornament' },
  { token: 'frame', ar: 'إطار داخلي', en: 'Panel', keywords: 'لوحة طبلون panel dashboard' },
  { token: 'lamp', ar: 'إضاءة داخلية', en: 'Interior light', keywords: 'اضاءة داخلي محيطية ambient light' },
  { token: 'table', ar: 'طاولة', en: 'Tray', keywords: 'طاولة مسند tray table armrest' },

  /* ── Lights and exterior ──────────────────────────────────────────────── */
  { token: 'lightbulb', ar: 'مصابيح', en: 'Lights', keywords: 'مصباح ضوء لمبة light lamp led headlight' },
  { token: 'sun-dim', ar: 'أضواء نهارية', en: 'Daytime lights', keywords: 'نهاري drl daytime running' },
  { token: 'blinds', ar: 'زجاج', en: 'Glass', keywords: 'زجاج تظليل نافذة window glass tint' },
  { token: 'panel-top', ar: 'السقف', en: 'Roof', keywords: 'سقف شبك roof rail panoramic' },
  { token: 'footprints', ar: 'عتبات', en: 'Side steps', keywords: 'عتبة درجة step running board' },
  { token: 'mirror', ar: 'مرايا', en: 'Mirrors', keywords: 'مرايا مرآة mirror side rear' },
  { token: 'sparkles', ar: 'مظهر', en: 'Styling', keywords: 'مظهر شكل اضافات styling kit spoiler' },

  /* ── Infotainment and connectivity ────────────────────────────────────── */
  { token: 'monitor', ar: 'شاشة', en: 'Screen', keywords: 'شاشة عرض screen display touchscreen' },
  { token: 'tv', ar: 'ترفيه', en: 'Entertainment', keywords: 'ترفيه شاشة خلفية entertainment tv' },
  { token: 'smartphone', ar: 'الجوال', en: 'Phone', keywords: 'جوال هاتف تطبيق phone carplay android app' },
  { token: 'bluetooth', ar: 'بلوتوث', en: 'Bluetooth', keywords: 'بلوتوث bluetooth' },
  { token: 'wifi', ar: 'واي فاي', en: 'Wi-Fi', keywords: 'واي فاي انترنت wifi hotspot internet' },
  { token: 'usb', ar: 'منفذ USB', en: 'USB', keywords: 'يو اس بي منفذ usb port charger' },
  { token: 'volume-2', ar: 'الصوت', en: 'Audio', keywords: 'صوت سماعة مكبر audio sound speaker' },
  { token: 'speaker', ar: 'سماعات', en: 'Speakers', keywords: 'سماعات مكبرات speakers subwoofer' },
  { token: 'headphones', ar: 'نظام صوتي', en: 'Sound system', keywords: 'نظام صوتي سماعات bose jbl sound' },
  { token: 'radio', ar: 'راديو', en: 'Radio', keywords: 'راديو اف ام radio fm am' },
  { token: 'mic', ar: 'الأوامر الصوتية', en: 'Voice control', keywords: 'صوت امر مايك voice mic command' },
  { token: 'navigation', ar: 'ملاحة', en: 'Navigation', keywords: 'ملاحة خريطة جي بي اس navigation gps map' },
  { token: 'projector', ar: 'العرض الأمامي', en: 'Head-up display', keywords: 'شاشة امامية hud head up display' },
  { token: 'gamepad-2', ar: 'تحكم', en: 'Controls', keywords: 'تحكم ازرار control buttons joystick' },
  { token: 'watch', ar: 'ساعة', en: 'Clock', keywords: 'ساعة وقت clock time' },

  /* ── Safety and security ──────────────────────────────────────────────── */
  { token: 'shield', ar: 'حماية', en: 'Protection', keywords: 'حماية امان shield protection' },
  { token: 'shield-check', ar: 'أمان', en: 'Safety', keywords: 'امان سلامة safety secure airbag' },
  { token: 'shield-alert', ar: 'تحذير', en: 'Warning', keywords: 'تحذير انتباه warning alert' },
  { token: 'triangle-alert', ar: 'تنبيه', en: 'Alert', keywords: 'تنبيه خطر hazard alert warning' },
  { token: 'siren', ar: 'إنذار', en: 'Alarm', keywords: 'انذار سرقة alarm theft siren' },
  { token: 'lock', ar: 'قفل', en: 'Lock', keywords: 'قفل اغلاق lock locking central' },
  { token: 'key-round', ar: 'مفتاح', en: 'Key', keywords: 'مفتاح ريموت key remote keyless' },
  { token: 'fingerprint', ar: 'بصمة', en: 'Fingerprint', keywords: 'بصمة تعريف fingerprint immobiliser' },
  { token: 'camera', ar: 'كاميرا', en: 'Camera', keywords: 'كاميرا camera rear 360' },
  { token: 'video', ar: 'تسجيل', en: 'Recorder', keywords: 'تسجيل كاميرا dashcam video record' },
  { token: 'radar', ar: 'رادار', en: 'Radar', keywords: 'رادار حساس radar sensor parking' },
  { token: 'scan-eye', ar: 'مراقبة', en: 'Monitoring', keywords: 'مراقبة استشعار blind spot monitor detect' },
  { token: 'eye', ar: 'رؤية', en: 'Vision', keywords: 'رؤية نظر vision view camera' },
  { token: 'square-parking', ar: 'الركن', en: 'Parking', keywords: 'ركن وقوف parking assist sensor' },
  { token: 'octagon-alert', ar: 'فرملة طارئة', en: 'Emergency braking', keywords: 'فرملة طارئة توقف aeb emergency brake' },
  { token: 'signpost', ar: 'المسار', en: 'Lane', keywords: 'مسار خط حارة lane keeping departure' },
  { token: 'bell-ring', ar: 'تنبيه صوتي', en: 'Chime', keywords: 'تنبيه جرس صوت chime warning bell' },
  { token: 'life-ring', ar: 'إسعاف', en: 'First aid', keywords: 'اسعاف طفاية حريق first aid extinguisher' },
  { token: 'hand', ar: 'مساعدة', en: 'Assist', keywords: 'مساعدة دعم assist hold help' },
  { token: 'phone-call', ar: 'نداء الطوارئ', en: 'Emergency call', keywords: 'طوارئ اتصال sos emergency call' },

  /* ── Paperwork, record, warranty ──────────────────────────────────────── */
  { token: 'file-text', ar: 'مستند', en: 'Document', keywords: 'ورق مستند استمارة document paper record' },
  { token: 'badge-check', ar: 'ضمان', en: 'Warranty', keywords: 'ضمان معتمد warranty certified' },
  { token: 'calendar-days', ar: 'تاريخ', en: 'Date', keywords: 'تاريخ سنة شهر date year month' },
  { token: 'map-pin', ar: 'المواصفة الإقليمية', en: 'Regional spec', keywords: 'خليجي امريكي اوروبي gcc regional origin' },
  { token: 'hash', ar: 'رقم', en: 'Number', keywords: 'رقم عدد number count' },
  { token: 'percent', ar: 'نسبة', en: 'Percentage', keywords: 'نسبة مئوية percent ratio' },
  { token: 'star', ar: 'تقييم', en: 'Rating', keywords: 'تقييم نجمة rating star' },
  { token: 'info', ar: 'معلومة', en: 'Info', keywords: 'معلومة تفاصيل info detail other' },
  { token: 'circle-check', ar: 'متوفر', en: 'Included', keywords: 'متوفر موجود included available check' },
  { token: 'list-checks', ar: 'قائمة', en: 'Checklist', keywords: 'قائمة مواصفات list checklist spec' },
];

/** token → the entry, for a lookup that does not scan. */
export const SPEC_ICON_BY_TOKEN = new Map(SPEC_ICONS.map((i) => [i.token, i]));

/** Is this a token the picker and SpecGlyph both know? */
export const isSpecIcon = (token) => SPEC_ICON_BY_TOKEN.has(String(token ?? ''));

/**
 * The icons matching what somebody typed, in both languages at once.
 *
 * Matching runs over the token, both names and the keyword line, so "برد",
 * "cold" and "snow" all reach the snowflake. An empty query returns everything
 * — the picker opens on the whole set rather than on nothing, because browsing
 * 130 marks is how somebody who does not know what to type finds one.
 */
export function searchSpecIcons(query = '') {
  const q = String(query).trim().toLowerCase();
  if (!q) return SPEC_ICONS;

  return SPEC_ICONS.filter((i) =>
    `${i.token} ${i.ar} ${i.en} ${i.keywords}`.toLowerCase().includes(q)
  );
}
