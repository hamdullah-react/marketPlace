/**
 * Help centre content.
 *
 * Plain data, not MDX — every article is bilingual, and a bilingual MDX
 * pipeline means two files per topic that drift apart the moment someone edits
 * one. Keeping the pair in a single object makes a missing translation visible
 * at a glance instead of being discovered by a reader.
 *
 * The content describes what this dashboard ACTUALLY does today. Where a
 * feature has a real limitation (views have no daily history; deleting photos
 * destroys the files) the article says so — a help page that oversells is
 * worse than none, because it turns a known limit into a suspected bug.
 *
 * Shared by server and client, so no imports and no secrets.
 */

export const HELP_CATEGORIES = [
  { id: 'listings', ar: 'الإعلانات', en: 'Listings' },
  { id: 'catalog', ar: 'الكتالوج', en: 'Catalog' },
  { id: 'media', ar: 'الصور', en: 'Photos' },
  { id: 'account', ar: 'المتجر والبيانات', en: 'Store & data' },
];

/**
 * @property slug      URL segment; never change one that has shipped
 * @property category  one of HELP_CATEGORIES
 * @property body      array of blocks: {p} paragraph, {steps} ordered list,
 *                     {list} bullets, {note} an aside worth pausing on
 */
export const HELP_ARTICLES = [
  {
    slug: 'add-a-car',
    category: 'listings',
    titleAr: 'كيف أضيف سيارة؟',
    titleEn: 'How do I add a car?',
    summaryAr: 'من اختيار السيارة من الكتالوج حتى النشر.',
    summaryEn: 'From picking the car out of the catalog to publishing it.',
    body: [
      {
        p: {
          ar: 'نموذج الإضافة مقسوم إلى خمس تبويبات. يمكنك التنقل بينها بحرية — لا شيء يُفقد عند الانتقال، فكل التبويبات تبقى محمّلة.',
          en: 'The add form is split across five tabs. Move between them freely — nothing is lost when you switch, because every tab stays loaded.',
        },
      },
      {
        steps: [
          { ar: 'السيارة: اختر الماركة، ثم الموديل، ثم السنة. الفئة والمدينة اختياريان عدا المدينة فهي مطلوبة.', en: 'The car: pick brand, then model, then year. City is required; trim is optional.' },
          { ar: 'الصور والألوان: أضف صوراً خارجية وداخلية، وحدّد الصورة الرئيسية.', en: 'Photos & colours: add exterior and interior shots, and choose the main photo.' },
          { ar: 'الحالة والسعر: جديد أو مستعمل، والممشى إن كانت مستعملة، ثم السعر.', en: 'Condition & price: new or used, the mileage if used, then the price.' },
          { ar: 'المواصفات: املأ ما تعرفه فقط — الحقول الفارغة لا تظهر للمشتري.', en: 'Specifications: fill in only what you know. Empty fields are hidden from buyers.' },
          { ar: 'التفاصيل: العنوان والوصف والرابط.', en: 'Details: title, description and the URL.' },
        ],
      },
      {
        note: {
          ar: 'زر الحفظ يبقى معطّلاً حتى تكتمل الحقول المطلوبة، ويعرض أسفله ما ينقص بالضبط. اضغط على اسم أي حقل ناقص للانتقال إلى تبويبه.',
          en: 'The save button stays disabled until the required fields are filled, and lists exactly what is missing underneath. Click any missing field name to jump to its tab.',
        },
      },
    ],
  },
  {
    slug: 'draft-review-publish',
    category: 'listings',
    titleAr: 'مسودة، مراجعة، أم نشر؟',
    titleEn: 'Draft, review, or publish?',
    summaryAr: 'الفرق بين الخيارات الثلاثة أسفل النموذج.',
    summaryEn: 'What the three choices at the bottom of the form actually do.',
    body: [
      {
        list: [
          { ar: 'مسودة — يُحفظ لك وحدك. لا يراه المشترون، ولا يحتاج صوراً.', en: 'Draft — saved for you only. Buyers cannot see it, and it does not need photos.' },
          { ar: 'للمراجعة — يُرسل للفريق للموافقة قبل ظهوره.', en: 'For review — sent to the team to approve before it appears.' },
          { ar: 'نشر — يظهر للمشترين مباشرة.', en: 'Publish — goes live and is visible to buyers immediately.' },
        ],
      },
      {
        p: {
          ar: 'تعديل إعلان منشور يبقيه منشوراً. الطريقة الوحيدة لإنزاله هي اختيار «مسودة» ثم الحفظ.',
          en: 'Editing a live listing keeps it live. The only way to take it down is to choose Draft and save.',
        },
      },
      {
        note: {
          ar: 'الصور مطلوبة للمراجعة والنشر، وغير مطلوبة للمسودة. سيارة بلا صورة لا تحصل على نقرات.',
          en: 'Photos are required for review and publish, but not for a draft. A car with no photo gets no clicks.',
        },
      },
    ],
  },
  {
    slug: 'main-photo',
    category: 'media',
    titleAr: 'الصورة الرئيسية والصور الداخلية',
    titleEn: 'The main photo, and interior shots',
    summaryAr: 'أي صورة تظهر في البطاقة ونتائج البحث.',
    summaryEn: 'Which photo shows on the card and in search results.',
    body: [
      {
        p: {
          ar: 'الصور مقسومة إلى مجموعتين: خارجية وداخلية. المجموعة الخارجية تأتي أولاً لأن البطاقة ونتائج البحث تستخدم صورة خارجية.',
          en: 'Photos are split into two buckets: exterior and interior. Exterior leads, because the card and search results use an outside shot.',
        },
      },
      {
        p: {
          ar: 'مرّر المؤشر على أي صورة واضغط «رئيسية» لجعلها صورة الغلاف. صورة واحدة فقط يمكن أن تكون رئيسية، واختيار أخرى ينقل الوسم إليها.',
          en: 'Hover any photo and press “Set main” to make it the cover. Only one photo can hold it; choosing another moves the badge.',
        },
      },
      {
        note: {
          ar: 'إن لم تختر صورة رئيسية، تُستخدم أول صورة خارجية تلقائياً.',
          en: 'If you never choose one, the first exterior photo is used automatically.',
        },
      },
    ],
  },
  {
    slug: 'reuse-photos',
    category: 'media',
    titleAr: 'مكتبة الصور',
    titleEn: 'The photo library',
    summaryAr: 'ارفع مرة واحدة، واستخدم الصورة في أكثر من إعلان.',
    summaryEn: 'Upload once, then reuse a photo across listings.',
    body: [
      {
        p: {
          ar: 'كل صورة ترفعها تُحفظ في مكتبتك. عند إضافة صور لإعلان جديد ستجد المكتبة كاملة أمامك — لا حاجة لرفع نفس الصورة مرتين.',
          en: 'Every photo you upload is kept in your library. When you add photos to a new listing the whole library is there — no need to upload the same file twice.',
        },
      },
      {
        list: [
          { ar: 'الحد الأقصى لحجم الملف: ٨ ميجابايت.', en: 'Maximum file size: 8 MB.' },
          { ar: 'الصيغ المدعومة: JPEG، PNG، WebP، AVIF، SVG.', en: 'Accepted formats: JPEG, PNG, WebP, AVIF, SVG.' },
        ],
      },
    ],
  },
  {
    slug: 'catalog-basics',
    category: 'catalog',
    titleAr: 'ما هو الكتالوج؟',
    titleEn: 'What is the catalog?',
    summaryAr: 'الماركات والموديلات والمواصفات المشتركة بين كل البائعين.',
    summaryEn: 'The brands, models and specifications every seller shares.',
    body: [
      {
        p: {
          ar: 'الكتالوج بيانات مرجعية مشتركة: الماركات، الموديلات، الفئات، السنوات، الألوان، الخيارات، والمواصفات. تعديل أي منها يظهر لكل البائعين، لا لك وحدك.',
          en: 'The catalog is shared reference data: brands, models, trims, years, colours, options and specifications. An edit here is visible to every seller, not just you.',
        },
      },
      {
        note: {
          ar: 'لهذا السبب الحذف محمي: إن كان العنصر مستخدماً في إعلان قائم فسيُرفض حذفه، ويُعرض عليك تعطيله بدلاً من ذلك.',
          en: 'That is why deleting is guarded: if an entry is used by a live listing the delete is refused, and you are offered deactivate instead.',
        },
      },
    ],
  },
  {
    slug: 'spec-options',
    category: 'catalog',
    titleAr: 'إضافة خيارات لمواصفة',
    titleEn: 'Giving a specification its options',
    summaryAr: 'لماذا تظهر «أضف الخيارات من الكتالوج» في نموذج الإعلان.',
    summaryEn: 'Why the listing form says “Add options in Catalog”.',
    body: [
      {
        p: {
          ar: 'كل مواصفة لها «نوع حقل»: نص، رقم، نعم/لا، اختيار واحد، أو اختيار متعدد. النوعان الأخيران يحتاجان قائمة خيارات يختار منها البائع.',
          en: 'Every specification has a field type: text, number, yes/no, single choice, or multiple choice. The last two need a list of options for the seller to choose from.',
        },
      },
      {
        steps: [
          { ar: 'افتح الكتالوج ← المواصفات.', en: 'Open Catalog → Specifications.' },
          { ar: 'عدّل المواصفة واختر نوع الحقل «select» أو «multi».', en: 'Edit the specification and set its field type to select or multi.' },
          { ar: 'ستظهر لوحة «الخيارات» — أضف كل خيار بالعربية والإنجليزية.', en: 'An Options panel appears — add each choice in Arabic and English.' },
        ],
      },
      {
        note: {
          ar: 'حتى تضيف الخيارات، يعرض نموذج الإعلان «أضف الخيارات من الكتالوج» بدل صندوق نص. هذا مقصود: النص الحر في حقل خيارات هو ما يجعل «أوتوماتيك» و«Automatic» قيمتين مختلفتين.',
          en: 'Until you add them, the listing form shows “Add options in Catalog” instead of a text box. That is deliberate: free text in a choice field is what makes “Automatic” and “automatic” two different values.',
        },
      },
    ],
  },
  {
    slug: 'languages',
    category: 'account',
    titleAr: 'العربية والإنجليزية',
    titleEn: 'Arabic and English',
    summaryAr: 'اختر لغة الإدخال، ومتى تظهر الحقول باللغتين.',
    summaryEn: 'Choose your authoring language, and when both fields appear.',
    body: [
      {
        p: {
          ar: 'من الإعدادات ← اللغة والتفضيلات، اختر اللغة التي تكتب بها عادة: العربية، الإنجليزية، أو الاثنتان.',
          en: 'Under Settings → Language & preferences, choose the language you normally write in: Arabic, English, or both.',
        },
      },
      {
        list: [
          { ar: 'العربية أو الإنجليزية — يظهر صندوق واحد لكل حقل.', en: 'Arabic or English — one box per field.' },
          { ar: 'الاثنتان — يظهر زر «اللغتان» بجانب الحقل، يفتح نافذة تحوي اللغتين معاً.', en: 'Both — a “Both” button appears beside the field, opening a dialog with both languages.' },
        ],
      },
      {
        p: {
          ar: 'مهما كان اختيارك، تُحفظ اللغتان دائماً. تغيير اللغة لاحقاً لا يمحو ترجمة كتبتها من قبل.',
          en: 'Whatever you choose, both languages are always saved. Switching later never discards a translation you already wrote.',
        },
      },
    ],
  },
  {
    slug: 'backups-and-deleting',
    category: 'account',
    titleAr: 'النسخ الاحتياطي وحذف البيانات',
    titleEn: 'Backups and deleting your data',
    summaryAr: 'كيف تأخذ نسخة، وماذا يحدث بالضبط عند الحذف.',
    summaryEn: 'How to take a backup, and exactly what deleting removes.',
    body: [
      {
        p: {
          ar: 'من الإعدادات ← البيانات يمكنك إنشاء نسخة احتياطية بصيغة JSON في أي وقت. تُحفظ في مساحة خاصة، ورابط التنزيل يُنشأ عند الضغط وينتهي بعد ساعة.',
          en: 'Under Settings → Data you can create a JSON backup at any time. It is kept in private storage, and the download link is minted on click and expires after an hour.',
        },
      },
      {
        p: {
          ar: 'حذف البيانات يمسح إعلاناتك وصورك واستفساراتك، ومدخلات الكتالوج التي أنشأتها بنفسك ولم تُعتمد. متجرك يبقى مفتوحاً.',
          en: 'Deleting your data clears your listings, photos and leads, plus any catalog entries you created that staff has not approved. Your store stays open.',
        },
      },
      {
        note: {
          ar: 'الطلبات المكتملة تبقى — فهي سجل المشتري والمحاسبة. والأهم: ملفات الصور تُحذف نهائياً، والنسخة الاحتياطية تحتوي سجلاتها لا الصور نفسها، فاستعادتها تعيد السجلات دون الملفات.',
          en: 'Completed orders are kept — they are the buyer’s receipt and the accounting record. More importantly: the image FILES are deleted permanently. A backup holds their records, not the pictures, so restoring brings the rows back without the files.',
        },
      },
    ],
  },
  {
    slug: 'views-and-analytics',
    category: 'account',
    titleAr: 'قراءة صفحة التحليلات',
    titleEn: 'Reading the analytics page',
    summaryAr: 'ما تعنيه الأرقام، وما لا تستطيع الصفحة عرضه بعد.',
    summaryEn: 'What the numbers mean, and what the page cannot show yet.',
    body: [
      {
        list: [
          { ar: 'إجمالي المشاهدات — مجموع المشاهدات منذ نشر كل إعلان.', en: 'Total views — the sum of views since each listing was published.' },
          { ar: 'مشاهدات لكل إعلان منشور — المتوسط على المنشور فقط، حتى لا تسحب المسودات الرقم للأسفل.', en: 'Views per live listing — averaged over live listings only, so drafts do not drag the number down.' },
          { ar: 'النشاط — عدد الإعلانات والعملاء المحتملين حسب تاريخ الإضافة.', en: 'Activity — listings and leads by the date they were added.' },
        ],
      },
      {
        note: {
          ar: 'لا يوجد رسم بياني للمشاهدات عبر الزمن. المشاهدات مخزّنة كعدّاد تراكمي لكل إعلان بلا سجل يومي، فأي منحنى زمني سيكون مُختلقاً. سيصبح ممكناً عند بدء تسجيل المشاهدات كأحداث.',
          en: 'There is no views-over-time chart. Views are stored as one cumulative counter per listing with no daily history, so any trend line would be invented. It becomes possible once views are recorded as events.',
        },
      },
    ],
  },
];

export const findArticle = (slug) => HELP_ARTICLES.find((a) => a.slug === slug) ?? null;

export const articlesIn = (categoryId) =>
  HELP_ARTICLES.filter((a) => a.category === categoryId);
