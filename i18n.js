// Interface strings and language switching. English is the reference; the Arabic strings are drafts
// for review by a translator (marked REVIEW) and cover the interface shell, not the policy records,
// which stay in English as published.
const STRINGS = {
  en: {
    "brand.title": "Policy Intelligence", "brand.sub": "Food & Agriculture", "region": "GCC STATES & YEMEN",
    "nav.analyse": "ANALYSE", "nav.evidence": "EVIDENCE",
    "nav.thismonth": "This month", "nav.overview": "Overview", "nav.country": "Country Intelligence", "nav.trends": "Policy Trends", "nav.areas": "Policy Areas", "nav.prices": "Food Prices & Diets", "nav.compare": "Country Comparison", "nav.network": "Policy Network", "nav.records": "Policy Records", "nav.reports": "Reports", "nav.methodology": "Methodology & Sources",
    "top.search": "Search policy measures", "top.export": "Export", "top.updates": "Latest dataset update", "top.language": "العربية", "top.languageLabel": "Switch to Arabic",
    "filters.label": "Filters", "filters.edit": "Edit filters", "filters.reset": "Reset", "filters.copy": "Copy link", "filters.none": "All countries · all years · all policy types", "filters.title": "Edit filters", "filters.done": "Show results", "filters.remove": "Remove filter",
    "f.country": "Country", "f.year": "Year", "f.month": "Month", "f.type": "Policy type", "f.family": "Policy family", "f.domain": "Policy domain", "f.group": "Policy group", "f.institution": "Institution", "f.from": "From", "f.to": "To", "f.search": "Search",
    "footer.name": "Policy Intelligence · GCC States & Yemen", "footer.disclaimer": "Policy measures are short summaries for monitoring and analysis, not legal texts. Always consult the original source.",
    "entry.new": "What's new", "entry.newText": "The latest briefing: key messages, food prices and the measures behind them.", "entry.country": "Explore a country", "entry.countryText": "One country's policy mix, activity and latest measures.", "entry.compare": "Compare", "entry.compareText": "Countries side by side on orientation, families and activity.",
    "kpi.month": "Measures in the latest complete month", "kpi.year": "Measures in the last 12 months", "kpi.frameworks": "Long-term frameworks, last 12 months", "kpi.countries": "Countries active in the latest month", "kpi.institutions": "Institutions active, last 12 months",
    "def.family": "FAPDA groups short-term decisions by whom they mainly act on (consumers, producers or trade); long-term frameworks form their own family.",
    "def.decision": "A specific measure with near-term effect, such as a subsidy, tariff change, regulation or programme.",
    "def.framework": "A strategy, plan, law or long-term programme that sets direction over several years.",
    "def.domain": "The detailed policy area coded for each measure in the FAPDA workbook, for example 'Water policies and regulations'.",
    "def.group": "A grouping of policy domains, such as 'Imports' or 'Production support'.",
    "def.institution": "The decision-making body named in the source, normalised to one spelling per country.",
    "def.partial": "The latest month is still in progress, so its count is incomplete and is not compared with full months.",
  },
  // REVIEW: draft Arabic translations; to be checked by an FAO translator before publication.
  ar: {
    "brand.title": "معلومات السياسات", "brand.sub": "الأغذية والزراعة", "region": "دول مجلس التعاون الخليجي واليمن",
    "nav.analyse": "التحليل", "nav.evidence": "الأدلة",
    "nav.thismonth": "هذا الشهر", "nav.overview": "نظرة عامة", "nav.country": "معلومات الدول", "nav.trends": "اتجاهات السياسات", "nav.areas": "مجالات السياسات", "nav.prices": "أسعار الغذاء والأنظمة الغذائية", "nav.compare": "مقارنة الدول", "nav.network": "شبكة السياسات", "nav.records": "سجلات السياسات", "nav.reports": "التقارير", "nav.methodology": "المنهجية والمصادر",
    "top.search": "ابحث في التدابير السياسية", "top.export": "تصدير", "top.updates": "آخر تحديث للبيانات", "top.language": "English", "top.languageLabel": "التبديل إلى الإنجليزية",
    "filters.label": "عوامل التصفية", "filters.edit": "تعديل عوامل التصفية", "filters.reset": "إعادة الضبط", "filters.copy": "نسخ الرابط", "filters.none": "جميع الدول · جميع السنوات · جميع أنواع السياسات", "filters.title": "تعديل عوامل التصفية", "filters.done": "عرض النتائج", "filters.remove": "إزالة عامل التصفية",
    "f.country": "الدولة", "f.year": "السنة", "f.month": "الشهر", "f.type": "نوع السياسة", "f.family": "فئة السياسة", "f.domain": "مجال السياسة", "f.group": "مجموعة السياسات", "f.institution": "المؤسسة", "f.from": "من", "f.to": "إلى", "f.search": "بحث",
    "footer.name": "معلومات السياسات · دول مجلس التعاون الخليجي واليمن", "footer.disclaimer": "التدابير السياسية ملخصات موجزة لأغراض الرصد والتحليل، وليست نصوصاً قانونية. يُرجى دائماً الرجوع إلى المصدر الأصلي.",
    "entry.new": "المستجدات", "entry.newText": "أحدث موجز: الرسائل الرئيسية وأسعار الغذاء والتدابير المرتبطة بها.", "entry.country": "استكشاف دولة", "entry.countryText": "مزيج السياسات في دولة واحدة ونشاطها وأحدث تدابيرها.", "entry.compare": "مقارنة", "entry.compareText": "مقارنة الدول جنباً إلى جنب من حيث التوجه والفئات والنشاط.",
    "kpi.month": "التدابير في آخر شهر مكتمل", "kpi.year": "التدابير خلال آخر 12 شهراً", "kpi.frameworks": "الأطر طويلة الأجل خلال آخر 12 شهراً", "kpi.countries": "الدول النشطة في آخر شهر", "kpi.institutions": "المؤسسات النشطة خلال آخر 12 شهراً",
    "def.family": "يصنّف نظام FAPDA القرارات قصيرة الأجل بحسب الفئة المستهدفة أساساً (المستهلكون أو المنتجون أو التجارة)، وتشكّل الأطر طويلة الأجل فئة مستقلة.",
    "def.decision": "تدبير محدد ذو أثر قريب الأجل، مثل دعم أو تعديل جمركي أو لائحة أو برنامج.",
    "def.framework": "استراتيجية أو خطة أو قانون أو برنامج طويل الأجل يحدد التوجه لعدة سنوات.",
    "def.domain": "مجال السياسة التفصيلي المرمّز لكل تدبير في مصنف FAPDA.",
    "def.group": "مجموعة من مجالات السياسات، مثل الواردات أو دعم الإنتاج.",
    "def.institution": "جهة صنع القرار المذكورة في المصدر، بعد توحيد تهجئتها لكل دولة.",
    "def.partial": "آخر شهر لم يكتمل بعد، لذا فإن عدد تدابيره غير مكتمل ولا يُقارن بالأشهر الكاملة.",
  },
};
export const LANGUAGES = ["en", "ar"];
let current = "en";
try { const saved = localStorage.getItem("pi.lang"); if (LANGUAGES.includes(saved)) current = saved; } catch { /* default English */ }

export const lang = () => current;
export function t(key) { return STRINGS[current]?.[key] ?? STRINGS.en[key] ?? key; }
export function setLang(next) {
  if (!LANGUAGES.includes(next)) return;
  current = next;
  try { localStorage.setItem("pi.lang", next); } catch { /* not remembered */ }
  applyDocument();
}
// Applies language and direction to the page and fills every [data-i18n*] element of the shell.
export function applyDocument(root = document) {
  document.documentElement.lang = current;
  document.documentElement.dir = current === "ar" ? "rtl" : "ltr";
  root.querySelectorAll("[data-i18n]").forEach((element) => { element.textContent = t(element.dataset.i18n); });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => { element.title = t(element.dataset.i18nTitle); element.setAttribute("aria-label", t(element.dataset.i18nTitle)); });
}
// A term with a hover and keyboard-focus definition.
export function term(label, key) {
  return `<span class="term" tabindex="0" data-def="${t(key).replace(/"/g, "&quot;")}">${label}</span>`;
}
