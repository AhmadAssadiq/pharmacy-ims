// The known negative interactions the demo pharmacy checks for (GP2 addition).
// The seed (db/seed.js) copies this list into the medication_interactions table.
//
// Each entry is a pair of ACTIVE INGREDIENTS (not medication names), so it applies to every
// strength and brand of that ingredient:
//   ingredients - the two active ingredients, in lower case
//   severity    - 'major' (avoid the combination), 'moderate' (use with care) or 'minor'
//   en / ar     - the explanation shown to staff and patients
//
// IMPORTANT: this is a short list of well-known interactions for the medicines in the demo
// catalogue. It is NOT a complete clinical reference. A real pharmacy would load a licensed
// interaction database here instead. "No known interactions" on the screen therefore always
// means "none in this list".
export const DEMO_INTERACTIONS = [
  {
    ingredients: ['warfarin', 'aspirin'],
    severity: 'major',
    en: 'Both thin the blood. Taken together they greatly increase the risk of serious bleeding.',
    ar: 'كلاهما يزيد سيولة الدم. تناولهما معًا يرفع كثيرًا خطر حدوث نزيف خطير.',
  },
  {
    ingredients: ['warfarin', 'ibuprofen'],
    severity: 'major',
    en: 'Ibuprofen increases the risk of bleeding, especially in the stomach, in people taking warfarin.',
    ar: 'يزيد الإيبوبروفين خطر النزيف، وخصوصًا في المعدة، لدى من يتناولون الوارفارين.',
  },
  {
    ingredients: ['aspirin', 'ibuprofen'],
    severity: 'moderate',
    en: 'Ibuprofen can weaken the heart-protecting effect of low-dose aspirin, and the two together irritate the stomach more.',
    ar: 'قد يُضعف الإيبوبروفين تأثير الأسبرين منخفض الجرعة في حماية القلب، واجتماعهما يزيد تهيّج المعدة.',
  },
  {
    ingredients: ['warfarin', 'azithromycin'],
    severity: 'moderate',
    en: 'Azithromycin can strengthen the effect of warfarin. The blood clotting test (INR) may need checking.',
    ar: 'قد يقوّي الأزيثرومايسين تأثير الوارفارين. قد يلزم إجراء فحص تخثّر الدم (INR).',
  },
  {
    ingredients: ['warfarin', 'amoxicillin'],
    severity: 'moderate',
    en: 'Amoxicillin can strengthen the effect of warfarin. The blood clotting test (INR) may need checking.',
    ar: 'قد يقوّي الأموكسيسيلين تأثير الوارفارين. قد يلزم إجراء فحص تخثّر الدم (INR).',
  },
  {
    ingredients: ['warfarin', 'paracetamol'],
    severity: 'minor',
    en: 'Regular paracetamol for several days can slightly increase the effect of warfarin. Occasional doses are fine.',
    ar: 'تناول الباراسيتامول بانتظام لعدة أيام قد يزيد قليلًا تأثير الوارفارين. الجرعات العرضية لا بأس بها.',
  },
  {
    ingredients: ['amlodipine', 'ibuprofen'],
    severity: 'moderate',
    en: 'Ibuprofen and similar painkillers can raise blood pressure and weaken the effect of amlodipine.',
    ar: 'قد يرفع الإيبوبروفين والمسكّنات المشابهة ضغط الدم ويُضعف تأثير الأملوديبين.',
  },
  {
    ingredients: ['ibuprofen', 'metformin'],
    severity: 'minor',
    en: 'Ibuprofen can affect the kidneys, which remove metformin from the body. Use with care in kidney problems.',
    ar: 'قد يؤثّر الإيبوبروفين في الكليتين اللتين تخلّصان الجسم من الميتفورمين. يُستعمل بحذر عند وجود مشكلات في الكلى.',
  },
  {
    ingredients: ['cetirizine', 'loratadine'],
    severity: 'moderate',
    en: 'Both are antihistamines. Taking two adds side effects such as drowsiness without extra benefit.',
    ar: 'كلاهما مضاد للهيستامين. تناول الاثنين يزيد الآثار الجانبية كالنعاس دون فائدة إضافية.',
  },
  {
    ingredients: ['cetirizine', 'dextromethorphan'],
    severity: 'minor',
    en: 'Both can cause drowsiness. Together the effect may be stronger.',
    ar: 'كلاهما قد يسبّب النعاس. وقد يكون التأثير أقوى عند تناولهما معًا.',
  },
];
