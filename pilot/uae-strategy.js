// UAE food security monitor - PILOT for government decision support, kept outside the dashboard until reviewed.
// Renders data/strategy/uae-tracker.json (computed by scripts/build-uae-strategy.cjs) and the sourced register
// data/strategy/uae-register.json. All analysis text comes from the build, in English and Arabic (Arabic is a
// draft translation). Figures a user enters (reserve cover, decision status) stay in this browser only.

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const safeUrl = (value) => { try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } };
const MONTH_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const day = (iso) => LANG === "ar" ? `${Number(iso.slice(8, 10))} ${MONTH_AR[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayEn = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fmt = (value, digits = 0) => Number(value).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });

// Browser storage can be blocked (private windows, policies); everything still works for the session.
const memory = new Map();
const store = {
  get(key, fallback) { try { const value = localStorage.getItem(key); return value === null ? (memory.has(key) ? memory.get(key) : fallback) : JSON.parse(value); } catch { return memory.has(key) ? memory.get(key) : fallback; } },
  set(key, value) { memory.set(key, value); try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* session only */ } },
};
let LANG = new URLSearchParams(location.search).get("lang") === "ar" ? "ar" : store.get("uae-pilot-lang", "en") === "ar" ? "ar" : "en";

// Interface text. Arabic is a draft translation for native-speaker review.
const T = {
  en: {
    banner: ["Pilot for review", "Draft decision-support analysis from public data; not an official assessment."],
    eyebrow: "Food security monitor · Pilot · United Arab Emirates",
    title: "What needs a decision now, and are commitments being delivered?",
    subtitle: "For government decision-makers: supplier-risk alerts matched to the UAE's import dependence, a decision note with suggested leads and timeframes, a planner to test the loss of a supplier, and a tracker that separates announcements from delivery.",
    lang: "العربية", toNote: "Decision note",
    situation: (d) => `Situation: day ${d} of the Strait of Hormuz disruption`,
    situationSub: (start) => `Since ${start}. The single largest risk to UAE food supply today; the alerts below are read against it.`,
    computed: "computed",
    alerts: "Supplier-risk alerts", alertsSub: "Events in supplier countries and world markets, matched to how much the UAE depends on each origin. Every fact links to its source; exposure and price signals are computed.",
    happened: "What happened", exposure: "UAE exposure", decision: "Decision needed", lead: "Suggested lead", also: "Also involved", timeframe: "Timeframe", response: "Suggested response", watch: "Indicator to watch", sources: "Sources",
    since: (m) => `Since ${m}`, m3: "3 months", m12: "12 months",
    level: { critical: "Critical", high: "High", watch: "Watch", clear: "Clear" },
    levelsNote: (m) => `Critical and high need a decision now; watch means monitor; clear means checked with no current restriction found. Price signals compare the latest World Bank month with ${m}, three months and a year earlier; an alert is never rated below its price signal.`,
    imports: (name, year) => `${name} imports ${year}`,
    note: "Decision note", noteSub: "For the responsible ministries and coordinating committees. Set the status of each decision; it is saved in this browser only.",
    word: "Download Word", print: "Print / PDF", exportDecisions: "Export decisions (CSV)",
    status: "Status", statuses: { open: "Not started", progress: "In progress", done: "Done", na: "Not needed" },
    planner: "What if we lose a supplier?", plannerSub: "Test the loss of one origin for any staple. Uses each country's 2023 share of UAE imports; illustrative, not a forecast.",
    staple: "Staple", origin: "Origin lost", weeks: "Disruption (weeks)", scale: "Other origins can raise shipments by", cover: "Reserve cover (days)", coverHint: "Optional; filled from your data below",
    lost: (o, s, st) => `Losing ${o} removes ${s}% of normal ${st} imports.`,
    replaced: (n, u, r, g) => `If the other ${n} origins raise shipments by ${u}%, they replace ${r} percentage points; the shortfall is ${g}% of normal supply.`,
    fullyCovered: "At that rate the other origins can close the gap.",
    need: (w, d) => `Over ${w} weeks that requires about ${d} days of reserve cover.`,
    enough: (d, x) => `With ${d} days of cover, reserves last about ${x} weeks at this shortfall: enough for the disruption.`,
    short: (d, x, g) => `With ${d} days of cover, reserves last about ${x} weeks at this shortfall, ${g} weeks short of the disruption.`,
    noCover: "Enter days of reserve cover to see how long reserves would last.",
    outcome: { covered: "Gap covered", reserves: "Covered by reserves", short: "Reserves run short", data: "Reserve data needed" },
    alternatives: "Largest alternative origins (2023)", plannerCaveat: "Imports include re-exports and exclude local production; read the results as an order of magnitude.",
    own: "Your data: reserve cover for the essential goods", ownSub: "Enter days of cover for the nine price-approved goods. The figures stay in this browser: nothing is uploaded or shared.",
    good: "Essential good", days: "Days of cover", eff: "Effective suppliers (2023)", alert: "Alert", priority: "Priority",
    threshold: "Flag cover below (days)", importCsv: "Import CSV", exportCsv: "Export CSV", clear: "Clear",
    prio: { high: "High", medium: "Medium", low: "Low", enter: "Enter cover" },
    prioNote: "Priority combines your reserve cover, supplier concentration and current alerts.",
    commitments: "Commitments: from announcement to delivery", commitmentsSub: "Each commitment with the measures that implement it, sorted by how far they have moved: from preparatory activity and announcements to agreements, financing, operations and reported results.",
    stages: { preparatory: "Preparatory", announced: "Announced", adopted: "Agreed or adopted", financed: "Financed", operational: "Operational", results: "Results reported" },
    commit: { delivering: "Delivering", moving: "Moving", announcements: "Announcements only", stalled: "Stalled", "no-action": "No action found" },
    latest: "Latest delivery", outside: "Outside the record",
    followThrough: (p, n, d) => `${p}% of the ${n} related measures since ${d} went beyond an announcement.`,
    commitMethod: "Measures are matched to each commitment from their wording and staged by keywords (for example \"inaugurated\" = operational, \"approved\" or \"signed\" = agreed or adopted). Statements of intent (\"will\", \"plans to\", a memorandum \"to explore\") never count as operations or results. Indicative: an analyst should review the matches.",
    verify: { official: "Official", press: "Press-reported", pending: "Pending document" },
    deep: "Strategy pillars in depth", deepSub: (y) => `The longer-term reading of each strategy pillar against international data. Trade data run to ${y}.`,
    foot: (d) => `Pilot generated ${d} · Policy Intelligence, GCC States & Yemen`,
  },
  ar: {
    banner: ["نسخة تجريبية للمراجعة", "تحليل أولي لدعم القرار مستند إلى بيانات عامة، وليس تقييماً رسمياً."],
    eyebrow: "مرصد الأمن الغذائي · نسخة تجريبية · الإمارات العربية المتحدة",
    title: "ما الذي يتطلب قراراً الآن، وهل يجري تنفيذ الالتزامات؟",
    subtitle: "لصنّاع القرار الحكوميين: تنبيهات مخاطر الموردين مقرونة باعتماد الإمارات على الواردات، ومذكرة قرار تتضمن الجهات المقترحة والأطر الزمنية، وأداة لاختبار أثر فقدان مورد، ومتابعة تميّز بين الإعلانات والتنفيذ الفعلي.",
    lang: "English", toNote: "مذكرة القرار",
    situation: (d) => `الوضع الراهن: اليوم ${d} من اضطراب مضيق هرمز`,
    situationSub: (start) => `منذ ${start}. أكبر خطر منفرد على إمدادات الغذاء في الإمارات اليوم، وتُقرأ التنبيهات أدناه في ضوئه.`,
    computed: "محسوب",
    alerts: "تنبيهات مخاطر الموردين", alertsSub: "أحداث في الدول المورّدة والأسواق العالمية مقرونة بمدى اعتماد الإمارات على كل مصدر. كل معلومة مرتبطة بمصدرها، أما التعرّض وإشارات الأسعار فمحسوبة.",
    happened: "ما الذي حدث", exposure: "تعرّض الإمارات", decision: "القرار المطلوب", lead: "الجهة المقترحة للقيادة", also: "جهات معنية أخرى", timeframe: "الإطار الزمني", response: "الاستجابة المقترحة", watch: "مؤشر المتابعة", sources: "المصادر",
    since: (m) => `منذ ${m}`, m3: "3 أشهر", m12: "12 شهراً",
    level: { critical: "حرج", high: "مرتفع", watch: "للمتابعة", clear: "لا قيود" },
    levelsNote: (m) => `المستويان "حرج" و"مرتفع" يتطلبان قراراً الآن؛ و"للمتابعة" يعني الرصد؛ و"لا قيود" يعني أنه جرى التحقق ولم يُعثر على قيود حالية. تقارن إشارات الأسعار آخر شهر متاح من البنك الدولي بشهر ${m}، وبما قبل ثلاثة أشهر وعام، ولا يُصنَّف التنبيه أدنى من إشارة السعر.`,
    imports: (name, year) => `واردات ${name} ${year}`,
    note: "مذكرة القرار", noteSub: "للوزارات المعنية ولجان التنسيق. حدّد حالة كل قرار، وتُحفظ في هذا المتصفح فقط.",
    word: "تنزيل ملف Word", print: "طباعة / PDF", exportDecisions: "تصدير القرارات (CSV)",
    status: "الحالة", statuses: { open: "لم يبدأ", progress: "قيد التنفيذ", done: "مكتمل", na: "غير مطلوب" },
    planner: "ماذا لو فقدنا مورداً؟", plannerSub: "اختبر أثر فقدان مصدر واحد لأي سلعة أساسية. يعتمد على حصة كل دولة من واردات الإمارات في 2023، والنتائج توضيحية وليست توقعات.",
    staple: "السلعة", origin: "المصدر المفقود", weeks: "مدة الانقطاع (أسابيع)", scale: "يمكن للمصادر الأخرى زيادة شحناتها بنسبة", cover: "تغطية المخزون (أيام)", coverHint: "اختياري؛ يُملأ من بياناتك أدناه",
    lost: (o, s, st) => `فقدان ${o} يُسقط ${s}% من الواردات المعتادة من ${st}.`,
    replaced: (n, u, r, g) => `إذا زادت المصادر الأخرى (${n}) شحناتها بنسبة ${u}%، فإنها تعوّض ${r} نقطة مئوية، ويبلغ العجز ${g}% من الإمداد المعتاد.`,
    fullyCovered: "بهذا المعدل يمكن للمصادر الأخرى سدّ الفجوة.",
    need: (w, d) => `وعلى مدى ${w} أسابيع يتطلب ذلك نحو ${d} يوماً من تغطية المخزون.`,
    enough: (d, x) => `مع تغطية ${d} يوماً، يكفي المخزون نحو ${x} أسابيع عند هذا العجز، وهو ما يكفي لمدة الانقطاع.`,
    short: (d, x, g) => `مع تغطية ${d} يوماً، يكفي المخزون نحو ${x} أسابيع عند هذا العجز، أي بنقص ${g} أسابيع عن مدة الانقطاع.`,
    noCover: "أدخل أيام تغطية المخزون لمعرفة المدة التي يكفيها.",
    outcome: { covered: "الفجوة مغطاة", reserves: "مغطاة بالمخزون", short: "المخزون غير كافٍ", data: "يلزم إدخال بيانات المخزون" },
    alternatives: "أكبر المصادر البديلة (2023)", plannerCaveat: "تشمل الواردات إعادة التصدير ولا تشمل الإنتاج المحلي، لذا تُقرأ النتائج كمؤشر على الحجم.",
    own: "بياناتك: تغطية المخزون للسلع الأساسية", ownSub: "أدخل أيام التغطية للسلع التسع الخاضعة لموافقة الأسعار. تبقى الأرقام في هذا المتصفح فقط، ولا يُرفع أو يُشارك أي شيء.",
    good: "السلعة الأساسية", days: "أيام التغطية", eff: "العدد الفعلي للموردين (2023)", alert: "التنبيه", priority: "الأولوية",
    threshold: "تنبيه عند تغطية أقل من (أيام)", importCsv: "استيراد CSV", exportCsv: "تصدير CSV", clear: "مسح",
    prio: { high: "مرتفعة", medium: "متوسطة", low: "منخفضة", enter: "أدخل التغطية" },
    prioNote: "تجمع الأولوية بين تغطية المخزون لديك وتركّز الموردين والتنبيهات الحالية.",
    commitments: "الالتزامات: من الإعلان إلى التنفيذ", commitmentsSub: "كل التزام مع الإجراءات التي تنفّذه، مرتبةً حسب مدى تقدّمها: من الأنشطة التمهيدية والإعلانات إلى الاتفاقيات والتمويل والتشغيل والنتائج المعلنة.",
    stages: { preparatory: "تمهيدي", announced: "معلن", adopted: "متفق عليه أو معتمد", financed: "ممول", operational: "قيد التشغيل", results: "نتائج معلنة" },
    commit: { delivering: "تنفيذ فعلي", moving: "في طور التقدم", announcements: "إعلانات فقط", stalled: "متوقف", "no-action": "لا إجراءات" },
    latest: "آخر تنفيذ", outside: "من خارج السجل",
    followThrough: (p, n, d) => `${p}% من ${n} إجراءً مرتبطاً منذ ${d} تجاوزت مرحلة الإعلان.`,
    commitMethod: "تُطابَق الإجراءات مع كل التزام بناءً على صياغتها، وتُصنَّف مراحلها بكلمات مفتاحية (مثل \"افتُتح\" = قيد التشغيل، و\"اعتُمد\" أو \"وُقّع\" = متفق عليه أو معتمد). ولا تُحتسب صيغ النية (\"سوف\"، \"يعتزم\"، مذكرة تفاهم \"لاستكشاف\") تشغيلاً أو نتائج. النتائج إرشادية وتحتاج إلى مراجعة.",
    verify: { official: "رسمي", press: "صحافة", pending: "بانتظار الوثيقة" },
    deep: "ركائز الاستراتيجية بالتفصيل", deepSub: (y) => `القراءة طويلة الأجل لكل ركيزة مقارنة بالبيانات الدولية (بيانات التجارة حتى ${y}). هذا القسم متاح بالإنجليزية حالياً.`,
    foot: (d) => `أُعدّت النسخة التجريبية في ${d} · Policy Intelligence، دول مجلس التعاون الخليجي واليمن`,
  },
};
const L = () => T[LANG];
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthLabel = (label) => { if (LANG !== "ar" || !label) return label || ""; const [m, y] = label.split(" "); const i = MONTH_EN.indexOf(m); return i < 0 ? label : `${MONTH_AR[i]} ${y}`; };

// Status vocabulary -> tone (colour + shape + label).
const TONE = { meets: "good", "on-track": "good", improving: "good", partly: "mid", mixed: "mid", concentrated: "bad", "at-risk": "bad", declining: "bad", exposed: "bad", "baseline-pending": "none", "no-outcome-data": "none", "no-data": "none" };
const MARK = { good: "#49806a", mid: "#b7852f", bad: "#a6483c", none: "#7d93a2" };
const CATEGORY_LABEL = { meets: "Meets benchmark", partly: "Just short", concentrated: "Concentrated" };
const chip = (status, label) => `<span class="st-chip st-${TONE[status] || "none"}">${esc(label)}</span>`;
const VERIFY_LABEL = { official: "Official", press: "Press-reported", pending: "Pending document" };
const LEVEL_TONE = { critical: "bad", high: "bad", watch: "mid", clear: "good" };
const COMMIT_TONE = { delivering: "good", moving: "mid", announcements: "mid", stalled: "bad", "no-action": "none" };
const toneChip = (tone, label) => `<span class="st-chip st-${tone}">${esc(label)}</span>`;
const sourceLink = (source) => source?.url ? `<a href="${esc(safeUrl(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a>` : esc(source?.label || "");
const signed = (value) => `${value >= 0 ? "+" : ""}${fmt(value, 0)}%`;
const cat = (t, id) => t.diversification.categories.find((c) => c.id === id);
const catName = (c) => LANG === "ar" ? c.name_ar : c.name;
const country = (p) => LANG === "ar" ? p.partner_ar : p.partner;
const download = (blob, name) => { const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000); };
const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

let DATA = null;
async function main() {
  const host = $("#pilot");
  try {
    // The double-click version (uae-strategy-standalone.html) carries its data inline.
    const inline = window.__UAE_PILOT__;
    const [tracker, register] = inline ? [inline.tracker, inline.register] : await Promise.all(["../data/strategy/uae-tracker.json", "../data/strategy/uae-register.json"].map(async (url) => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`${url} could not be loaded (${response.status}).`);
      return response.json();
    }));
    DATA = { tracker, register };
    render(host, tracker, register);
  } catch (error) {
    host.innerHTML = `<div class="empty-state"><h2>The tracker could not be loaded</h2><p>${esc(error.message)}</p></div>`;
  }
}

function setLanguage(lang) {
  LANG = lang; store.set("uae-pilot-lang", lang);
  render($("#pilot"), DATA.tracker, DATA.register);
}

let resizeBound = false;
function render(host, t, register) {
  const pillars = register.pillars;
  const f = t.findings;
  const nfss = register.strategies.find((s) => s.id === "nfss2051");
  document.documentElement.lang = LANG;
  document.documentElement.dir = LANG === "ar" ? "rtl" : "ltr";
  const banner = $(".pilot-banner");
  if (banner) banner.innerHTML = `<strong>${esc(L().banner[0])}</strong><span>${esc(L().banner[1])}</span>`;
  host.innerHTML = `
    <div class="page-heading"><div>
      <div class="eyebrow">${esc(L().eyebrow)}</div>
      <h1 class="page-title">${esc(L().title)}</h1>
      <p class="page-subtitle">${esc(L().subtitle)}</p>
    </div><div class="heading-actions"><button class="button button-outline lang-toggle" id="lang-toggle" type="button" lang="${LANG === "ar" ? "en" : "ar"}">${esc(L().lang)}</button><a class="button button-primary" href="#note">${esc(L().toNote)}</a></div></div>

    <div class="content-grid">
      ${situationCard(t)}
      ${alertsSection(t)}
      ${noteSection(t)}
      ${plannerSection(t)}
      ${ownDataSection(t)}
      ${commitmentsSection(t)}
      <div class="span-12 section-divider"><h2>${esc(L().deep)}</h2><p>${esc(L().deepSub(t.diversification.latestYear))}</p></div>
      <section class="card span-12 deep"><div class="card-header"><div><h2 class="card-title">Strategic reading at a glance</h2><p class="card-subtitle">Status of each pillar. Select one to read the analysis.</p></div></div>
        <div class="card-body"><nav class="glance" aria-label="Pillars">${pillars.map((pillar) => `<a href="#p-${pillar.id}"><h3>${esc(pillar.name)}</h3>${chip(f[pillar.id].status, f[pillar.id].statusLabel)}<p>${esc(pillar.question)}</p></a>`).join("")}</nav></div>
      </section>

      <section class="card span-12 deep"><div class="card-header"><div><h2 class="card-title">What the strategies commit to</h2><p class="card-subtitle">Only sourced commitments are listed. Each carries its verification level; nothing press-reported is used to set a status.</p></div></div>
        <div class="card-body">
          <div class="headline-callout">${chip("no-data", "No current scoreboard")}<div><q>${esc(nfss.headline.quote)}</q><p>${esc(nfss.headline.analystNote)}</p></div></div>
          <div class="reg-grid">${register.strategies.map(registerCard).join("")}</div>
          ${(register.signals || []).length ? `<div class="signals"><h3>Strategy in revision</h3><p class="signals-intro">Developments in the monitored record that will change what this tracker measures.</p>${register.signals.map((signal) => `<div class="signal"><div class="signal-head"><span class="ver ver-${signal.verification}">${VERIFY_LABEL[signal.verification]}</span><time>${esc(dayEn(signal.date))}</time></div><p>${esc(signal.text)}</p><p class="signal-impl"><strong>What it means for tracking:</strong> ${esc(signal.implication)}</p><p class="reg-source">Source: <a href="${esc(safeUrl(signal.source.url))}" target="_blank" rel="noopener noreferrer">${esc(signal.source.publisher)}</a></p></div>`).join("")}</div>` : ""}
        </div>
      </section>

      ${pillars.map((pillar) => pillarSection(pillar, f[pillar.id], t)).join("")}

      <section class="card span-12 deep" id="headline"><div class="card-header"><div><h2 class="card-title">The headline target, rebuilt from official data</h2><p class="card-subtitle">${esc(t.headline.note)}</p></div></div>
        <div class="card-body"><div class="proxy-grid">${t.headline.dimensions.map((dimension) => `<div class="proxy-col"><h3>${esc(dimension.name)}</h3>${dimension.items.map((item) => `<div class="proxy-item"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><small>${esc(item.period || "–")}</small></div>`).join("")}</div>`).join("")}</div></div>
      </section>

      <section class="card span-12 deep"><div class="card-header"><div><h2 class="card-title">Government data that would complete the picture</h2><p class="card-subtitle">Public international data lag by one to two years and cannot show readiness. These items, held by the government, would turn the monitor into a live management tool; they can be entered locally above without being shared.</p></div></div>
        <div class="card-body table-scroll"><table class="st-table"><thead><tr><th>Data</th><th>Likely holder</th><th>What it unlocks</th></tr></thead><tbody>${register.governmentDataNeeded.map((row) => `<tr><td>${esc(row.item)}</td><td>${esc(row.holder)}</td><td>${esc(row.unlocks)}</td></tr>`).join("")}</tbody></table></div>
      </section>

      <section class="card span-12 deep"><div class="card-header"><div><h2 class="card-title">Sources and limitations</h2></div></div>
        <div class="card-body"><ul class="src-list">
          <li>Trade: ${esc(t.sources.trade)}.</li>
          <li>Food balances: ${esc(t.sources.balances)}.</li>
          <li>Food security indicators: ${esc(t.sources.foodSecurity)}.</li>
          <li>Prices: ${esc(t.sources.prices)}. Policy measures: ${esc(t.sources.records)}.</li>
          <li>${esc(t.basketNote)}</li>
          <li>Statuses and suggested leads are analytical readings of public data for decision support. They are not an official assessment; figures should be confirmed with the responsible authorities. Arabic text is a draft translation for review.</li>
        </ul></div>
      </section>
    </div>
    <p class="pilot-foot">${esc(L().foot(day(t.generatedAt)))}</p>`;
  // The in-depth strategy sections are written in English for now; keep them left to right in either language.
  $$(".deep, .pillar").forEach((element) => { element.dir = "ltr"; element.lang = "en"; });
  $("#lang-toggle").addEventListener("click", () => setLanguage(LANG === "ar" ? "en" : "ar"));
  bindNote(t);
  bindPlanner(t);
  bindOwnData(t);
  drawDiversification($("#chart-supply"), t);
  drawProduction($("#chart-production"), t);
  if (!resizeBound) { resizeBound = true; window.addEventListener("resize", debounce(() => { drawDiversification($("#chart-supply"), DATA.tracker); drawProduction($("#chart-production"), DATA.tracker); }, 150)); }
}

// ---------- situation and alerts ----------
function situationCard(t) {
  const s = t.situation;
  const kpis = s.kpis.map((kpi, i) => LANG === "ar" && t.kpisAr[i] ? { ...kpi, ...t.kpisAr[i] } : kpi);
  const computedAr = { 0: { label: "أطنان واردات السلع الأساسية من دول مجاورة يمكن الوصول إليها براً", period: "بيانات التجارة، 2023" }, 1: { label: "السعر العالمي للسكر منذ بدء الأزمة", period: "البنك الدولي" } };
  let computedIndex = 0;
  return `<section class="card span-12 situation"><div class="card-header"><div><h2 class="card-title">${esc(L().situation(s.day))}</h2><p class="card-subtitle">${esc(L().situationSub(day(s.start)))}</p></div>${toneChip("bad", L().level.critical)}</div>
    <div class="card-body"><div class="kpi-strip">${kpis.map((kpi) => { const ar = kpi.computed && LANG === "ar" ? computedAr[computedIndex++] : null; return `<div class="kpi-tile"><span>${esc(ar ? ar.label : kpi.label)}</span><strong dir="auto">${esc(kpi.value)}</strong><small>${kpi.source ? `${sourceLink(kpi.source)} · ` : ""}${esc(ar ? ar.period : kpi.period)}${kpi.computed ? ` · ${esc(L().computed)}` : ""}</small></div>`; }).join("")}</div></div></section>`;
}

function alertsSection(t) {
  const baseline = t.alerts.find((a) => a.price)?.price;
  const baselineLabel = baseline ? monthLabel(baseline.baselineLabel) : "";
  return `<section class="card span-12" id="alerts"><div class="card-header"><div><h2 class="card-title">${esc(L().alerts)}</h2><p class="card-subtitle">${esc(L().alertsSub)}</p></div></div>
    <div class="card-body"><div class="alert-list">${t.alerts.map((alert) => alertCard(alert, t)).join("")}</div>
    <p class="method">${esc(L().levelsNote(baselineLabel))}</p></div></section>`;
}
function alertCard(alert, t) {
  const ar = LANG === "ar";
  const refs = Object.fromEntries(alert.sources.map((source, i) => [source.key, i + 1]));
  const facts = alert.facts.map((fact, i) => ({ text: ar ? alert.ar.facts[i] : fact.text, src: fact.src }));
  const suppliers = alert.exposure.map((e) => { const c = cat(t, e.id); return `<div class="supplier-bar" role="img" aria-label="${esc(L().imports(catName(c), e.year))}">${e.leading.map((item, i) => `<i style="width:${item.share}%;background:${i === 0 ? "#19455f" : ["#5f90b8", "#8fb3cf", "#b7cfe1"][i - 1]}" title="${esc(item.partner)} ${fmt(item.share, 0)}%"></i>`).join("")}</div><p class="supplier-legend">${esc(L().imports(catName(c), e.year))}: ${e.leading.map((item) => `${esc(ar ? (c.partners.find((p) => p.partner === item.partner)?.partner_ar || item.partner) : item.partner)} ${fmt(item.share, 0)}%`).join(" · ")}</p>`; }).join("");
  const sinceLabel = monthLabel(alert.price?.baselineLabel);
  const price = alert.price ? `<div class="price-tiles"><div><span>${esc(L().since(sinceLabel))}</span><strong dir="ltr">${signed(alert.price.sinceBaseline)}</strong></div><div><span>${esc(L().m3)}</span><strong dir="ltr">${signed(alert.price.threeMonth)}</strong></div><div><span>${esc(L().m12)}</span><strong dir="ltr">${signed(alert.price.twelveMonth)}</strong></div></div>` : "";
  const lead = ar ? alert.leadEntity.ar : alert.leadEntity.en;
  const also = alert.alsoEntities.map((e) => ar ? e.ar : e.en);
  return `<article class="alert-card alert-${alert.level}"><header>${toneChip(LEVEL_TONE[alert.level], L().level[alert.level])}<h3>${esc(ar ? alert.ar.title : alert.title)}</h3></header>
    <div class="alert-grid"><div>
      <h4>${esc(L().happened)}</h4><ul class="fact-list">${facts.map((fact) => `<li>${esc(fact.text)} <sup>${fact.src.map((key) => `<a href="#src-${esc(alert.id)}-${refs[key]}">${refs[key]}</a>`).join(",")}</sup></li>`).join("")}</ul>
      <h4>${esc(L().exposure)}</h4>${(ar ? alert.exposureText_ar : alert.exposureText).map((text) => `<p>${esc(text)}</p>`).join("")}${suppliers}${price}
    </div><div class="alert-action">
      <h4>${esc(L().decision)}</h4><p class="decision-text">${esc(ar ? alert.ar.decision : alert.decision)}</p>
      <dl class="who"><div><dt>${esc(L().lead)}</dt><dd>${esc(lead)}</dd></div>${also.length ? `<div><dt>${esc(L().also)}</dt><dd>${esc(also.join(ar ? "؛ " : "; "))}</dd></div>` : ""}<div><dt>${esc(L().timeframe)}</dt><dd>${esc(ar ? alert.timeframe.ar : alert.timeframe.en)}</dd></div></dl>
      <h4>${esc(L().response)}</h4><p>${esc(ar ? alert.ar.response : alert.response)}</p>
      <h4>${esc(L().watch)}</h4><p class="watch">${esc(ar ? alert.ar.watch : alert.watch)}</p>
      <h4>${esc(L().sources)}</h4><ol class="src-mini">${alert.sources.map((source, i) => `<li id="src-${esc(alert.id)}-${i + 1}" dir="ltr">${sourceLink(source)} <span class="src-type">${esc(ar ? source.type_ar : source.type)}</span></li>`).join("")}</ol>
    </div></div></article>`;
}

// ---------- decision note ----------
const STATUS_KEY = "uae-pilot-decisions";
function noteSection(t) {
  const note = t.decisionNote[LANG];
  const statuses = store.get(STATUS_KEY, {});
  return `<section class="card span-12" id="note"><div class="card-header"><div><h2 class="card-title">${esc(L().note)}</h2><p class="card-subtitle">${esc(L().noteSub)}</p></div><div class="brief-actions"><button class="button button-primary" id="note-word" type="button">${esc(L().word)}</button><button class="button button-outline" id="note-print" type="button">${esc(L().print)}</button><button class="button button-outline" id="note-csv" type="button">${esc(L().exportDecisions)}</button></div></div>
    <div class="card-body"><article class="brief-doc" dir="${note.dir}"><h3>${esc(note.title)}</h3><p class="brief-sub">${esc(note.subtitle)}</p>
      <h4>1. ${esc(note.headings.situation)}</h4>${note.situation.map((text) => `<p>${esc(text)}</p>`).join("")}
      <h4>2. ${esc(note.headings.decisions)}</h4>
      <div class="table-scroll"><table class="st-table decision-table"><thead><tr>${note.headings.columns.map((col) => `<th>${esc(col)}</th>`).join("")}<th class="no-print">${esc(L().status)}</th></tr></thead><tbody>${note.decisions.map((d) => `<tr class="lvl-${d.level}"><td>${esc(d.issue)}</td><td><strong>${esc(d.decision)}</strong></td><td>${esc([d.lead, ...d.also].join(LANG === "ar" ? "؛ " : "; "))}</td><td>${esc(d.timeframe)}</td><td>${esc(d.indicator)}</td><td class="no-print"><select data-decision="${esc(d.id)}" aria-label="${esc(L().status)}">${Object.entries(L().statuses).map(([key, label]) => `<option value="${key}" ${(statuses[d.id] || "open") === key ? "selected" : ""}>${esc(label)}</option>`).join("")}</select></td></tr>`).join("")}</tbody></table></div>
      <p class="lead-note">${esc(note.leadNote)}</p>
      <h4>3. ${esc(note.headings.commitments)}</h4><p>${esc(note.commitments)}</p>
      <h4>4. ${esc(note.headings.support)}</h4><ul>${note.support.map((text) => `<li>${esc(text)}</li>`).join("")}</ul><p>${esc(note.supportNote)}</p>
      <p class="brief-note">${esc(note.disclaimer)}</p></article></div></section>`;
}
function bindNote(t) {
  $$("[data-decision]").forEach((select) => select.addEventListener("change", () => { const statuses = store.get(STATUS_KEY, {}); statuses[select.dataset.decision] = select.value; store.set(STATUS_KEY, statuses); }));
  $("#note-word").addEventListener("click", async () => {
    try {
      const { buildDecisionDocx } = window.PilotDecisionDocx || await import("./decision-docx.js");
      const note = t.decisionNote[LANG];
      download(new Blob([buildDecisionDocx(note, t.decisionNote.sources)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), `uae-food-security-decision-note-${LANG}-${note.date}.docx`);
    } catch (error) { alert(error.message); }
  });
  $("#note-print").addEventListener("click", () => { document.body.classList.add("print-note"); window.print(); setTimeout(() => document.body.classList.remove("print-note"), 500); });
  $("#note-csv").addEventListener("click", () => {
    const note = t.decisionNote[LANG], statuses = store.get(STATUS_KEY, {});
    const rows = [[...note.headings.columns, L().status], ...note.decisions.map((d) => [d.issue, d.decision, [d.lead, ...d.also].join("; "), d.timeframe, d.indicator, L().statuses[statuses[d.id] || "open"]])];
    download(new Blob([`﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }), `uae-decisions-${LANG}-${note.date}.csv`);
  });
}

// ---------- what if we lose a supplier? ----------
const COVER_KEY = "uae-pilot-cover";
function plannerSection(t) {
  const options = t.diversification.categories.filter((c) => c.role !== "feed input" && c.role !== "crushing input");
  return `<section class="card span-12" id="planner"><div class="card-header"><div><h2 class="card-title">${esc(L().planner)}</h2><p class="card-subtitle">${esc(L().plannerSub)}</p></div></div>
    <div class="card-body"><div class="planner">
      <div class="planner-controls">
        <label>${esc(L().staple)}<select id="pl-staple">${options.map((c) => `<option value="${c.id}" ${c.id === "chicken" ? "selected" : ""}>${esc(catName(c))}</option>`).join("")}</select></label>
        <label>${esc(L().origin)}<select id="pl-origin"></select></label>
        <label>${esc(L().weeks)} <output id="pl-weeks-out">8</output><input type="range" id="pl-weeks" min="1" max="26" value="8" /></label>
        <label>${esc(L().scale)} <output id="pl-scale-out">25%</output><input type="range" id="pl-scale" min="0" max="100" step="5" value="25" /></label>
        <label>${esc(L().cover)}<input type="number" id="pl-cover" min="0" max="730" inputmode="numeric" placeholder="${esc(L().coverHint)}" /></label>
      </div>
      <div class="planner-result" id="pl-result" aria-live="polite"></div>
    </div><p class="method">${esc(L().plannerCaveat)}</p></div></section>`;
}
function bindPlanner(t) {
  const staple = $("#pl-staple"), origin = $("#pl-origin"), weeks = $("#pl-weeks"), scale = $("#pl-scale"), cover = $("#pl-cover");
  const fillOrigins = () => { const c = cat(t, staple.value); origin.innerHTML = c.partners.slice(0, 12).map((p) => `<option value="${esc(p.partner)}">${esc(country(p))} (${fmt(p.share, 0)}%)</option>`).join(""); const saved = store.get(COVER_KEY, {})[staple.value]; cover.value = saved ?? ""; };
  const compute = () => {
    const c = cat(t, staple.value), p = c.partners.find((item) => item.partner === origin.value) || c.partners[0];
    const s = p.share / 100, others = c.partners.filter((item) => item !== p), u = Number(scale.value) / 100, w = Number(weeks.value);
    $("#pl-weeks-out").textContent = w; $("#pl-scale-out").textContent = `${scale.value}%`;
    const replaced = Math.min(s, (1 - s) * u), gap = Math.max(0, s - replaced);
    const lines = [L().lost(country(p), fmt(s * 100, 0), catName(c).toLowerCase()), L().replaced(others.length, scale.value, fmt(replaced * 100, 0), fmt(gap * 100, 0))];
    let outcome;
    if (gap <= 0.005) { lines.push(L().fullyCovered); outcome = ["good", L().outcome.covered]; }
    else {
      const needDays = gap * w * 7;
      lines.push(L().need(w, fmt(needDays, 0)));
      const d = Number(cover.value);
      if (cover.value === "" || !(d >= 0)) { lines.push(L().noCover); outcome = ["mid", L().outcome.data]; }
      else { const lastWeeks = d / (gap * 7); if (lastWeeks >= w) { lines.push(L().enough(fmt(d, 0), fmt(lastWeeks, 0))); outcome = ["mid", L().outcome.reserves]; } else { lines.push(L().short(fmt(d, 0), fmt(lastWeeks, 0), fmt(w - lastWeeks, 0))); outcome = ["bad", L().outcome.short]; } }
    }
    $("#pl-result").innerHTML = `${toneChip(outcome[0], outcome[1])}${lines.map((line) => `<p>${esc(line)}</p>`).join("")}<h4>${esc(L().alternatives)}</h4><ol class="alt-list">${others.slice(0, 5).map((item) => `<li><span>${esc(country(item))}</span><span class="alt-bar"><i style="width:${Math.min(100, item.share * 4).toFixed(1)}%"></i></span><span dir="ltr">${fmt(item.share, 1)}% · ${fmt(item.t)} t</span></li>`).join("")}</ol>`;
  };
  staple.addEventListener("change", () => { fillOrigins(); compute(); });
  [origin, weeks, scale, cover].forEach((control) => control.addEventListener("input", compute));
  fillOrigins(); compute();
}

// ---------- your data: reserve cover (kept in this browser) ----------
function priorityOf(t, essential, cover, threshold) {
  const c = cat(t, essential.id), eff = c.years[c.latest].effective;
  const alert = t.alerts.find((a) => (a.categories || []).includes(essential.id));
  const alertRank = alert ? { critical: 3, high: 2, watch: 1, clear: 0 }[alert.level] : 0;
  if (cover === undefined || cover === "") return { key: "enter", rank: alertRank >= 2 || eff < 2 ? 2.5 : 0.5, eff, alert };
  const low = Number(cover) < threshold;
  const rank = (low ? 2 : 0) + (eff < 2 ? 1 : 0) + alertRank * .5;
  return { key: rank >= 2.5 ? "high" : rank >= 1 ? "medium" : "low", rank, eff, alert };
}
function ownDataSection(t) {
  return `<section class="card span-12" id="own-data"><div class="card-header"><div><h2 class="card-title">${esc(L().own)}</h2><p class="card-subtitle">${esc(L().ownSub)}</p></div><div class="brief-actions"><label class="button button-outline file-button">${esc(L().importCsv)}<input type="file" id="cover-import" accept=".csv,text/csv" hidden /></label><button class="button button-outline" id="cover-export" type="button">${esc(L().exportCsv)}</button><button class="button button-outline" id="cover-clear" type="button">${esc(L().clear)}</button></div></div>
    <div class="card-body"><label class="threshold">${esc(L().threshold)} <input type="number" id="cover-threshold" min="0" max="365" value="${store.get("uae-pilot-threshold", 60)}" /></label>
    <div class="table-scroll" id="cover-table"></div><p class="method">${esc(L().prioNote)}</p></div></section>`;
}
function bindOwnData(t) {
  const draw = () => {
    const covers = store.get(COVER_KEY, {}), threshold = Number($("#cover-threshold").value) || 60;
    const rows = t.essentials.map((e) => ({ e, cover: covers[e.id], p: priorityOf(t, e, covers[e.id], threshold) })).sort((a, b) => b.p.rank - a.p.rank);
    const tone = { high: "bad", medium: "mid", low: "good", enter: "none" };
    $("#cover-table").innerHTML = `<table class="st-table cover-table"><thead><tr><th>${esc(L().good)}</th><th>${esc(L().days)}</th><th>${esc(L().eff)}</th><th>${esc(L().alert)}</th><th>${esc(L().priority)}</th></tr></thead><tbody>${rows.map(({ e, cover, p }) => `<tr><td>${esc(LANG === "ar" ? e.ar : e.en)}</td><td><input type="number" min="0" max="730" inputmode="numeric" data-cover="${e.id}" value="${cover ?? ""}" aria-label="${esc(L().days)}: ${esc(LANG === "ar" ? e.ar : e.en)}" /></td><td class="num">${fmt(p.eff, 1)}</td><td>${p.alert ? toneChip(LEVEL_TONE[p.alert.level], L().level[p.alert.level]) : "–"}</td><td>${toneChip(tone[p.key], L().prio[p.key])}</td></tr>`).join("")}</tbody></table>`;
    $$("[data-cover]").forEach((input) => input.addEventListener("change", () => { const next = store.get(COVER_KEY, {}); if (input.value === "") delete next[input.dataset.cover]; else next[input.dataset.cover] = Math.max(0, Number(input.value)); store.set(COVER_KEY, next); draw(); syncPlanner(); }));
  };
  const syncPlanner = () => { const saved = store.get(COVER_KEY, {})[$("#pl-staple").value]; $("#pl-cover").value = saved ?? ""; $("#pl-cover").dispatchEvent(new Event("input")); };
  $("#cover-threshold").addEventListener("change", (event) => { store.set("uae-pilot-threshold", Number(event.target.value) || 60); draw(); });
  $("#cover-clear").addEventListener("click", () => { store.set(COVER_KEY, {}); draw(); syncPlanner(); });
  $("#cover-export").addEventListener("click", () => { const covers = store.get(COVER_KEY, {}); download(new Blob([`essential_id,essential,days_of_cover\r\n${t.essentials.map((e) => [e.id, e.en, covers[e.id] ?? ""].map(csvCell).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }), "uae-reserve-cover.csv"); });
  $("#cover-import").addEventListener("change", async (event) => {
    const file = event.target.files[0]; if (!file) return;
    const lines = (await file.text()).replace(/^﻿/, "").split(/\r?\n/).slice(1).filter(Boolean);
    const next = store.get(COVER_KEY, {});
    lines.forEach((line) => { const [id, , days] = line.split(",").map((cell) => cell.replace(/^"|"$/g, "").trim()); if (t.essentials.some((e) => e.id === id) && days !== "" && Number(days) >= 0) next[id] = Number(days); });
    store.set(COVER_KEY, next); draw(); syncPlanner(); event.target.value = "";
  });
  draw();
}

// ---------- commitments ----------
const STAGES = [["preparatory", "#dbe7f0"], ["announced", "#b7cfe1"], ["adopted", "#8fb3cf"], ["financed", "#5f90b8"], ["operational", "#2f6b9e"], ["results", "#133f63"]];
function commitmentsSection(t) {
  const ar = LANG === "ar";
  return `<section class="card span-12" id="commitments"><div class="card-header"><div><h2 class="card-title">${esc(L().commitments)}</h2><p class="card-subtitle">${esc(L().commitmentsSub)}</p></div></div>
    <div class="card-body"><div class="st-legend">${STAGES.map(([id, color]) => `<span><i style="background:${color}"></i>${esc(L().stages[id])}</span>`).join("")}</div>
    <div class="commit-list">${t.commitments.map((c) => {
      const total = Object.values(c.stages).reduce((sum, value) => sum + value, 0) || 1;
      return `<article class="commit"><div class="commit-head"><div><h3>${esc(ar ? c.name_ar : c.name)}</h3><p class="reg-level"><span class="ver ver-${c.verification}">${esc(L().verify[c.verification])}</span> ${esc(ar ? c.basis_ar : c.basis)}</p></div>${toneChip(COMMIT_TONE[c.status], L().commit[c.status])}</div>
        <div class="stage-bar" dir="ltr" role="img" aria-label="${esc(STAGES.map(([id]) => `${L().stages[id]} ${c.stages[id]}`).join(", "))}">${STAGES.map(([id, color]) => c.stages[id] ? `<i style="width:${(c.stages[id] / total * 100).toFixed(1)}%;background:${color}" title="${esc(L().stages[id])}: ${c.stages[id]}"></i>` : "").join("")}</div>
        <p class="commit-status">${esc(ar ? c.statusText_ar : c.statusText)}${c.followThrough !== null && c.measures >= 5 ? ` ${L().followThrough(fmt(c.followThrough, 0), c.measures, day(c.since))}` : ""}</p>
        ${c.latestDelivery ? `<p class="commit-latest"><strong>${esc(L().latest)}:</strong> <a href="${esc(safeUrl(c.latestDelivery.source))}" target="_blank" rel="noopener noreferrer" dir="ltr">${esc(c.latestDelivery.title)}</a> <small>${esc(day(c.latestDelivery.date))}</small></p>` : ""}
        ${c.outsideEvidence.map((item) => `<p class="commit-latest"><strong>${esc(L().outside)}:</strong> ${esc(ar && item.text_ar ? item.text_ar : item.text)} <small>${sourceLink(item.source)}</small></p>`).join("")}
      </article>`; }).join("")}</div>
    <p class="method">${esc(L().commitMethod)}</p></div></section>`;
}

function registerCard(strategy) {
  return `<article class="reg-card"><h3>${esc(strategy.name)}</h3><p class="reg-level">${esc(strategy.level)}</p>
    <ul class="reg-goals">${[...(strategy.structure || []), ...strategy.goals].map((goal) => `<li><span class="ver ver-${goal.verification}">${VERIFY_LABEL[goal.verification]}</span><span class="${goal.verification === "pending" ? "is-pending" : ""}">${esc(goal.text)}</span></li>`).join("")}</ul>
    ${strategy.analystNote ? `<p class="reg-source">${esc(strategy.analystNote)}</p>` : ""}
    <p class="reg-source">Source: <a href="${esc(safeUrl(strategy.source.url))}" target="_blank" rel="noopener noreferrer">${esc(strategy.source.publisher)}</a>, checked ${esc(dayEn(strategy.source.checked))}</p></article>`;
}

function pillarSection(pillar, finding, t) {
  const evidence = t.implementation[pillar.id];
  const chart = pillar.id === "supply"
    ? `<div class="st-legend"><span><i class="lg-band"></i>Strategy benchmark: ${t.benchmark.min}–${t.benchmark.max} sources</span><span><i class="lg-dot" style="background:${MARK.good}"></i>Meets</span><span><i class="lg-dot" style="background:${MARK.mid}"></i>Just short</span><span><i class="lg-dot" style="background:${MARK.bad}"></i>Concentrated (&lt; 2)</span><span><i class="lg-ring"></i>${esc(t.diversification.categories[0].compareYear)} value</span></div><div id="chart-supply"></div>${supplyTable(t)}`
    : pillar.id === "production"
      ? `<div class="st-legend"><span><i class="lg-dot" style="background:#b9c7d1"></i>2015</span><span><i class="lg-dot" style="background:#116aab"></i>Latest (2023)</span><span>Share of domestic supply produced locally</span></div><div id="chart-production"></div>${productionTable(t)}`
      : "";
  return `<section class="card span-12 pillar" id="p-${pillar.id}"><div class="card-header"><div><h2 class="card-title">${esc(pillar.name)}</h2><p class="pillar-q">${esc(pillar.question)}</p></div>${chip(finding.status, finding.statusLabel)}</div>
    <div class="card-body"><div class="pillar-grid">
      <div class="pillar-analysis">${finding.analysis.map((text) => `<p>${esc(text)}</p>`).join("")}${chart}<p class="method"><strong>Method.</strong> ${esc(finding.method)}</p></div>
      <div class="pillar-side">
        <div class="side-box"><h4>Evidence of implementation</h4><p>${esc(finding.evidence)}</p>${evidence.institutions.length ? `<p><strong>Most active in the record:</strong> ${esc(evidence.institutions.map((item) => item.name).join("; "))}</p>` : ""}
          ${evidence.examples.length ? `<ul class="evidence-list">${evidence.examples.map((record) => `<li><a href="${esc(safeUrl(record.source))}" target="_blank" rel="noopener noreferrer">${esc(record.title)}</a><small>${esc(dayEn(record.date))}${record.institution ? ` · ${esc(record.institution)}` : ""}${record.type === "framework" ? " · long-term framework" : ""}</small></li>`).join("")}</ul>` : ""}</div>
        <div class="side-box"><h4>Draft options for analyst review</h4>${finding.options.map((option) => `<div class="option"><strong>${esc(option.action)}</strong><p>${esc(option.why)}</p><p class="watch">Indicator to watch: ${esc(option.watch)}</p></div>`).join("")}<p class="reg-source">Lead institution in the record: ${esc(finding.owner)}</p></div>
      </div>
    </div></div></section>`;
}

function supplyTable(t) {
  const rows = [...t.diversification.categories].sort((a, b) => a.years[a.latest].effective - b.years[b.latest].effective);
  return `<details class="st-data"><summary>Data table</summary><div class="table-scroll"><table class="st-table"><thead><tr><th>Category</th><th>Effective suppliers ${esc(rows[0].compareYear)}</th><th>Effective suppliers ${esc(rows[0].latest)}</th><th>Leading supplier</th><th>Suppliers ≥ 5%</th><th>Imports (t)</th><th>Status</th></tr></thead><tbody>${rows.map((c) => { const y = c.years[c.latest], b = c.years[c.compareYear]; return `<tr><td>${esc(c.name)}${c.detail ? ` <small>(${esc(c.detail)})</small>` : ""}</td><td class="num">${fmt(b.effective, 1)}</td><td class="num">${fmt(y.effective, 1)}</td><td>${esc(y.top.partner)} ${fmt(y.top.share, 0)}%</td><td class="num">${y.over5}</td><td class="num">${fmt(y.totalT)}</td><td>${esc(CATEGORY_LABEL[c.status])}</td></tr>`; }).join("")}</tbody></table></div></details>`;
}
function productionTable(t) {
  return `<details class="st-data"><summary>Data table</summary><div class="table-scroll"><table class="st-table"><thead><tr><th>Item</th><th>Self-sufficiency ${esc(t.production.items[0].first)}</th><th>Self-sufficiency latest</th><th>Production (kt)</th><th>Domestic supply (kt)</th></tr></thead><tbody>${t.production.items.map((item) => { const a = item.years[item.first], b = item.years[item.latest]; return `<tr><td>${esc(item.name)}</td><td class="num">${fmt(a.selfSufficiency, 0)}%</td><td class="num">${fmt(b.selfSufficiency, 0)}%</td><td class="num">${fmt(b.production)}</td><td class="num">${fmt(b.supply)}</td></tr>`; }).join("")}</tbody></table></div></details>`;
}

// ---------- charts ----------
let tooltip;
function tip(event, html) {
  tooltip ||= Object.assign(document.body.appendChild(document.createElement("div")), { className: "chart-tooltip" });
  if (!html) { tooltip.style.display = "none"; return; }
  tooltip.innerHTML = html; tooltip.style.display = "block";
  const x = Math.min(event.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8), y = Math.min(event.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8);
  tooltip.style.left = `${x}px`; tooltip.style.top = `${y}px`;
}

function drawDiversification(host, t) {
  if (!host || !window.d3) return;
  const d3 = window.d3;
  const rows = [...t.diversification.categories].sort((a, b) => a.years[a.latest].effective - b.years[b.latest].effective);
  const width = Math.max(320, host.clientWidth || 700);
  const narrow = width < 520;
  const margin = { top: 22, right: 58, bottom: 34, left: narrow ? 108 : 150 };
  const rowH = 24, height = margin.top + margin.bottom + rows.length * rowH;
  const max = Math.max(t.benchmark.max + 1, ...rows.map((c) => Math.max(c.years[c.latest].effective, c.years[c.compareYear].effective)));
  const x = d3.scaleLinear().domain([0, Math.ceil(max)]).range([margin.left, width - margin.right]);
  const y = (i) => margin.top + i * rowH + rowH / 2;
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("class", "st-chart").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Effective number of suppliers per basket category, latest year, with the 3 to 5 source benchmark");
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(Math.ceil(max)).tickSize(-(height - margin.top - margin.bottom)).tickFormat("")).select(".domain").remove();
  svg.append("rect").attr("x", x(t.benchmark.min)).attr("width", x(t.benchmark.max) - x(t.benchmark.min)).attr("y", margin.top - 8).attr("height", height - margin.top - margin.bottom + 8).attr("fill", "rgba(73,128,106,.13)");
  [t.benchmark.min, t.benchmark.max].forEach((value) => svg.append("line").attr("x1", x(value)).attr("x2", x(value)).attr("y1", margin.top - 8).attr("y2", height - margin.bottom).attr("stroke", "#49806a").attr("stroke-dasharray", "4 3"));
  svg.append("text").attr("x", (x(t.benchmark.min) + x(t.benchmark.max)) / 2).attr("y", margin.top - 12).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#2f6b55").text("Strategy benchmark");
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(Math.ceil(max)));
  svg.append("text").attr("x", width - margin.right).attr("y", height - 4).attr("text-anchor", "end").attr("font-size", 11).text("Effective number of suppliers →");
  const g = svg.append("g").selectAll("g").data(rows).join("g").attr("transform", (c, i) => `translate(0,${y(i)})`);
  g.append("text").attr("class", "cat-label").attr("x", margin.left - 10).attr("dy", "0.35em").attr("text-anchor", "end").text((c) => c.name);
  g.append("rect").attr("x", x(0)).attr("y", -6).attr("height", 12).attr("rx", 4).attr("width", (c) => Math.max(2, x(c.years[c.latest].effective) - x(0))).attr("fill", (c) => MARK[TONE[c.status]]);
  g.append("circle").attr("cx", (c) => x(c.years[c.compareYear].effective)).attr("r", 4.5).attr("fill", "white").attr("stroke", "#19455f").attr("stroke-width", 2);
  svg.append("text").attr("x", width - 4).attr("y", margin.top - 12).attr("text-anchor", "end").attr("font-size", 11).text(t.diversification.latestYear);
  g.append("text").attr("class", "val").attr("x", width - 4).attr("text-anchor", "end").attr("dy", "0.35em").text((c) => fmt(c.years[c.latest].effective, 1));
  // Hover target: the whole row, larger than the mark.
  g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", width).attr("height", rowH).attr("fill", "transparent")
    .on("mousemove", (event, c) => { const yv = c.years[c.latest], b = c.years[c.compareYear]; tip(event, `<strong>${esc(c.name)}${c.detail ? ` (${esc(c.detail)})` : ""}</strong><br>${esc(CATEGORY_LABEL[c.status])}: ${fmt(yv.effective, 1)} effective suppliers in ${esc(c.latest)} (${fmt(b.effective, 1)} in ${esc(c.compareYear)})<br>${yv.leading.slice(0, 3).map((item) => `${esc(item.partner)} ${fmt(item.share, 0)}%`).join(" · ")}<br>${fmt(yv.totalT)} t from ${yv.suppliers} countries`); })
    .on("mouseleave", (event) => tip(event, null));
}

function drawProduction(host, t) {
  if (!host || !window.d3) return;
  const d3 = window.d3;
  const items = [...t.production.items].sort((a, b) => b.years[b.latest].selfSufficiency - a.years[a.latest].selfSufficiency);
  const width = Math.max(320, host.clientWidth || 700);
  const narrow = width < 520;
  const margin = { top: 22, right: 58, bottom: 34, left: narrow ? 108 : 150 };
  const rowH = 24, height = margin.top + margin.bottom + items.length * rowH;
  const max = Math.max(100, ...items.flatMap((item) => [item.years[item.first].selfSufficiency, item.years[item.latest].selfSufficiency]));
  const x = d3.scaleLinear().domain([0, Math.ceil(max / 20) * 20]).range([margin.left, width - margin.right]);
  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("class", "st-chart").attr("viewBox", `0 0 ${width} ${height}`).attr("role", "img").attr("aria-label", "Self-sufficiency ratio by item, 2015 and latest year");
  svg.append("g").attr("class", "grid").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6).tickSize(-(height - margin.top - margin.bottom)).tickFormat("")).select(".domain").remove();
  svg.append("line").attr("x1", x(100)).attr("x2", x(100)).attr("y1", margin.top).attr("y2", height - margin.bottom).attr("stroke", "#19455f").attr("stroke-dasharray", "3 3");
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6).tickFormat((v) => `${v}%`));
  const g = svg.append("g").selectAll("g").data(items).join("g").attr("transform", (item, i) => `translate(0,${margin.top + i * rowH + rowH / 2})`);
  g.append("text").attr("class", "cat-label").attr("x", margin.left - 10).attr("dy", "0.35em").attr("text-anchor", "end").text((item) => item.name);
  g.append("line").attr("x1", (item) => x(item.years[item.first].selfSufficiency)).attr("x2", (item) => x(item.years[item.latest].selfSufficiency)).attr("stroke", "#9fb3c0").attr("stroke-width", 2);
  g.append("circle").attr("cx", (item) => x(item.years[item.first].selfSufficiency)).attr("r", 5).attr("fill", "#b9c7d1").attr("stroke", "white").attr("stroke-width", 1.5);
  g.append("circle").attr("cx", (item) => x(item.years[item.latest].selfSufficiency)).attr("r", 5.5).attr("fill", "#116aab").attr("stroke", "white").attr("stroke-width", 1.5);
  svg.append("text").attr("x", width - 4).attr("y", margin.top - 12).attr("text-anchor", "end").attr("font-size", 11).text(items[0].latest);
  svg.append("text").attr("x", x(100)).attr("y", margin.top - 12).attr("text-anchor", "middle").attr("font-size", 11).attr("fill", "#19455f").text("100% = self-sufficient");
  g.append("text").attr("class", "val").attr("x", width - 4).attr("text-anchor", "end").attr("dy", "0.35em").text((item) => `${fmt(item.years[item.latest].selfSufficiency, 0)}%`);
  g.append("rect").attr("x", 0).attr("y", -rowH / 2).attr("width", width).attr("height", rowH).attr("fill", "transparent")
    .on("mousemove", (event, item) => { const a = item.years[item.first], b = item.years[item.latest]; tip(event, `<strong>${esc(item.name)}</strong><br>${fmt(a.selfSufficiency, 0)}% in ${esc(item.first)} → ${fmt(b.selfSufficiency, 0)}% in ${esc(item.latest)}<br>Production ${fmt(b.production)} kt of ${fmt(b.supply)} kt domestic supply`); })
    .on("mouseleave", (event) => tip(event, null));
}

function debounce(fn, ms) { let timer; return () => { clearTimeout(timer); timer = setTimeout(fn, ms); }; }

// d3 is loaded with `defer`; module scripts also run after parsing, but wait for it explicitly.
if (window.d3) main(); else window.addEventListener("DOMContentLoaded", main, { once: true });
