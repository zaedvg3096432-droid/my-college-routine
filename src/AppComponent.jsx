import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import {
  BookOpen, FlaskConical, CalendarDays, ListChecks, Compass, ClipboardList,
  StickyNote, MapPin, User, Plus, X, Pencil, Trash2, Check, ChevronLeft,
  ChevronRight, Download, Repeat, Flame, Navigation, Sunrise, Sun, Sunset,
  Moon, BookMarked, Search, CheckCircle2, Circle, LayoutGrid, List as ListIcon,
  Clock, Target, AlertTriangle, Sparkles, Bell, BellRing
} from "lucide-react";

/* ============================== CONSTANTS ============================== */

const DAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
const DAYS_AR_SHORT = ["أحد", "إثن", "ثلا", "أرب", "خمي", "جمع", "سبت"];

const ACCENTS = {
  blue:   { name: "أزرق كهربائي", value: "#0A84FF", soft: "rgba(10,132,255,0.16)" },
  green:  { name: "أخضر زمردي",   value: "#30D158", soft: "rgba(48,209,88,0.16)" },
  amber:  { name: "كهرماني دافئ", value: "#FFD60A", soft: "rgba(255,214,10,0.16)" },
  orange: { name: "برتقالي ناري", value: "#FF6B35", soft: "rgba(255,107,53,0.16)" },
};

const STORAGE_KEYS = {
  classes: "mcr_classes_v1",
  events: "mcr_events_v1",
  habits: "mcr_habits_v1",
  tasks: "mcr_tasks_v1",
  notes: "mcr_notes_v1",
  athkar: "mcr_athkar_progress_v1",
  location: "mcr_location_v1",
};

const EVENT_TYPES = {
  midterm: { label: "امتحان نصف الفصل", accent: "orange", emoji: "📝" },
  final: { label: "امتحان نهائي", accent: "orange", emoji: "🎓" },
  project: { label: "تسليم مشروع", accent: "blue", emoji: "💻" },
  personal: { label: "موعد شخصي", accent: "green", emoji: "📌" },
};
const CUSTOM_TYPE_META = { label: "أخرى", accent: "amber", emoji: "🏷️" };
function getEventMeta(ev) {
  if (ev.type === "custom") {
    return { label: (ev.customType || "").trim() || CUSTOM_TYPE_META.label, accent: CUSTOM_TYPE_META.accent, emoji: CUSTOM_TYPE_META.emoji };
  }
  return EVENT_TYPES[ev.type] || EVENT_TYPES.personal;
}

const RECURRENCE_LABELS = {
  none: "مرة واحدة",
  daily: "يوميًا",
  weekly: "أسبوعيًا",
  specific: "أيام محددة",
};

const HABIT_EMOJIS = ["💧", "📖", "🏃", "🧘", "💊", "🛌", "🍎", "✍️", "🕌", "💪", "📵", "🎯", "🧠", "☕"];

const PRIORITIES = {
  high: { label: "عالية", color: "#FF453A", emoji: "🔴" },
  medium: { label: "متوسطة", color: "#FFD60A", emoji: "🟡" },
  low: { label: "منخفضة", color: "#0A84FF", emoji: "🔵" },
};

/* ============================== UTILITIES ============================== */

const pad2 = (n) => String(Math.trunc(n)).padStart(2, "0");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function timeToMinutes(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function formatTime12(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  const period = h < 12 ? "ص" : "م";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${pad2(hh)}:${pad2(m)} ${period}`;
}

function formatDate12(date) {
  const h = date.getHours(), m = date.getMinutes(), s = date.getSeconds();
  const period = h < 12 ? "ص" : "م";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${pad2(hh)}:${pad2(m)}:${pad2(s)} ${period}`;
}

function formatArabicFullDate(date) {
  try {
    return date.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  } catch (e) {
    return date.toDateString();
  }
}

function formatCountdown(ms) {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return { h, m, s, text: `${pad2(h)}:${pad2(m)}:${pad2(s)}` };
}

function relativeDayLabel(dateStr) {
  const today = todayStr();
  const tmr = todayStr(addDays(new Date(), 1));
  const y = todayStr(addDays(new Date(), -1));
  if (dateStr === today) return "اليوم";
  if (dateStr === tmr) return "غدًا";
  if (dateStr === y) return "أمس";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "long" });
}

/** Next occurrence of a weekly class (day 0-6, time HH:MM) relative to `now` */
function nextClassOccurrence(cls, now) {
  const [h, m] = cls.start.split(":").map(Number);
  let diff = (cls.day - now.getDay() + 7) % 7;
  let d = new Date(now);
  d.setDate(now.getDate() + diff);
  d.setHours(h, m, 0, 0);
  if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 7);
  return d;
}

/* ---- ICS calendar export ---- */
function generateICS(ev) {
  const dt = new Date(`${ev.date}T${ev.time}:00`);
  const dtEnd = new Date(dt.getTime() + 60 * 60 * 1000);
  const fmt = (d) =>
    d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) + "T" +
    pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + "00Z";
  let rrule = "";
  if (ev.recurrence === "daily") rrule = "RRULE:FREQ=DAILY\r\n";
  else if (ev.recurrence === "weekly") rrule = "RRULE:FREQ=WEEKLY\r\n";
  else if (ev.recurrence === "specific" && ev.days && ev.days.length) {
    const map = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
    rrule = `RRULE:FREQ=WEEKLY;BYDAY=${ev.days.map((d) => map[d]).join(",")}\r\n`;
  }
  const esc = (s) => (s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  return (
    "BEGIN:VCALENDAR\r\n" +
    "VERSION:2.0\r\n" +
    "PRODID:-//My College Routine//AR//EN\r\n" +
    "CALSCALE:GREGORIAN\r\n" +
    "BEGIN:VEVENT\r\n" +
    `UID:${ev.id}@my-college-routine\r\n` +
    `DTSTAMP:${fmt(new Date())}\r\n` +
    `DTSTART:${fmt(dt)}\r\n` +
    `DTEND:${fmt(dtEnd)}\r\n` +
    `SUMMARY:${esc(ev.title)}\r\n` +
    `LOCATION:${esc(ev.location)}\r\n` +
    `DESCRIPTION:${esc(ev.notes)}\r\n` +
    rrule +
    "END:VEVENT\r\n" +
    "END:VCALENDAR\r\n"
  );
}

function downloadICS(ev) {
  const ics = generateICS(ev);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${ev.title || "event"}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---- Astronomical prayer-time & Qibla calculation (NOAA solar-position method) ---- */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}

function calcPrayerMinutes(date, lat, lng, tzOffsetHours) {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const N = dayOfYear(date);
  const gamma = (2 * Math.PI / 365) * (N - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);

  const latRad = lat * D2R;
  function hourAngleDeg(altitudeDeg) {
    const altRad = altitudeDeg * D2R;
    const cosH = (Math.sin(altRad) - Math.sin(latRad) * Math.sin(decl)) / (Math.cos(latRad) * Math.cos(decl));
    return Math.acos(Math.max(-1, Math.min(1, cosH))) * R2D;
  }

  const solarNoonUTCmin = 720 - 4 * lng - eqTime;
  const noonLocalMin = solarNoonUTCmin + tzOffsetHours * 60;

  const fajrAngle = 19.5, ishaAngle = 17.5, sunAngle = 0.833, asrFactor = 1;
  const absLatDecl = Math.abs(latRad - decl);
  const asrAltitude = R2D * Math.atan(1 / (asrFactor + Math.tan(absLatDecl)));

  return {
    fajr: noonLocalMin - 4 * hourAngleDeg(-fajrAngle),
    sunrise: noonLocalMin - 4 * hourAngleDeg(-sunAngle),
    dhuhr: noonLocalMin + 2,
    asr: noonLocalMin + 4 * hourAngleDeg(asrAltitude),
    maghrib: noonLocalMin + 4 * hourAngleDeg(-sunAngle),
    isha: noonLocalMin + 4 * hourAngleDeg(-ishaAngle),
  };
}

function minutesToDateToday(mins) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setMinutes(Math.round(mins));
  return d;
}

function getQiblaBearing(lat, lng) {
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const meccaLat = 21.4225 * D2R, meccaLng = 39.8262 * D2R;
  const phi1 = lat * D2R, lambda1 = lng * D2R;
  const y = Math.sin(meccaLng - lambda1) * Math.cos(meccaLat);
  const x = Math.cos(phi1) * Math.sin(meccaLat) - Math.sin(phi1) * Math.cos(meccaLat) * Math.cos(meccaLng - lambda1);
  const brng = Math.atan2(y, x) * R2D;
  return (brng + 360) % 360;
}

/* ============================== NOTIFICATIONS (native + web hybrid) ============================== */

const IS_NATIVE = typeof Capacitor !== "undefined" && Capacitor.isNativePlatform && Capacitor.isNativePlatform();

/** Stable 31-bit positive int id required by Capacitor LocalNotifications, derived from a string id */
function habitNotifId(habitId) {
  let hash = 0;
  const s = String(habitId);
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) & 0x7fffffff;
  }
  return hash || 1;
}

async function getNotificationPermission() {
  if (IS_NATIVE) {
    try {
      const res = await LocalNotifications.checkPermissions();
      return res.display; // 'granted' | 'denied' | 'prompt'
    } catch (e) { return "denied"; }
  }
  if (typeof window !== "undefined" && "Notification" in window) return Notification.permission;
  return "unsupported";
}

async function requestNotificationPermission() {
  if (IS_NATIVE) {
    try {
      const res = await LocalNotifications.requestPermissions();
      return res.display;
    } catch (e) { return "denied"; }
  }
  if (typeof window !== "undefined" && "Notification" in window) {
    try { return await Notification.requestPermission(); } catch (e) { return "denied"; }
  }
  return "unsupported";
}

/** Schedules (or cancels) a real OS-level repeating daily alarm for a habit's reminder time. Native only — survives app close & reboot. */
async function syncNativeHabitReminder(habit) {
  if (!IS_NATIVE) return;
  const id = habitNotifId(habit.id);
  try {
    await LocalNotifications.cancel({ notifications: [{ id }] });
  } catch (e) {}
  if (!habit.reminderTime) return;
  const [h, m] = habit.reminderTime.split(":").map(Number);
  try {
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title: "⏰ تذكير: " + habit.title,
          body: `حان وقت "${habit.title}" (${habit.targetValue} ${habit.targetUnit})`,
          schedule: { on: { hour: h, minute: m }, repeats: true, allowWhileIdle: true },
          smallIcon: "ic_stat_icon_config_sample",
        },
      ],
    });
  } catch (e) {}
}

async function cancelAllNativeReminders(habitIds) {
  if (!IS_NATIVE) return;
  try {
    await LocalNotifications.cancel({ notifications: habitIds.map((id) => ({ id: habitNotifId(id) })) });
  } catch (e) {}
}

/* ============================== STORAGE HOOK ============================== */

function useLocalStorage(key, initial) {
  const [state, setState] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return typeof initial === "function" ? initial() : initial;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {}
  }, [key, state]);
  return [state, setState];
}

/* ============================== SEED DATA ============================== */

function seedClasses() {
  return [
    { id: uid(), subject: "هياكل بيانات", type: "lecture", instructor: "د. أحمد سمير", location: "مدرج ج", day: new Date().getDay(), start: "10:00", end: "11:30", accent: "blue" },
  ];
}
function seedEvents() {
  const d = addDays(new Date(), 6);
  return [
    { id: uid(), title: "امتحان نصف الفصل - قواعد بيانات", type: "midterm", date: todayStr(d), time: "09:00", recurrence: "none", days: [], location: "قاعة الامتحانات 3", notes: "إحضار الآلة الحاسبة وبطاقة الطالب" },
  ];
}
function seedHabits() {
  return [
    { id: uid(), title: "شرب الماء", targetValue: 2000, targetUnit: "مل", recurrence: "daily", icon: "💧", completions: {} },
  ];
}
function seedTasks() {
  return [
    { id: uid(), title: "مراجعة محاضرة الخوارزميات", priority: "high", category: "دراسة", completed: false, createdAt: Date.now() },
  ];
}
function seedNotes() {
  return [
    { id: uid(), title: "ملخص محاضرة الشبكات", content: "بروتوكول TCP يضمن وصول البيانات بترتيب صحيح، بعكس UDP الذي يركز على السرعة. مراجعة الفرق قبل الامتحان.", category: "دراسة", createdAt: Date.now(), updatedAt: Date.now() },
  ];
}

const MORNING_ATHKAR = [
  { id: "m1", title: "آية الكرسي", count: 1, text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ" },
  { id: "m2", title: "أصبحنا وأصبح الملك لله", count: 1, text: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ" },
  { id: "m3", title: "سورة الإخلاص", count: 3, text: "قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾ اللَّهُ الصَّمَدُ ﴿٢﴾ لَمْ يَلِدْ وَلَمْ يُولَدْ ﴿٣﴾ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ ﴿٤﴾" },
  { id: "m4", title: "سورة الفلق", count: 3, text: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ﴿١﴾ مِن شَرِّ مَا خَلَقَ ﴿٢﴾ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ﴿٣﴾ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ﴿٤﴾ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ ﴿٥﴾" },
  { id: "m5", title: "سورة الناس", count: 3, text: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ﴿١﴾ مَلِكِ النَّاسِ ﴿٢﴾ إِلَٰهِ النَّاسِ ﴿٣﴾ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ﴿٤﴾ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ﴿٥﴾ مِنَ الْجِنَّةِ وَالنَّاسِ ﴿٦﴾" },
  { id: "m6", title: "حسبي الله لا إله إلا هو", count: 7, text: "حَسْبِيَ اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ" },
];

const EVENING_ATHKAR = [
  { id: "e1", title: "آية الكرسي", count: 1, text: "اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ ۚ لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ ۚ لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ ۗ مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَيْءٍ مِّنْ عِلْمِهِ إِلَّا بِمَا شَاءَ ۚ وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ ۖ وَلَا يَئُودُهُ حِفْظُهُمَا ۚ وَهُوَ الْعَلِيُّ الْعَظِيمُ" },
  { id: "e2", title: "أمسينا وأمسى الملك لله", count: 1, text: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَٰهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَىٰ كُلِّ شَيْءٍ قَدِيرٌ" },
  { id: "e3", title: "سورة الإخلاص", count: 3, text: "قُلْ هُوَ اللَّهُ أَحَدٌ ﴿١﴾ اللَّهُ الصَّمَدُ ﴿٢﴾ لَمْ يَلِدْ وَلَمْ يُولَدْ ﴿٣﴾ وَلَمْ يَكُن لَّهُ كُفُوًا أَحَدٌ ﴿٤﴾" },
  { id: "e4", title: "سورة الفلق", count: 3, text: "قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ ﴿١﴾ مِن شَرِّ مَا خَلَقَ ﴿٢﴾ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ﴿٣﴾ وَمِن شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ ﴿٤﴾ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ ﴿٥﴾" },
  { id: "e5", title: "سورة الناس", count: 3, text: "قُلْ أَعُوذُ بِرَبِّ النَّاسِ ﴿١﴾ مَلِكِ النَّاسِ ﴿٢﴾ إِلَٰهِ النَّاسِ ﴿٣﴾ مِن شَرِّ الْوَسْوَاسِ الْخَنَّاسِ ﴿٤﴾ الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ ﴿٥﴾ مِنَ الْجِنَّةِ وَالنَّاسِ ﴿٦﴾" },
  { id: "e6", title: "سيد الاستغفار", count: 1, text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَٰهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَىٰ عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ" },
];

const PRAYER_META = [
  { key: "fajr", label: "الفجر", icon: Moon },
  { key: "sunrise", label: "الشروق", icon: Sunrise },
  { key: "dhuhr", label: "الظهر", icon: Sun },
  { key: "asr", label: "العصر", icon: Sun },
  { key: "maghrib", label: "المغرب", icon: Sunset },
  { key: "isha", label: "العشاء", icon: Moon },
];

/* ============================== SHARED UI ============================== */

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="mcr-overlay" onClick={onClose}>
      <div className={"mcr-modal" + (wide ? " mcr-modal-wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="mcr-modal-head">
          <h3>{title}</h3>
          <button className="mcr-icon-btn" onClick={onClose} aria-label="إغلاق"><X size={20} /></button>
        </div>
        <div className="mcr-modal-body">{children}</div>
      </div>
    </div>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p className="mcr-form-error"><AlertTriangle size={13} /> {msg}</p>;
}

function Field({ label, children }) {
  return (
    <label className="mcr-field">
      <span className="mcr-field-label">{label}</span>
      {children}
    </label>
  );
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="mcr-segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={"mcr-segment" + (value === opt.value ? " active" : "")}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.icon ? <opt.icon size={15} /> : null}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="mcr-empty">
      <div className="mcr-empty-icon"><Icon size={26} /></div>
      <p className="mcr-empty-title">{title}</p>
      {subtitle ? <p className="mcr-empty-sub">{subtitle}</p> : null}
    </div>
  );
}

function ConfirmDelete({ onConfirm, onCancel, label }) {
  return (
    <div className="mcr-confirm-row">
      <span>{label || "هل أنت متأكد من الحذف؟"}</span>
      <div className="mcr-confirm-actions">
        <button className="mcr-btn-danger-solid" onClick={onConfirm} type="button">حذف</button>
        <button className="mcr-btn-ghost" onClick={onCancel} type="button">إلغاء</button>
      </div>
    </div>
  );
}

function AccentPicker({ value, onChange }) {
  return (
    <div className="mcr-accent-picker">
      {Object.entries(ACCENTS).map(([key, a]) => (
        <button
          key={key}
          type="button"
          className={"mcr-accent-dot" + (value === key ? " selected" : "")}
          style={{ background: a.value }}
          onClick={() => onChange(key)}
          aria-label={a.name}
          title={a.name}
        >
          {value === key ? <Check size={14} color="#0B0F17" /> : null}
        </button>
      ))}
    </div>
  );
}

/* ============================== STATUS HEADER & NAV ============================== */

const TABS = [
  { key: "lectures", label: "الجدول", icon: BookOpen },
  { key: "appointments", label: "مواعيدي", icon: CalendarDays },
  { key: "habits", label: "العادات", icon: ListChecks },
  { key: "prayer", label: "الصلاة", icon: Compass },
  { key: "tasks", label: "المهام", icon: ClipboardList },
  { key: "notes", label: "الأفكار", icon: StickyNote },
];

function StatusHeader({ now, tabLabel }) {
  return (
    <div className="mcr-status-header">
      <div className="mcr-status-top">
        <span className="mcr-status-time">{formatDate12(now)}</span>
        <span className="mcr-status-brand"><Sparkles size={13} /> روتيني الجامعي</span>
      </div>
      <div className="mcr-status-bottom">
        <h1>{tabLabel}</h1>
        <span className="mcr-status-date">{formatArabicFullDate(now)}</span>
      </div>
    </div>
  );
}

function BottomNav({ active, onChange }) {
  return (
    <nav className="mcr-bottom-nav">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={"mcr-nav-btn" + (active === t.key ? " active" : "")}
          onClick={() => onChange(t.key)}
          type="button"
        >
          <t.icon size={21} strokeWidth={active === t.key ? 2.4 : 1.8} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/* ============================== TAB 1: LECTURES ============================== */

function NextSessionHero({ classes, now }) {
  const next = useMemo(() => {
    if (!classes.length) return null;
    let best = null, bestDate = null;
    for (const c of classes) {
      const d = nextClassOccurrence(c, now);
      if (!bestDate || d < bestDate) { bestDate = d; best = c; }
    }
    return best ? { cls: best, date: bestDate } : null;
  }, [classes, now]);

  if (!next) {
    return (
      <div className="mcr-hero mcr-hero-empty">
        <BookOpen size={24} />
        <p>لا توجد محاضرات مُجدولة بعد. أضف أول محاضرة لك 🎓</p>
      </div>
    );
  }

  const diff = next.date.getTime() - now.getTime();
  const { text } = formatCountdown(diff);
  const accent = ACCENTS[next.cls.accent] || ACCENTS.blue;
  const isLab = next.cls.type === "lab";

  return (
    <div className="mcr-hero" style={{ borderColor: accent.value + "55", background: `linear-gradient(145deg, ${accent.soft}, rgba(22,29,42,0.9))` }}>
      <div className="mcr-hero-top">
        <span className="mcr-hero-eyebrow">الجلسة القادمة</span>
        <span className="mcr-hero-type-badge" style={{ background: accent.soft, color: accent.value }}>
          {isLab ? "🧪 سكشن / معمل" : "📖 محاضرة"}
        </span>
      </div>
      <h2 className="mcr-hero-subject">{next.cls.subject}</h2>
      <div className="mcr-hero-countdown" style={{ color: accent.value }}>{text}</div>
      <div className="mcr-hero-badges">
        <span className="mcr-mini-badge"><User size={13} /> {next.cls.instructor || "—"}</span>
        <span className="mcr-mini-badge"><MapPin size={13} /> {next.cls.location || "—"}</span>
        <span className="mcr-mini-badge"><Clock size={13} /> {formatTime12(next.cls.start)} - {formatTime12(next.cls.end)}</span>
      </div>
      <span className="mcr-hero-day">{DAYS_AR[next.cls.day]}</span>
    </div>
  );
}

function ClassFormModal({ open, onClose, onSave, onDelete, initial }) {
  const blank = { subject: "", type: "lecture", instructor: "", location: "", day: new Date().getDay(), start: "10:00", end: "11:30", accent: "blue" };
  const [form, setForm] = useState(blank);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ? { ...initial } : blank);
    setConfirmingDelete(false);
    setError("");
  }, [initial, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.subject.trim()) { setError("يرجى إدخال اسم المادة أولًا"); return; }
    if (!form.start || !form.end) { setError("يرجى تحديد وقت البداية والنهاية"); return; }
    setError("");
    onSave({ ...form, id: initial ? initial.id : uid() });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "تعديل المحاضرة" : "إضافة محاضرة جديدة"}>
      <form onSubmit={submit} className="mcr-form" noValidate>
        <Field label="اسم المادة">
          <input className="mcr-input" value={form.subject} onChange={set("subject")} placeholder="مثال: هياكل بيانات" />
        </Field>
        <Field label="نوع الجلسة">
          <SegmentedControl
            options={[{ value: "lecture", label: "محاضرة", icon: BookOpen }, { value: "lab", label: "سكشن / معمل", icon: FlaskConical }]}
            value={form.type}
            onChange={(v) => setForm((f) => ({ ...f, type: v }))}
          />
        </Field>
        <div className="mcr-form-row">
          <Field label="اسم الدكتور / المعيد">
            <input className="mcr-input" value={form.instructor} onChange={set("instructor")} placeholder="د. / م." />
          </Field>
          <Field label="المكان">
            <input className="mcr-input" value={form.location} onChange={set("location")} placeholder="مدرج / قاعة" />
          </Field>
        </div>
        <Field label="اليوم">
          <select className="mcr-input" value={form.day} onChange={(e) => setForm((f) => ({ ...f, day: Number(e.target.value) }))}>
            {DAYS_AR.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </Field>
        <div className="mcr-form-row">
          <Field label="وقت البداية">
            <input type="time" className="mcr-input" value={form.start} onChange={set("start")} />
          </Field>
          <Field label="وقت النهاية">
            <input type="time" className="mcr-input" value={form.end} onChange={set("end")} />
          </Field>
        </div>
        <Field label="اللون المميز">
          <AccentPicker value={form.accent} onChange={(v) => setForm((f) => ({ ...f, accent: v }))} />
        </Field>
        <FieldError msg={error} />

        <div className="mcr-modal-actions">
          <button type="submit" className="mcr-btn-primary"><Check size={16} /> {initial ? "حفظ التعديلات" : "إضافة المحاضرة"}</button>
          {initial && !confirmingDelete && (
            <button type="button" className="mcr-btn-danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} /> حذف</button>
          )}
        </div>
        {confirmingDelete && (
          <ConfirmDelete onConfirm={() => onDelete(initial.id)} onCancel={() => setConfirmingDelete(false)} label="حذف هذه المحاضرة نهائيًا؟" />
        )}
      </form>
    </Modal>
  );
}

function DailyTimeline({ classes, selectedDay, setSelectedDay, onEdit }) {
  const dayClasses = classes.filter((c) => c.day === selectedDay).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return (
    <div>
      <div className="mcr-day-pills">
        {DAYS_AR_SHORT.map((d, i) => (
          <button key={i} className={"mcr-day-pill" + (selectedDay === i ? " active" : "") + (i === new Date().getDay() ? " today" : "")} onClick={() => setSelectedDay(i)} type="button">
            {d}
          </button>
        ))}
      </div>
      {dayClasses.length === 0 ? (
        <EmptyState icon={BookOpen} title={`لا توجد محاضرات يوم ${DAYS_AR[selectedDay]}`} subtitle="استمتع بيوم إجازة أو أضف جلسة جديدة" />
      ) : (
        <div className="mcr-timeline">
          {dayClasses.map((c) => {
            const accent = ACCENTS[c.accent] || ACCENTS.blue;
            return (
              <div key={c.id} className="mcr-timeline-item" onClick={() => onEdit(c)}>
                <div className="mcr-timeline-time">
                  <span>{formatTime12(c.start)}</span>
                  <span className="mcr-timeline-time-sub">{formatTime12(c.end)}</span>
                </div>
                <div className="mcr-timeline-line" style={{ background: accent.value }} />
                <div className="mcr-timeline-card" style={{ borderColor: accent.value + "40" }}>
                  <div className="mcr-timeline-card-head">
                    <span className="mcr-type-chip" style={{ background: accent.soft, color: accent.value }}>
                      {c.type === "lab" ? "🧪 سكشن" : "📖 محاضرة"}
                    </span>
                    <Pencil size={14} className="mcr-edit-hint" />
                  </div>
                  <h4>{c.subject}</h4>
                  <div className="mcr-timeline-meta">
                    {c.instructor && <span><User size={12} /> {c.instructor}</span>}
                    {c.location && <span><MapPin size={12} /> {c.location}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeeklyGrid({ classes, onEdit }) {
  return (
    <div className="mcr-week-grid">
      {DAYS_AR.map((d, i) => {
        const items = classes.filter((c) => c.day === i).sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
        return (
          <div key={i} className="mcr-week-col">
            <div className={"mcr-week-col-head" + (i === new Date().getDay() ? " today" : "")}>{d}</div>
            {items.length === 0 ? (
              <div className="mcr-week-empty">—</div>
            ) : items.map((c) => {
              const accent = ACCENTS[c.accent] || ACCENTS.blue;
              return (
                <div key={c.id} className="mcr-week-card" style={{ background: accent.soft, borderColor: accent.value + "55" }} onClick={() => onEdit(c)}>
                  <span className="mcr-week-card-time">{formatTime12(c.start)}</span>
                  <span className="mcr-week-card-subject">{c.subject}</span>
                  <span className="mcr-week-card-loc">{c.location}</span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function LecturesTab({ classes, setClasses, now }) {
  const [view, setView] = useState("daily");
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (c) => { setEditing(c); setModalOpen(true); };

  const save = (cls) => {
    setClasses((prev) => {
      const exists = prev.some((c) => c.id === cls.id);
      return exists ? prev.map((c) => (c.id === cls.id ? cls : c)) : [...prev, cls];
    });
    setModalOpen(false);
  };
  const del = (id) => {
    setClasses((prev) => prev.filter((c) => c.id !== id));
    setModalOpen(false);
  };

  return (
    <div className="mcr-tab-content">
      <NextSessionHero classes={classes} now={now} />

      <div className="mcr-section-head">
        <SegmentedControl
          options={[{ value: "daily", label: "يومي", icon: ListIcon }, { value: "weekly", label: "أسبوعي", icon: LayoutGrid }]}
          value={view}
          onChange={setView}
        />
        <button className="mcr-fab-inline" onClick={openAdd} type="button"><Plus size={17} /> إضافة</button>
      </div>

      {view === "daily" ? (
        <DailyTimeline classes={classes} selectedDay={selectedDay} setSelectedDay={setSelectedDay} onEdit={openEdit} />
      ) : (
        <WeeklyGrid classes={classes} onEdit={openEdit} />
      )}

      <ClassFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={save} onDelete={del} initial={editing} />
    </div>
  );
}

/* ============================== TAB 2: APPOINTMENTS & EXAMS ============================== */

function EventFormModal({ open, onClose, onSave, onDelete, initial }) {
  const blank = { title: "", type: "midterm", customType: "", date: todayStr(), time: "09:00", recurrence: "none", days: [], location: "", notes: "" };
  const [form, setForm] = useState(blank);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ? { customType: "", ...initial } : blank);
    setConfirmingDelete(false);
    setError("");
  }, [initial, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggleDay = (i) => {
    setForm((f) => {
      const days = f.days.includes(i) ? f.days.filter((d) => d !== i) : [...f.days, i].sort();
      return { ...f, days };
    });
  };

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("يرجى إدخال عنوان الموعد"); return; }
    if (form.type === "custom" && !form.customType.trim()) { setError("يرجى كتابة اسم النوع المخصص"); return; }
    if (!form.date || !form.time) { setError("يرجى تحديد التاريخ والوقت"); return; }
    setError("");
    onSave({ ...form, id: initial ? initial.id : uid() });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "تعديل الموعد" : "إضافة موعد جديد"}>
      <form onSubmit={submit} className="mcr-form" noValidate>
        <Field label="العنوان">
          <input className="mcr-input" value={form.title} onChange={set("title")} placeholder="مثال: امتحان نهائي - برمجة" />
        </Field>
        <Field label="النوع">
          <div className="mcr-type-grid">
            {Object.entries(EVENT_TYPES).map(([key, t]) => (
              <button key={key} type="button" className={"mcr-type-tile" + (form.type === key ? " active" : "")} onClick={() => setForm((f) => ({ ...f, type: key }))}>
                <span>{t.emoji}</span>{t.label}
              </button>
            ))}
            <button type="button" className={"mcr-type-tile" + (form.type === "custom" ? " active" : "")} onClick={() => setForm((f) => ({ ...f, type: "custom" }))}>
              <span>{CUSTOM_TYPE_META.emoji}</span>{CUSTOM_TYPE_META.label}
            </button>
          </div>
        </Field>
        {form.type === "custom" && (
          <Field label="اكتب نوع الموعد">
            <input className="mcr-input" value={form.customType} onChange={set("customType")} placeholder="مثال: اجتماع فريق، محاضرة إضافية..." />
          </Field>
        )}
        <div className="mcr-form-row">
          <Field label="التاريخ">
            <input type="date" className="mcr-input" value={form.date} onChange={set("date")} />
          </Field>
          <Field label="الوقت">
            <input type="time" className="mcr-input" value={form.time} onChange={set("time")} />
          </Field>
        </div>
        <Field label="التكرار">
          <select className="mcr-input" value={form.recurrence} onChange={set("recurrence")}>
            {Object.entries(RECURRENCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        {form.recurrence === "specific" && (
          <Field label="أيام التكرار">
            <div className="mcr-day-pills">
              {DAYS_AR_SHORT.map((d, i) => (
                <button key={i} type="button" className={"mcr-day-pill" + (form.days.includes(i) ? " active" : "")} onClick={() => toggleDay(i)}>{d}</button>
              ))}
            </div>
          </Field>
        )}
        <Field label="المكان (اختياري)">
          <input className="mcr-input" value={form.location} onChange={set("location")} placeholder="القاعة / المبنى" />
        </Field>
        <Field label="ملاحظات (اختياري)">
          <textarea className="mcr-input mcr-textarea" value={form.notes} onChange={set("notes")} rows={2} placeholder="تفاصيل إضافية..." />
        </Field>
        <FieldError msg={error} />

        <div className="mcr-modal-actions">
          <button type="submit" className="mcr-btn-primary"><Check size={16} /> {initial ? "حفظ التعديلات" : "إضافة الموعد"}</button>
          {initial && !confirmingDelete && (
            <button type="button" className="mcr-btn-danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} /> حذف</button>
          )}
        </div>
        {confirmingDelete && (
          <ConfirmDelete onConfirm={() => onDelete(initial.id)} onCancel={() => setConfirmingDelete(false)} label="حذف هذا الموعد نهائيًا؟" />
        )}
      </form>
    </Modal>
  );
}

function EventCard({ ev, now, onEdit }) {
  const meta = getEventMeta(ev);
  const accent = ACCENTS[meta.accent];
  const target = new Date(`${ev.date}T${ev.time}:00`);
  const diff = target.getTime() - now.getTime();
  const isPast = diff < 0;
  const { h, m, text } = formatCountdown(diff);

  return (
    <div className="mcr-event-card" style={{ borderColor: accent.value + "40" }}>
      <div className="mcr-event-top">
        <span className="mcr-type-chip" style={{ background: accent.soft, color: accent.value }}>{meta.emoji} {meta.label}</span>
        <button className="mcr-icon-btn-sm" onClick={() => onEdit(ev)} type="button"><Pencil size={14} /></button>
      </div>
      <h4>{ev.title}</h4>
      <div className="mcr-event-meta">
        <span><CalendarDays size={13} /> {relativeDayLabel(ev.date)} — {formatTime12(ev.time)}</span>
        {ev.location && <span><MapPin size={13} /> {ev.location}</span>}
        {ev.recurrence !== "none" && <span><Repeat size={13} /> {RECURRENCE_LABELS[ev.recurrence]}</span>}
      </div>
      {ev.notes && <p className="mcr-event-notes">{ev.notes}</p>}
      <div className="mcr-event-bottom">
        {isPast ? (
          <span className="mcr-event-past">انتهى الموعد</span>
        ) : (
          <span className="mcr-event-countdown" style={{ color: accent.value }}>
            {h > 48 ? `متبقي ${Math.floor(h / 24)} يوم` : text}
          </span>
        )}
        <button className="mcr-btn-ghost-sm" onClick={() => downloadICS(ev)} type="button"><Download size={14} /> إضافة للتقويم</button>
      </div>
    </div>
  );
}

function AppointmentsTab({ events, setEvents, now }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (ev) => { setEditing(ev); setModalOpen(true); };

  const save = (ev) => {
    setEvents((prev) => {
      const exists = prev.some((e) => e.id === ev.id);
      return exists ? prev.map((e) => (e.id === ev.id ? ev : e)) : [...prev, ev];
    });
    setModalOpen(false);
  };
  const del = (id) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setModalOpen(false);
  };

  const sorted = [...events].sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));

  return (
    <div className="mcr-tab-content">
      <div className="mcr-section-head">
        <p className="mcr-section-hint">{events.length} موعد مسجّل</p>
        <button className="mcr-fab-inline" onClick={openAdd} type="button"><Plus size={17} /> موعد جديد</button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon={CalendarDays} title="لا توجد مواعيد بعد" subtitle="أضف امتحانًا أو موعد تسليم مشروع لتتبعه هنا" />
      ) : (
        <div className="mcr-event-list">
          {sorted.map((ev) => <EventCard key={ev.id} ev={ev} now={now} onEdit={openEdit} />)}
        </div>
      )}

      <EventFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={save} onDelete={del} initial={editing} />
    </div>
  );
}

/* ============================== TAB 3: HABIT TRACKER ============================== */

function getWeekDates() {
  const now = new Date();
  const start = addDays(now, -now.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function calcStreak(completions) {
  let streak = 0;
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // if today not completed yet, start counting from yesterday
  if (!completions[todayStr(cursor)]) cursor = addDays(cursor, -1);
  while (completions[todayStr(cursor)]) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function HabitFormModal({ open, onClose, onSave, onDelete, initial }) {
  const blank = { title: "", targetValue: 1, targetUnit: "مرة", recurrence: "daily", icon: "🎯", reminderTime: "", completions: {} };
  const [form, setForm] = useState(blank);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ? { reminderTime: "", ...initial } : blank);
    setConfirmingDelete(false);
    setError("");
  }, [initial, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setError("يرجى إدخال اسم العادة"); return; }
    setError("");
    onSave({ ...form, targetValue: Number(form.targetValue) || 1, id: initial ? initial.id : uid(), completions: form.completions || {} });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "تعديل العادة" : "عادة جديدة"}>
      <form onSubmit={submit} className="mcr-form" noValidate>
        <Field label="اسم العادة">
          <input className="mcr-input" value={form.title} onChange={set("title")} placeholder="مثال: قراءة كتاب" />
        </Field>
        <div className="mcr-form-row">
          <Field label="القيمة المستهدفة">
            <input type="number" min="1" className="mcr-input" value={form.targetValue} onChange={set("targetValue")} />
          </Field>
          <Field label="الوحدة">
            <input className="mcr-input" value={form.targetUnit} onChange={set("targetUnit")} placeholder="مل / صفحة / ساعة" />
          </Field>
        </div>
        <Field label="التكرار">
          <SegmentedControl options={[{ value: "daily", label: "يوميًا" }, { value: "weekly", label: "أسبوعيًا" }]} value={form.recurrence} onChange={(v) => setForm((f) => ({ ...f, recurrence: v }))} />
        </Field>
        <Field label="وقت التذكير (اختياري)">
          <div className="mcr-form-row">
            <input type="time" className="mcr-input" value={form.reminderTime} onChange={set("reminderTime")} />
            {form.reminderTime && (
              <button type="button" className="mcr-btn-ghost-sm" onClick={() => setForm((f) => ({ ...f, reminderTime: "" }))}><X size={13} /> مسح</button>
            )}
          </div>
          <span className="mcr-field-hint">سيصلك تنبيه من المتصفح في هذا الوقت طالما التطبيق مفتوح</span>
        </Field>
        <Field label="الأيقونة">
          <div className="mcr-emoji-grid">
            {HABIT_EMOJIS.map((em) => (
              <button key={em} type="button" className={"mcr-emoji-btn" + (form.icon === em ? " selected" : "")} onClick={() => setForm((f) => ({ ...f, icon: em }))}>{em}</button>
            ))}
          </div>
        </Field>
        <FieldError msg={error} />

        <div className="mcr-modal-actions">
          <button type="submit" className="mcr-btn-primary"><Check size={16} /> {initial ? "حفظ التعديلات" : "إضافة العادة"}</button>
          {initial && !confirmingDelete && (
            <button type="button" className="mcr-btn-danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} /> حذف</button>
          )}
        </div>
        {confirmingDelete && (
          <ConfirmDelete onConfirm={() => onDelete(initial.id)} onCancel={() => setConfirmingDelete(false)} label="حذف هذه العادة نهائيًا؟" />
        )}
      </form>
    </Modal>
  );
}

function HabitRow({ habit, onToggleToday, onEdit }) {
  const week = getWeekDates();
  const streak = calcStreak(habit.completions || {});
  const today = todayStr();

  return (
    <div className="mcr-habit-card">
      <div className="mcr-habit-head">
        <div className="mcr-habit-title">
          <span className="mcr-habit-emoji">{habit.icon}</span>
          <div>
            <h4>{habit.title}</h4>
            <span className="mcr-habit-target">{habit.targetValue} {habit.targetUnit} · {habit.recurrence === "daily" ? "يوميًا" : "أسبوعيًا"}</span>
          </div>
        </div>
        <div className="mcr-habit-right">
          {habit.reminderTime && <span className="mcr-reminder-badge"><Bell size={12} /> {formatTime12(habit.reminderTime)}</span>}
          {streak > 0 && <span className="mcr-streak-badge"><Flame size={14} /> {streak}</span>}
          <button className="mcr-icon-btn-sm" onClick={() => onEdit(habit)} type="button"><Pencil size={14} /></button>
        </div>
      </div>
      <div className="mcr-habit-grid">
        {week.map((d, i) => {
          const ds = todayStr(d);
          const isToday = ds === today;
          const isFuture = ds > today;
          const done = !!habit.completions[ds];
          let status = "upcoming";
          if (done) status = "done";
          else if (!isFuture && !isToday) status = "missed";
          else if (isToday) status = "todo";

          return (
            <button
              key={i}
              type="button"
              className={"mcr-habit-day mcr-habit-day-" + status + (isToday ? " today" : "")}
              onClick={() => isToday && onToggleToday(habit.id)}
              disabled={!isToday}
            >
              <span className="mcr-habit-day-label">{DAYS_AR_SHORT[d.getDay()]}</span>
              <span className="mcr-habit-day-icon">
                {status === "done" && <Check size={13} />}
                {status === "missed" && <X size={13} />}
                {status === "upcoming" && <Circle size={9} />}
                {status === "todo" && <Circle size={13} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Web-only fallback: fires an in-page Notification while the app tab is open (per-minute check).
 *  On native (installed app), real OS alarms from syncNativeHabitReminder() handle this instead — even when the app is closed. */
function useHabitReminders(habits, now) {
  const firedRef = useRef(new Set());

  // Native: keep the OS-level scheduled alarms in sync whenever a habit's reminder changes
  useEffect(() => {
    if (!IS_NATIVE) return;
    habits.forEach((h) => { syncNativeHabitReminder(h); });
  }, [JSON.stringify(habits.map((h) => [h.id, h.reminderTime, h.title, h.targetValue, h.targetUnit]))]);

  // Web fallback: only meaningful while this tab is open
  useEffect(() => {
    if (IS_NATIVE) return;
    if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
    const nowHM = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const today = todayStr(now);
    habits.forEach((h) => {
      if (!h.reminderTime) return;
      const key = `${h.id}_${today}`;
      const alreadyDone = !!(h.completions && h.completions[today]);
      if (h.reminderTime === nowHM && !alreadyDone && !firedRef.current.has(key)) {
        firedRef.current.add(key);
        try {
          new Notification("⏰ تذكير: " + h.title, { body: `حان وقت "${h.title}" (${h.targetValue} ${h.targetUnit})`, tag: key });
        } catch (e) {}
      }
    });
  }, [now.getMinutes(), habits]);
}

function NotificationPermissionBanner() {
  const supported = IS_NATIVE || (typeof window !== "undefined" && "Notification" in window);
  const [permission, setPermission] = useState("prompt");

  useEffect(() => {
    let mounted = true;
    getNotificationPermission().then((p) => { if (mounted) setPermission(p); });
    return () => { mounted = false; };
  }, []);

  if (!supported) return null;
  if (permission === "granted") {
    return (
      <div className="mcr-notif-banner granted">
        <BellRing size={14} /> {IS_NATIVE ? "تذكيرات العادات مفعّلة — ستصلك حتى لو التطبيق مغلق" : "تنبيهات العادات مفعّلة على هذا المتصفح"}
      </div>
    );
  }
  if (permission === "denied") {
    return <div className="mcr-notif-banner denied"><Bell size={14} /> تم حظر التنبيهات — فعّلها من إعدادات {IS_NATIVE ? "التطبيق" : "المتصفح"}</div>;
  }
  return (
    <button
      type="button"
      className="mcr-notif-banner"
      onClick={async () => { const res = await requestNotificationPermission(); setPermission(res); }}
    >
      <Bell size={14} /> فعّل التذكيرات لمواعيد عاداتك{IS_NATIVE ? "" : " (تعمل طالما المتصفح مفتوح)"}
    </button>
  );
}

function HabitsTab({ habits, setHabits }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (h) => { setEditing(h); setModalOpen(true); };

  const save = (h) => {
    setHabits((prev) => {
      const exists = prev.some((x) => x.id === h.id);
      return exists ? prev.map((x) => (x.id === h.id ? h : x)) : [...prev, h];
    });
    setModalOpen(false);
  };
  const del = (id) => {
    cancelAllNativeReminders([id]);
    setHabits((prev) => prev.filter((x) => x.id !== id));
    setModalOpen(false);
  };
  const toggleToday = (id) => {
    const ds = todayStr();
    setHabits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const completions = { ...h.completions };
      if (completions[ds]) delete completions[ds];
      else completions[ds] = true;
      return { ...h, completions };
    }));
  };

  return (
    <div className="mcr-tab-content">
      <NotificationPermissionBanner />
      <div className="mcr-section-head">
        <p className="mcr-section-hint">{habits.length} عادة نشطة</p>
        <button className="mcr-fab-inline" onClick={openAdd} type="button"><Plus size={17} /> عادة جديدة</button>
      </div>

      {habits.length === 0 ? (
        <EmptyState icon={ListChecks} title="لا توجد عادات بعد" subtitle="ابدأ بعادة بسيطة مثل شرب الماء أو القراءة اليومية" />
      ) : (
        <div className="mcr-habit-list">
          {habits.map((h) => <HabitRow key={h.id} habit={h} onToggleToday={toggleToday} onEdit={openEdit} />)}
        </div>
      )}

      <HabitFormModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={save} onDelete={del} initial={editing} />
    </div>
  );
}

/* ============================== TAB 4: PRAYER, DHIKR & QIBLA ============================== */

function usePrayerTimes(now) {
  const [coords, setCoords] = useLocalStorage(STORAGE_KEYS.location, { lat: 30.0444, lng: 31.2357, label: "القاهرة (افتراضي)" });

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: "موقعك الحالي" }),
        () => {},
        { timeout: 6000 }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tzOffset = -now.getTimezoneOffset() / 60;

  const times = useMemo(() => {
    const mins = calcPrayerMinutes(now, coords.lat, coords.lng, tzOffset);
    const obj = {};
    for (const key of Object.keys(mins)) obj[key] = minutesToDateToday(mins[key]);
    return obj;
  }, [now.toDateString(), coords.lat, coords.lng, tzOffset]);

  const qibla = useMemo(() => getQiblaBearing(coords.lat, coords.lng), [coords.lat, coords.lng]);

  return { coords, times, qibla };
}

function nextPrayer(times, now) {
  const order = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];
  for (const key of order) {
    if (times[key].getTime() > now.getTime()) return key;
  }
  return "fajr"; // tomorrow's fajr
}

function PrayerTimesList({ times, now }) {
  const next = nextPrayer(times, now);
  const nextTime = times[next].getTime() > now.getTime() ? times[next] : addDays(times[next], 1);
  const diff = nextTime.getTime() - now.getTime();
  const { text } = formatCountdown(diff);
  const nextMeta = PRAYER_META.find((p) => p.key === next);

  return (
    <div className="mcr-prayer-panel">
      <div className="mcr-prayer-next">
        <span className="mcr-hero-eyebrow">الصلاة القادمة</span>
        <div className="mcr-prayer-next-row">
          {nextMeta && <nextMeta.icon size={20} />}
          <h2>{nextMeta ? nextMeta.label : ""}</h2>
        </div>
        <div className="mcr-hero-countdown" style={{ color: "#30D158" }}>{text}</div>
      </div>
      <div className="mcr-prayer-list">
        {PRAYER_META.map((p) => {
          const isNext = p.key === next;
          return (
            <div key={p.key} className={"mcr-prayer-row" + (isNext ? " active" : "")}>
              <div className="mcr-prayer-row-label"><p.icon size={16} /> {p.label}</div>
              <span className="mcr-prayer-row-time">{formatTime12(`${pad2(times[p.key].getHours())}:${pad2(times[p.key].getMinutes())}`)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QiblaCompass({ qibla }) {
  const [heading, setHeading] = useState(null);
  const [live, setLive] = useState(false);
  const [manualRotation, setManualRotation] = useState(0);
  const dragRef = useRef(null);

  const requestCompass = async () => {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return;
      }
      window.addEventListener("deviceorientation", handleOrientation, true);
      setLive(true);
    } catch (e) {
      setLive(false);
    }
  };

  const handleOrientation = useCallback((e) => {
    const h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.alpha != null ? 360 - e.alpha : null);
    if (h != null) setHeading(h);
  }, []);

  useEffect(() => {
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, [handleOrientation]);

  const onPointerDown = (e) => { dragRef.current = { startX: e.clientX ?? e.touches?.[0]?.clientX, startRotation: manualRotation }; };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const delta = (x - dragRef.current.startX) * 1.2;
    setManualRotation(dragRef.current.startRotation + delta);
  };
  const onPointerUp = () => { dragRef.current = null; };

  const effectiveHeading = live && heading != null ? heading : manualRotation;
  const needleRotation = qibla - effectiveHeading;

  return (
    <div className="mcr-qibla-card">
      <div className="mcr-qibla-head">
        <span className="mcr-hero-eyebrow">اتجاه القبلة</span>
        <span className="mcr-qibla-deg">{Math.round(qibla)}° من الشمال</span>
      </div>
      <div
        className="mcr-compass-dial"
        onMouseDown={onPointerDown} onMouseMove={onPointerMove} onMouseUp={onPointerUp} onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown} onTouchMove={onPointerMove} onTouchEnd={onPointerUp}
        style={{ transform: `rotate(${-effectiveHeading}deg)` }}
      >
        <span className="mcr-compass-n">N</span>
        <span className="mcr-compass-e">E</span>
        <span className="mcr-compass-s">S</span>
        <span className="mcr-compass-w">W</span>
        <div className="mcr-compass-ring" />
      </div>
      <div className="mcr-compass-needle-wrap">
        <Navigation size={38} className="mcr-compass-needle" style={{ transform: `rotate(${needleRotation}deg)` }} />
      </div>
      <p className="mcr-qibla-hint">
        {live ? "🧭 البوصلة الحية مفعّلة — وجّه هاتفك حتى يشير السهم للأعلى" : "اسحب القرص يمينًا/يسارًا لمحاكاة البوصلة، أو فعّل البوصلة الحية"}
      </p>
      {!live && (
        <button className="mcr-btn-ghost-sm" onClick={requestCompass} type="button"><Compass size={14} /> تفعيل البوصلة الحية</button>
      )}
    </div>
  );
}

function AthkarTextModal({ item, onClose }) {
  if (!item) return null;
  return (
    <Modal open={!!item} onClose={onClose} title={item.title}>
      <p className="mcr-athkar-full-text">{item.text}</p>
      <p className="mcr-athkar-full-count">التكرار: {item.count} {item.count === 1 ? "مرة" : "مرات"}</p>
    </Modal>
  );
}

function AthkarSection({ label, icon: Icon, items, progress, onTap }) {
  const [readingItem, setReadingItem] = useState(null);
  return (
    <div className="mcr-athkar-section">
      <h3 className="mcr-athkar-section-title"><Icon size={16} /> {label}</h3>
      <div className="mcr-athkar-list">
        {items.map((item) => {
          const count = progress[item.id] || 0;
          const done = count >= item.count;
          return (
            <div key={item.id} className={"mcr-athkar-item" + (done ? " done" : "")}>
              <button className="mcr-athkar-text-btn" onClick={() => setReadingItem(item)} type="button">
                <BookMarked size={15} />
                <span>{item.title}</span>
              </button>
              <button className={"mcr-athkar-counter" + (done ? " done" : "")} onClick={() => onTap(item)} type="button">
                {done ? <Check size={14} /> : `${count}/${item.count}`}
              </button>
            </div>
          );
        })}
      </div>
      <AthkarTextModal item={readingItem} onClose={() => setReadingItem(null)} />
    </div>
  );
}

function PrayerTab({ now }) {
  const { times, qibla } = usePrayerTimes(now);
  const [athkarProgress, setAthkarProgress] = useLocalStorage(STORAGE_KEYS.athkar, {});
  const today = todayStr();
  const dayProgress = athkarProgress[today] || { morning: {}, evening: {} };

  const tapAthkar = (section) => (item) => {
    setAthkarProgress((prev) => {
      const day = prev[today] || { morning: {}, evening: {} };
      const current = day[section][item.id] || 0;
      const next = current >= item.count ? 0 : current + 1;
      return { ...prev, [today]: { ...day, [section]: { ...day[section], [item.id]: next } } };
    });
  };

  return (
    <div className="mcr-tab-content">
      <PrayerTimesList times={times} now={now} />
      <QiblaCompass qibla={qibla} />
      <AthkarSection label="أذكار الصباح" icon={Sunrise} items={MORNING_ATHKAR} progress={dayProgress.morning} onTap={tapAthkar("morning")} />
      <AthkarSection label="أذكار المساء" icon={Sunset} items={EVENING_ATHKAR} progress={dayProgress.evening} onTap={tapAthkar("evening")} />
    </div>
  );
}

/* ============================== TAB 5: TASKS ============================== */

function TasksTab({ tasks, setTasks }) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [category, setCategory] = useState("");
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const addTask = (e) => {
    e.preventDefault();
    if (!title.trim()) { setError("يرجى كتابة نص المهمة قبل الإضافة"); return; }
    setError("");
    setTasks((prev) => [{ id: uid(), title: title.trim(), priority, category: category.trim(), completed: false, createdAt: Date.now() }, ...prev]);
    setTitle("");
    setCategory("");
  };

  const toggle = (id) => setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  const remove = (id) => setTasks((prev) => prev.filter((t) => t.id !== id));
  const clearCompleted = () => setTasks((prev) => prev.filter((t) => !t.completed));

  const filtered = tasks.filter((t) => (filter === "active" ? !t.completed : filter === "completed" ? t.completed : true));
  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <div className="mcr-tab-content">
      <form className="mcr-task-add" onSubmit={addTask} noValidate>
        <input className="mcr-input" placeholder="أضف مهمة جديدة..." value={title} onChange={(e) => { setTitle(e.target.value); if (error) setError(""); }} />
        <div className="mcr-task-add-row">
          <select className="mcr-input mcr-input-sm" value={priority} onChange={(e) => setPriority(e.target.value)}>
            {Object.entries(PRIORITIES).map(([k, p]) => <option key={k} value={k}>{p.emoji} {p.label}</option>)}
          </select>
          <input className="mcr-input mcr-input-sm" placeholder="التصنيف (اختياري)" value={category} onChange={(e) => setCategory(e.target.value)} />
          <button type="submit" className="mcr-btn-primary mcr-btn-sm"><Plus size={16} /></button>
        </div>
        <FieldError msg={error} />
      </form>

      <div className="mcr-section-head">
        <SegmentedControl
          options={[{ value: "all", label: "الكل" }, { value: "active", label: "نشطة" }, { value: "completed", label: "مكتملة" }]}
          value={filter}
          onChange={setFilter}
        />
        {completedCount > 0 && <button className="mcr-btn-ghost-sm" onClick={clearCompleted} type="button"><Trash2 size={14} /> مسح المكتملة</button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="لا توجد مهام" subtitle="أضف مهمتك الأولى من الأعلى" />
      ) : (
        <div className="mcr-task-list">
          {filtered.map((t) => {
            const p = PRIORITIES[t.priority] || PRIORITIES.medium;
            return (
              <div key={t.id} className={"mcr-task-item" + (t.completed ? " completed" : "")}>
                <button className="mcr-task-check" onClick={() => toggle(t.id)} type="button" style={{ color: t.completed ? "#30D158" : "#8A93A6" }}>
                  {t.completed ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                </button>
                <div className="mcr-task-body">
                  <span className="mcr-task-title">{t.title}</span>
                  <div className="mcr-task-tags">
                    <span className="mcr-priority-tag" style={{ color: p.color, background: p.color + "22" }}>{p.emoji} {p.label}</span>
                    {t.category && <span className="mcr-category-tag">{t.category}</span>}
                  </div>
                </div>
                <button className="mcr-icon-btn-sm" onClick={() => remove(t.id)} type="button"><Trash2 size={15} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================== TAB 6: IDEAS & NOTES ============================== */

function NoteEditorModal({ open, onClose, onSave, onDelete, initial }) {
  const blank = { title: "", content: "", category: "" };
  const [form, setForm] = useState(blank);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm(initial ? { title: initial.title, content: initial.content, category: initial.category } : blank);
    setConfirmingDelete(false);
    setError("");
  }, [initial, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() && !form.content.trim()) { setError("اكتب عنوانًا أو محتوى على الأقل"); return; }
    setError("");
    const now = Date.now();
    onSave({
      ...form,
      id: initial ? initial.id : uid(),
      createdAt: initial ? initial.createdAt : now,
      updatedAt: now,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "تعديل الملاحظة" : "ملاحظة جديدة"}>
      <form onSubmit={submit} className="mcr-form" noValidate>
        <Field label="العنوان">
          <input className="mcr-input" value={form.title} onChange={set("title")} placeholder="عنوان الفكرة أو الملاحظة" />
        </Field>
        <Field label="المحتوى">
          <textarea className="mcr-input mcr-textarea" rows={5} value={form.content} onChange={set("content")} placeholder="اكتب ملخص المحاضرة، فكرة دراسة، أو نصيحة امتحان..." />
        </Field>
        <Field label="التصنيف (اختياري)">
          <input className="mcr-input" value={form.category} onChange={set("category")} placeholder="دراسة / أفكار / تلخيص" />
        </Field>
        <FieldError msg={error} />

        <div className="mcr-modal-actions">
          <button type="submit" className="mcr-btn-primary"><Check size={16} /> حفظ</button>
          {initial && !confirmingDelete && (
            <button type="button" className="mcr-btn-danger" onClick={() => setConfirmingDelete(true)}><Trash2 size={16} /> حذف</button>
          )}
        </div>
        {confirmingDelete && (
          <ConfirmDelete onConfirm={() => onDelete(initial.id)} onCancel={() => setConfirmingDelete(false)} label="حذف هذه الملاحظة نهائيًا؟" />
        )}
      </form>
    </Modal>
  );
}

function NotesTab({ notes, setNotes }) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const categories = useMemo(() => {
    const set = new Set(notes.map((n) => n.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [notes]);

  const filtered = notes.filter((n) => {
    const matchesQuery = !query.trim() || (n.title + " " + n.content).toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = activeCategory === "all" || n.category === activeCategory;
    return matchesQuery && matchesCategory;
  }).sort((a, b) => b.updatedAt - a.updatedAt);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (n) => { setEditing(n); setModalOpen(true); };
  const save = (n) => {
    setNotes((prev) => {
      const exists = prev.some((x) => x.id === n.id);
      return exists ? prev.map((x) => (x.id === n.id ? n : x)) : [n, ...prev];
    });
    setModalOpen(false);
  };
  const del = (id) => {
    setNotes((prev) => prev.filter((x) => x.id !== id));
    setModalOpen(false);
  };

  return (
    <div className="mcr-tab-content">
      <div className="mcr-search-bar">
        <Search size={16} />
        <input className="mcr-search-input" placeholder="ابحث في ملاحظاتك..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {categories.length > 1 && (
        <div className="mcr-day-pills mcr-category-pills">
          {categories.map((c) => (
            <button key={c} className={"mcr-day-pill" + (activeCategory === c ? " active" : "")} onClick={() => setActiveCategory(c)} type="button">
              {c === "all" ? "الكل" : c}
            </button>
          ))}
        </div>
      )}

      <div className="mcr-section-head">
        <p className="mcr-section-hint">{filtered.length} ملاحظة</p>
        <button className="mcr-fab-inline" onClick={openAdd} type="button"><Plus size={17} /> ملاحظة جديدة</button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={StickyNote} title="لا توجد ملاحظات" subtitle="دوّن أول فكرة أو ملخص محاضرة الآن" />
      ) : (
        <div className="mcr-notes-grid">
          {filtered.map((n) => (
            <div key={n.id} className="mcr-note-card" onClick={() => openEdit(n)}>
              <div className="mcr-note-card-head">
                <h4>{n.title || "بدون عنوان"}</h4>
                {n.category && <span className="mcr-category-tag">{n.category}</span>}
              </div>
              <p className="mcr-note-card-content">{n.content}</p>
            </div>
          ))}
        </div>
      )}

      <NoteEditorModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={save} onDelete={del} initial={editing} />
    </div>
  );
}

/* ============================== MAIN APP ============================== */

export default function App() {
  const [now, setNow] = useState(new Date());
  const [activeTab, setActiveTab] = useState("lectures");

  const [classes, setClasses] = useLocalStorage(STORAGE_KEYS.classes, seedClasses);
  const [events, setEvents] = useLocalStorage(STORAGE_KEYS.events, seedEvents);
  const [habits, setHabits] = useLocalStorage(STORAGE_KEYS.habits, seedHabits);
  const [tasks, setTasks] = useLocalStorage(STORAGE_KEYS.tasks, seedTasks);
  const [notes, setNotes] = useLocalStorage(STORAGE_KEYS.notes, seedNotes);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useHabitReminders(habits, now);

  const tabLabel = TABS.find((t) => t.key === activeTab)?.label || "";

  return (
    <div className="mcr-root" dir="rtl" lang="ar">
      <GlobalStyles />
      <div className="mcr-phone">
        <StatusHeader now={now} tabLabel={tabLabel} />
        <main className="mcr-main">
          {activeTab === "lectures" && <LecturesTab classes={classes} setClasses={setClasses} now={now} />}
          {activeTab === "appointments" && <AppointmentsTab events={events} setEvents={setEvents} now={now} />}
          {activeTab === "habits" && <HabitsTab habits={habits} setHabits={setHabits} />}
          {activeTab === "prayer" && <PrayerTab now={now} />}
          {activeTab === "tasks" && <TasksTab tasks={tasks} setTasks={setTasks} />}
          {activeTab === "notes" && <NotesTab notes={notes} setNotes={setNotes} />}
        </main>
        <BottomNav active={activeTab} onChange={setActiveTab} />
      </div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      .mcr-root {
        --bg: #0B0F17;
        --card: #161D2A;
        --card-active: #1F293D;
        --border: rgba(255,255,255,0.07);
        --text: #F3F5F9;
        --text-dim: #8A93A6;
        --text-faint: #565F72;
        --blue: #0A84FF;
        --green: #30D158;
        --amber: #FFD60A;
        --orange: #FF6B35;
        --red: #FF453A;
        background: radial-gradient(circle at 50% 0%, #121826 0%, var(--bg) 55%);
        min-height: 100vh;
        width: 100%;
        display: flex;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Tahoma, Geneva, Arial, sans-serif;
        color: var(--text);
        -webkit-font-smoothing: antialiased;
      }
      .mcr-phone {
        width: 100%;
        max-width: 440px;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        position: relative;
        background: var(--bg);
      }
      button { font-family: inherit; cursor: pointer; }
      input, select, textarea { font-family: inherit; }

      /* ---- Status Header ---- */
      .mcr-status-header {
        position: sticky; top: 0; z-index: 20;
        background: rgba(11,15,23,0.86);
        backdrop-filter: blur(18px);
        -webkit-backdrop-filter: blur(18px);
        border-bottom: 1px solid var(--border);
        padding: 10px 18px 14px;
      }
      .mcr-status-top {
        display: flex; justify-content: space-between; align-items: center;
        font-size: 12px; color: var(--text-dim); margin-bottom: 10px;
        font-variant-numeric: tabular-nums;
      }
      .mcr-status-brand { display: flex; align-items: center; gap: 5px; color: var(--text-faint); font-weight: 600; }
      .mcr-status-bottom { display: flex; flex-direction: column; gap: 2px; }
      .mcr-status-bottom h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.3px; }
      .mcr-status-date { color: var(--text-dim); font-size: 13px; }

      /* ---- Main scroll area ---- */
      .mcr-main { flex: 1; overflow-y: auto; padding: 16px 16px 100px; }
      .mcr-tab-content { display: flex; flex-direction: column; gap: 18px; animation: mcrFadeIn 0.25s ease; }
      @keyframes mcrFadeIn { from { opacity: 0; transform: translateY(6px);} to { opacity: 1; transform: translateY(0);} }

      /* ---- Bottom Nav ---- */
      .mcr-bottom-nav {
        position: sticky; bottom: 0; z-index: 20;
        display: flex; justify-content: space-around;
        background: rgba(15,20,31,0.92);
        backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px);
        border-top: 1px solid var(--border);
        padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
      }
      .mcr-nav-btn {
        background: none; border: none; color: var(--text-faint);
        display: flex; flex-direction: column; align-items: center; gap: 3px;
        font-size: 10.5px; padding: 4px 6px; border-radius: 12px;
        transition: color 0.2s ease, transform 0.15s ease;
        flex: 1;
      }
      .mcr-nav-btn.active { color: var(--blue); transform: translateY(-1px); }
      .mcr-nav-btn span { font-weight: 600; }

      /* ---- Section headers / controls ---- */
      .mcr-section-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .mcr-section-hint { color: var(--text-dim); font-size: 13px; margin: 0; }
      .mcr-fab-inline {
        display: flex; align-items: center; gap: 5px;
        background: var(--blue); color: #fff; border: none;
        padding: 8px 14px; border-radius: 30px; font-size: 13.5px; font-weight: 700;
        box-shadow: 0 4px 14px rgba(10,132,255,0.35);
      }
      .mcr-segmented {
        display: inline-flex; background: var(--card); border: 1px solid var(--border);
        border-radius: 12px; padding: 3px; gap: 2px;
      }
      .mcr-segment {
        display: flex; align-items: center; gap: 5px;
        background: none; border: none; color: var(--text-dim);
        padding: 7px 12px; border-radius: 9px; font-size: 12.5px; font-weight: 600;
        transition: all 0.2s ease;
      }
      .mcr-segment.active { background: var(--card-active); color: var(--text); }

      /* ---- Hero card ---- */
      .mcr-hero {
        border: 1px solid var(--border); border-radius: 22px; padding: 18px;
        display: flex; flex-direction: column; gap: 8px; position: relative;
        background: var(--card);
      }
      .mcr-hero-empty { align-items: center; text-align: center; color: var(--text-dim); gap: 10px; padding: 28px 18px; }
      .mcr-hero-top { display: flex; justify-content: space-between; align-items: center; }
      .mcr-hero-eyebrow { font-size: 11.5px; color: var(--text-dim); font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
      .mcr-hero-type-badge { font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 20px; }
      .mcr-hero-subject { margin: 0; font-size: 21px; font-weight: 800; }
      .mcr-hero-countdown { font-size: 34px; font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: 1px; }
      .mcr-hero-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
      .mcr-mini-badge { display: flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.05); padding: 5px 10px; border-radius: 20px; font-size: 12px; color: var(--text-dim); }
      .mcr-hero-day { position: absolute; top: 18px; left: 18px; font-size: 12px; color: var(--text-faint); font-weight: 700; }

      /* ---- Day pills ---- */
      .mcr-day-pills { display: flex; gap: 7px; overflow-x: auto; padding: 2px 0 10px; }
      .mcr-category-pills { padding-bottom: 6px; }
      .mcr-day-pill {
        flex-shrink: 0; background: var(--card); border: 1px solid var(--border); color: var(--text-dim);
        padding: 8px 14px; border-radius: 20px; font-size: 12.5px; font-weight: 700;
        position: relative;
      }
      .mcr-day-pill.today::after { content: ""; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 4px; height: 4px; border-radius: 50%; background: var(--blue); }
      .mcr-day-pill.active { background: var(--blue); color: #fff; border-color: var(--blue); }

      /* ---- Timeline (daily) ---- */
      .mcr-timeline { display: flex; flex-direction: column; gap: 4px; }
      .mcr-timeline-item { display: grid; grid-template-columns: 56px 12px 1fr; gap: 10px; align-items: stretch; cursor: pointer; }
      .mcr-timeline-time { display: flex; flex-direction: column; align-items: flex-end; padding-top: 4px; font-size: 12px; font-weight: 700; color: var(--text-dim); }
      .mcr-timeline-time-sub { font-size: 10.5px; color: var(--text-faint); font-weight: 500; margin-top: 2px; }
      .mcr-timeline-line { width: 3px; border-radius: 3px; margin: 4px 0; }
      .mcr-timeline-card { flex: 1; background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 12px 14px; margin-bottom: 12px; }
      .mcr-timeline-card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .mcr-edit-hint { color: var(--text-faint); }
      .mcr-timeline-card h4 { margin: 0 0 6px; font-size: 15.5px; font-weight: 700; }
      .mcr-timeline-meta { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--text-dim); }
      .mcr-timeline-meta span { display: flex; align-items: center; gap: 4px; }
      .mcr-type-chip { font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 20px; }

      /* ---- Weekly grid ---- */
      .mcr-week-grid { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; }
      .mcr-week-col { flex-shrink: 0; width: 108px; display: flex; flex-direction: column; gap: 6px; }
      .mcr-week-col-head { text-align: center; font-size: 12px; font-weight: 700; color: var(--text-dim); padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .mcr-week-col-head.today { color: var(--blue); }
      .mcr-week-empty { text-align: center; color: var(--text-faint); font-size: 12px; padding: 10px 0; }
      .mcr-week-card { border: 1px solid; border-radius: 12px; padding: 8px; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
      .mcr-week-card-time { font-size: 11px; font-weight: 700; }
      .mcr-week-card-subject { font-size: 12px; font-weight: 700; }
      .mcr-week-card-loc { font-size: 10.5px; color: var(--text-dim); }

      /* ---- Event cards ---- */
      .mcr-event-list { display: flex; flex-direction: column; gap: 12px; }
      .mcr-event-card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 14px; }
      .mcr-event-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .mcr-event-card h4 { margin: 0 0 8px; font-size: 15.5px; font-weight: 800; }
      .mcr-event-meta { display: flex; flex-direction: column; gap: 4px; font-size: 12.5px; color: var(--text-dim); margin-bottom: 6px; }
      .mcr-event-meta span { display: flex; align-items: center; gap: 5px; }
      .mcr-event-notes { font-size: 12.5px; color: var(--text-dim); background: rgba(255,255,255,0.04); padding: 8px 10px; border-radius: 10px; margin: 6px 0; }
      .mcr-event-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
      .mcr-event-countdown { font-weight: 800; font-size: 13.5px; font-variant-numeric: tabular-nums; }
      .mcr-event-past { color: var(--text-faint); font-size: 12.5px; font-weight: 600; }

      /* ---- Habits ---- */
      .mcr-habit-list { display: flex; flex-direction: column; gap: 12px; }
      .mcr-habit-card { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 14px; }
      .mcr-habit-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .mcr-habit-title { display: flex; align-items: center; gap: 10px; }
      .mcr-habit-emoji { font-size: 24px; }
      .mcr-habit-title h4 { margin: 0; font-size: 15px; font-weight: 800; }
      .mcr-habit-target { font-size: 11.5px; color: var(--text-dim); }
      .mcr-habit-right { display: flex; align-items: center; gap: 8px; }
      .mcr-streak-badge { display: flex; align-items: center; gap: 3px; background: rgba(255,107,53,0.16); color: var(--orange); font-size: 12px; font-weight: 800; padding: 4px 8px; border-radius: 20px; }
      .mcr-habit-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
      .mcr-habit-day { display: flex; flex-direction: column; align-items: center; gap: 5px; background: rgba(255,255,255,0.03); border: 1px solid var(--border); border-radius: 10px; padding: 7px 2px; color: var(--text-dim); }
      .mcr-habit-day-label { font-size: 10px; font-weight: 700; }
      .mcr-habit-day-icon { display: flex; }
      .mcr-habit-day-done { background: rgba(48,209,88,0.15); border-color: rgba(48,209,88,0.4); color: var(--green); }
      .mcr-habit-day-missed { background: rgba(255,69,58,0.1); border-color: rgba(255,69,58,0.25); color: var(--red); }
      .mcr-habit-day-upcoming { color: var(--text-faint); }
      .mcr-habit-day-todo.today { border-color: var(--blue); color: var(--blue); }
      .mcr-habit-day:disabled { cursor: default; }

      /* ---- Prayer / Qibla ---- */
      .mcr-prayer-panel { background: var(--card); border: 1px solid var(--border); border-radius: 22px; padding: 18px; }
      .mcr-prayer-next { text-align: center; margin-bottom: 14px; }
      .mcr-prayer-next-row { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 4px 0; }
      .mcr-prayer-next-row h2 { margin: 0; font-size: 20px; font-weight: 800; }
      .mcr-prayer-list { display: flex; flex-direction: column; gap: 2px; border-top: 1px solid var(--border); padding-top: 10px; }
      .mcr-prayer-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-radius: 12px; font-size: 13.5px; color: var(--text-dim); }
      .mcr-prayer-row-label { display: flex; align-items: center; gap: 8px; }
      .mcr-prayer-row.active { background: rgba(48,209,88,0.12); color: var(--green); font-weight: 800; }
      .mcr-prayer-row-time { font-variant-numeric: tabular-nums; font-weight: 700; }

      .mcr-qibla-card { background: var(--card); border: 1px solid var(--border); border-radius: 22px; padding: 18px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
      .mcr-qibla-head { display: flex; flex-direction: column; align-items: center; gap: 2px; }
      .mcr-qibla-deg { font-size: 18px; font-weight: 800; }
      .mcr-compass-dial {
        width: 180px; height: 180px; border-radius: 50%;
        border: 2px solid var(--border); position: relative; margin: 10px 0;
        background: radial-gradient(circle, rgba(255,255,255,0.03), transparent 70%);
        touch-action: none; user-select: none; cursor: grab;
      }
      .mcr-compass-ring { position: absolute; inset: 14px; border-radius: 50%; border: 1px dashed var(--border); }
      .mcr-compass-n, .mcr-compass-e, .mcr-compass-s, .mcr-compass-w { position: absolute; font-size: 12px; font-weight: 800; color: var(--text-dim); }
      .mcr-compass-n { top: 8px; left: 50%; transform: translateX(-50%); color: var(--red); }
      .mcr-compass-s { bottom: 8px; left: 50%; transform: translateX(-50%); }
      .mcr-compass-e { right: 8px; top: 50%; transform: translateY(-50%); }
      .mcr-compass-w { left: 8px; top: 50%; transform: translateY(-50%); }
      .mcr-compass-needle-wrap { position: absolute; top: 138px; width: 180px; height: 180px; display: flex; align-items: center; justify-content: center; pointer-events: none; }
      .mcr-compass-needle { color: var(--amber); transition: transform 0.15s ease; filter: drop-shadow(0 0 6px rgba(255,214,10,0.5)); }
      .mcr-qibla-hint { font-size: 12px; color: var(--text-dim); text-align: center; max-width: 260px; margin: 6px 0 0; }

      .mcr-athkar-section { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 14px; }
      .mcr-athkar-section-title { display: flex; align-items: center; gap: 7px; font-size: 14.5px; font-weight: 800; margin: 0 0 10px; }
      .mcr-athkar-list { display: flex; flex-direction: column; gap: 6px; }
      .mcr-athkar-item { display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border-radius: 12px; padding: 6px 6px 6px 10px; }
      .mcr-athkar-item.done { background: rgba(48,209,88,0.1); }
      .mcr-athkar-text-btn { display: flex; align-items: center; gap: 8px; background: none; border: none; color: var(--text); font-size: 13.5px; font-weight: 600; flex: 1; text-align: right; padding: 6px 2px; }
      .mcr-athkar-counter { min-width: 46px; text-align: center; background: var(--card-active); border: 1px solid var(--border); color: var(--text); font-weight: 800; font-size: 12.5px; padding: 7px 10px; border-radius: 20px; }
      .mcr-athkar-counter.done { background: var(--green); border-color: var(--green); color: #06210f; }
      .mcr-athkar-full-text { font-size: 19px; line-height: 2.1; text-align: center; margin: 6px 0 16px; }
      .mcr-athkar-full-count { text-align: center; color: var(--text-dim); font-size: 13px; margin: 0; }

      /* ---- Tasks ---- */
      .mcr-task-add { background: var(--card); border: 1px solid var(--border); border-radius: 18px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
      .mcr-task-add-row { display: flex; gap: 8px; }
      .mcr-input-sm { flex: 1; font-size: 12.5px; padding: 9px 10px; }
      .mcr-btn-sm { padding: 9px 14px; }
      .mcr-task-list { display: flex; flex-direction: column; gap: 8px; }
      .mcr-task-item { display: flex; align-items: center; gap: 10px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px; transition: opacity 0.2s ease; }
      .mcr-task-item.completed { opacity: 0.55; }
      .mcr-task-check { background: none; border: none; display: flex; }
      .mcr-task-body { flex: 1; display: flex; flex-direction: column; gap: 5px; }
      .mcr-task-title { font-size: 14px; font-weight: 700; }
      .mcr-task-item.completed .mcr-task-title { text-decoration: line-through; color: var(--text-dim); }
      .mcr-task-tags { display: flex; gap: 6px; flex-wrap: wrap; }
      .mcr-priority-tag { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 20px; }
      .mcr-category-tag { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 20px; background: rgba(255,255,255,0.07); color: var(--text-dim); }

      /* ---- Notes ---- */
      .mcr-search-bar { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 10px 12px; color: var(--text-faint); }
      .mcr-search-input { flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 13.5px; }
      .mcr-notes-grid { display: flex; flex-direction: column; gap: 10px; }
      .mcr-note-card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 13px; cursor: pointer; }
      .mcr-note-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 5px; }
      .mcr-note-card-head h4 { margin: 0; font-size: 14.5px; font-weight: 800; }
      .mcr-note-card-content { margin: 0; font-size: 12.5px; color: var(--text-dim); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

      /* ---- Shared: Empty state ---- */
      .mcr-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 6px; padding: 40px 20px; color: var(--text-dim); }
      .mcr-empty-icon { width: 52px; height: 52px; border-radius: 50%; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; margin-bottom: 4px; color: var(--text-faint); }
      .mcr-empty-title { font-weight: 700; color: var(--text); margin: 0; font-size: 14px; }
      .mcr-empty-sub { margin: 0; font-size: 12.5px; max-width: 240px; }

      /* ---- Modal ---- */
      .mcr-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(3px); display: flex; align-items: flex-end; justify-content: center; z-index: 100; animation: mcrFadeIn 0.2s ease; }
      .mcr-modal { width: 100%; max-width: 440px; max-height: 88vh; overflow-y: auto; background: #131826; border: 1px solid var(--border); border-radius: 26px 26px 0 0; padding: 18px 18px calc(20px + env(safe-area-inset-bottom)); animation: mcrSlideUp 0.28s cubic-bezier(.32,.72,0,1); }
      @keyframes mcrSlideUp { from { transform: translateY(30px); opacity: 0.4; } to { transform: translateY(0); opacity: 1; } }
      .mcr-modal-wide { max-width: 480px; }
      .mcr-modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
      .mcr-modal-head h3 { margin: 0; font-size: 17px; font-weight: 800; }
      .mcr-modal-body { display: flex; flex-direction: column; }

      /* ---- Forms ---- */
      .mcr-form { display: flex; flex-direction: column; gap: 13px; }
      .mcr-form-row { display: flex; gap: 10px; }
      .mcr-form-row > label { flex: 1; }
      .mcr-field { display: flex; flex-direction: column; gap: 6px; }
      .mcr-field-label { font-size: 12.5px; font-weight: 700; color: var(--text-dim); }
      .mcr-input {
        background: var(--card); border: 1px solid var(--border); color: var(--text);
        padding: 11px 13px; border-radius: 12px; font-size: 14px; outline: none; width: 100%;
      }
      .mcr-input:focus { border-color: var(--blue); }
      .mcr-textarea { resize: vertical; min-height: 60px; }
      .mcr-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .mcr-type-tile { display: flex; align-items: center; gap: 8px; background: var(--card); border: 1px solid var(--border); color: var(--text-dim); padding: 10px; border-radius: 12px; font-size: 12.5px; font-weight: 700; }
      .mcr-type-tile span { font-size: 16px; }
      .mcr-type-tile.active { background: var(--card-active); color: var(--text); border-color: var(--blue); }
      .mcr-accent-picker { display: flex; gap: 10px; }
      .mcr-accent-dot { width: 34px; height: 34px; border-radius: 50%; border: 2px solid transparent; display: flex; align-items: center; justify-content: center; }
      .mcr-accent-dot.selected { border-color: #fff; }
      .mcr-emoji-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
      .mcr-emoji-btn { font-size: 19px; background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 6px 0; }
      .mcr-emoji-btn.selected { background: var(--card-active); border-color: var(--blue); }

      .mcr-form-error { display: flex; align-items: center; gap: 6px; color: var(--red); background: rgba(255,69,58,0.1); border: 1px solid rgba(255,69,58,0.25); padding: 8px 11px; border-radius: 10px; font-size: 12.5px; font-weight: 600; margin: 0; }
      .mcr-field-hint { font-size: 11px; color: var(--text-faint); margin-top: 2px; }
      .mcr-reminder-badge { display: flex; align-items: center; gap: 3px; background: rgba(10,132,255,0.16); color: var(--blue); font-size: 11.5px; font-weight: 800; padding: 4px 8px; border-radius: 20px; }
      .mcr-notif-banner { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; background: var(--card); border: 1px solid var(--border); color: var(--text-dim); padding: 10px; border-radius: 14px; font-size: 12.5px; font-weight: 700; }
      .mcr-notif-banner.granted { color: var(--green); border-color: rgba(48,209,88,0.3); background: rgba(48,209,88,0.08); }
      .mcr-notif-banner.denied { color: var(--red); border-color: rgba(255,69,58,0.3); background: rgba(255,69,58,0.08); }
      .mcr-modal-actions { display: flex; gap: 10px; margin-top: 4px; }
      .mcr-btn-primary { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: var(--blue); color: #fff; border: none; padding: 12px; border-radius: 14px; font-weight: 800; font-size: 14px; }
      .mcr-btn-danger { display: flex; align-items: center; gap: 6px; background: rgba(255,69,58,0.12); color: var(--red); border: 1px solid rgba(255,69,58,0.3); padding: 12px 16px; border-radius: 14px; font-weight: 700; font-size: 13.5px; }
      .mcr-btn-danger-solid { background: var(--red); color: #fff; border: none; padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 12.5px; }
      .mcr-btn-ghost { background: none; border: 1px solid var(--border); color: var(--text-dim); padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 12.5px; }
      .mcr-btn-ghost-sm { display: flex; align-items: center; gap: 5px; background: none; border: 1px solid var(--border); color: var(--text-dim); padding: 6px 11px; border-radius: 20px; font-weight: 700; font-size: 11.5px; }
      .mcr-confirm-row { display: flex; justify-content: space-between; align-items: center; background: rgba(255,69,58,0.08); border: 1px solid rgba(255,69,58,0.25); padding: 10px 12px; border-radius: 12px; font-size: 12.5px; color: var(--text); margin-top: -2px; }
      .mcr-confirm-actions { display: flex; gap: 8px; }
      .mcr-icon-btn { background: none; border: none; color: var(--text-dim); display: flex; padding: 4px; }
      .mcr-icon-btn-sm { background: rgba(255,255,255,0.05); border: none; color: var(--text-dim); display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0; }

      /* Scrollbar */
      .mcr-main::-webkit-scrollbar, .mcr-modal::-webkit-scrollbar, .mcr-week-grid::-webkit-scrollbar { width: 5px; height: 5px; }
      .mcr-main::-webkit-scrollbar-thumb, .mcr-modal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }

      @media (max-width: 360px) {
        .mcr-hero-countdown { font-size: 28px; }
        .mcr-week-col { width: 92px; }
      }
    `}</style>
  );
}
