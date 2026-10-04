// 中英文字典。首頁、年度回顧、城市模組共用。
// 預設照瀏覽器語言（中文系用中文，其餘用英文），右上角可以切換，選擇會記住。

const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WD_EN_LONG = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
const WD_ZH = '日一二三四五六';
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const h12 = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const zhPart = (h) => (h < 5 ? '凌晨' : h < 12 ? '早上' : h < 18 ? '下午' : '晚上');
const n = (v) => Number(v).toLocaleString('en-US');
const commits = (v) => `${n(v)} commit${v === 1 ? '' : 's'}`;

const zh = {
  title: 'Chung 的開發手帳',
  h1: 'Chung 的<span class="hl">開發手帳</span>',
  lede: '做 iOS／macOS 原生 App、PWA，還有各種解決自己麻煩的小工具。這一頁是<b>自動更新的開發紀錄</b>：每個專案的 commit 熱力圖、最後更新時間，以及最近改了什麼。',
  ticker: '最近的開發動態',
  syncing: 'Build log · 同步中', loadFail: 'Build log · 資料載入失敗', lastBuilt: (r) => `Build log · 最後動工 ${r}`,
  statYear: '近一年 commits', statDays: '有動工的日子', statStreak: '目前連續', statActive: '進行中專案', uDay: '天', uItem: '個',
  secYear: '一年的痕跡', secRhythm: '都幾點動工', secFeed: '最近動態', secActive: '進行中的專案', secOld: '較早的專案',
  noteActive: '30 天內有更新', noteOld: '每一格是一週',
  park: '綠地＝沒動工', byProj: '依專案上色', less: '少', more: '多', v3d: '立體', v2d: '平面', viewGroup: '檢視方式',
  allProjects: (p) => `所有專案加總${p ? ` · 含 ${p} 個非公開專案` : ''}`, taipeiNow: (w) => ` · 台北現在${w}`,
  rhythm: (h, d) => `最常在${zhPart(h)} ${h > 12 ? h - 12 : h} 點動工 · 最忙的是星期${WD_ZH[d]}`,
  hourAxis: ['0 點', '6', '12', '18', '23'], wdAxis: [...WD_ZH],
  hourRange: (h) => `${h}:00–${h}:59`, wdLong: (d) => `星期${WD_ZH[d]}`,
  hoursAria: (h) => `一天 24 小時的 commit 分布，高峰在 ${h} 點`, wdAria: (d) => `一週七天的 commit 分布，高峰在星期${WD_ZH[d]}`,
  heatAria: (y, a) => `過去一年的 commit 熱力圖：共 ${y} 個 commit，${a} 天有動工`, miniAria: (name) => `${name} 近半年的 commit 熱力圖`,
  month: (m) => `${m}月`, wd: (d) => `週${WD_ZH[d]}`, today: '今天', yesterday: '昨天',
  commits: (v) => `${v} 個 commit`, noCommits: '沒有動工', otherPrivate: '其他非公開專案', other: '其他', quiet: '最近沒有動靜',
  priv: '非公開', privHint: '私有專案：只公開簡介與 commit 數量', site: '網站 ↗',
  d7: '近 7 天', y1: '近一年', all: '累計', lastUpdate: '最後更新', hush: 'commit 內容不公開',
  fAll: '全部', fApp: 'App', fWeb: 'Web', fOther: '其他', fPublic: '公開', fPrivate: '非公開', fGroup: '篩選專案', none: '沒有符合的專案',
  synced: (t) => `資料每 15 分鐘自動同步 · 上次更新 ${t}`, stale: (h, t) => `⚠ 資料已經 ${h} 小時沒有同步，可能中斷了 · 上次更新 ${t}`,
  yearLink: '年度回顧', feedLink: '週報 RSS',
  toNight: '現在是白天，切換成夜景', toDay: '現在是夜景，切換成白天', langBtn: 'EN', langAria: 'Switch to English',
  peak: '🏆 這一年最高的一棟', close: '關閉', dayAria: '這一天的 commit',
  dayPark: (idle) => `沒有動工，這裡是綠地 🌳${idle > 1 ? ` · 連續休息第 ${idle} 天` : ''}`,
  relNow: '剛剛', relMin: (m) => `${m} 分鐘前`, relHour: (h) => `${h} 小時前`, relDays: (d) => `${d} 天前`, relMonths: (m) => `${m} 個月前`,
  // 城市
  banner: (r, name) => `最後動工 ${r} · ${name}`, otherProjects: '其他專案', plus: (v) => `+${v} commit`,
  ot: '加班中', typhoonSign: '颱風停工',
  wTyphoon: '颱風天 🌀', wThunder: '雷雨 ⛈️', wHeavy: '大雨 🌧️', wRain: '下雨 ☔', wCloudy: '陰天 ☁️',
  lines: {
    hammer: (c) => [c ? `嗨！今天已經動工 ${c} 次了 👋` : '嗨！今天還沒開工喔 👋', '需求又改了…再敲一次 🔨', '安全帽戴好，commit 寫好 ⛑️', '這棟蓋完，明天還有一棟', '老闆說今天不加班（才怪）'],
    shovel: () => ['嗨！明天的地基我先挖 👋', '這塊地明天要蓋多高？', '等等，好像挖到 bug 了 🐛', '地基打穩，重構才不會垮'],
    lunch: () => ['午休中，便當真香 🍱', '吃飽再 commit'],
    overtime: () => ['加班中…先別吵 🌙', '這個 bug 修完就下班'],
    rain: () => ['下雨天，撐傘監工 ☔', '雨這麼大，水泥不會乾'],
  },
  // 年度回顧
  yTitle: '年度回顧｜Chung 的開發手帳', yKicker: '年度回顧', yLoading: '載入中…', yFail: '資料載入失敗',
  yHero: 'Chung 的<br>這一年', yHeroSub: '過去 365 天的開發紀錄，從 commit 算出來的。往下捲。',
  yTotal: '總共', yTotalUnit: '個 commit',
  yTotalSub: (p, avg) => `分散在 <b>${p} 個專案</b>裡，平均每個動工的日子 <b>${avg} 個</b>。`,
  yDays: '有動工的日子', yDaysUnit: '天',
  yDaysSub: (pct, longest, end, streak) => `一年裡有 <b>${pct}%</b> 的日子在寫程式。最長連續 <b>${longest} 天</b>（到 ${end} 為止）${streak ? `，目前連續 <b>${streak} 天</b>` : ''}。`,
  yPeak: '最高的一棟', yPeakDay: (d, w) => `${d} 星期${WD_ZH[w]}`, yPeakSub: (who) => `那天主要在做 ${who}。`, yJoin: '、',
  yTop: '最常做的專案', yTop5: '前五名',
  yMonths: '一個月一個月看', yBusiest: (m) => `最忙的是 ${m} 月`, yMonthsAria: '每個月的 commit 數', yMonthTip: (m, v) => `${m}：${v} 個 commit`,
  yRhythm: '作息', yRhythmHead: (h, d) => `${zhPart(h)} ${h > 12 ? h - 12 : h} 點，星期${WD_ZH[d]}`, yRhythmSub: '這是最常動工的時段和星期。',
  yHour: '最常動工的鐘頭', yWeekday: '最忙的星期', yLang: '最常用的語言', yHourVal: (h) => `${h}:00`,
  yNew: '這一年新開的專案', yNewUnit: '個',
  yCity: '蓋出來的城市', yCityHead: '每一棟樓是一天', yCityAlt: '過去一年的 commit 天際線', yBack: '回到開發手帳 →',
};

const en = {
  title: 'Chung’s Build Log',
  h1: 'Chung’s <span class="hl">Build Log</span>',
  lede: 'I build native iOS and macOS apps, PWAs, and small tools that scratch my own itches. This page is a <b>self-updating build log</b>: a commit heatmap for every project, when it last changed, and what changed.',
  ticker: 'Recent activity',
  syncing: 'Build log · syncing', loadFail: 'Build log · failed to load data', lastBuilt: (r) => `Build log · last commit ${r}`,
  statYear: 'Commits this year', statDays: 'Active days', statStreak: 'Current streak', statActive: 'Active projects', uDay: 'days', uItem: '',
  secYear: 'A year of commits', secRhythm: 'When I build', secFeed: 'Recent activity', secActive: 'Active projects', secOld: 'Earlier projects',
  noteActive: 'updated in the last 30 days', noteOld: 'one cell per week',
  park: 'Park = no commits', byProj: 'Color by project', less: 'Less', more: 'More', v3d: '3D', v2d: 'Flat', viewGroup: 'View',
  allProjects: (p) => `All projects combined${p ? ` · incl. ${p} private` : ''}`, taipeiNow: (w) => ` · Taipei now: ${w}`,
  rhythm: (h, d) => `Most active around ${h12(h)} · busiest on ${WD_EN_LONG[d]}`,
  hourAxis: ['12 AM', '6', '12 PM', '6', '11'], wdAxis: WD_EN.map((d) => d[0]),
  hourRange: (h) => `${h}:00–${h}:59`, wdLong: (d) => WD_EN_LONG[d].slice(0, -1),
  hoursAria: (h) => `Commits by hour of day, peaking at ${h12(h)}`, wdAria: (d) => `Commits by weekday, peaking on ${WD_EN_LONG[d]}`,
  heatAria: (y, a) => `Commit heatmap for the past year: ${y} commits on ${a} active days`, miniAria: (name) => `${name}: commit heatmap for the past six months`,
  month: (m) => MON_EN[m - 1], wd: (d) => WD_EN[d], today: 'Today', yesterday: 'Yesterday',
  commits, noCommits: 'no commits', otherPrivate: 'Other private projects', other: 'Other', quiet: 'Nothing lately',
  priv: 'Private', privHint: 'Private project: only the summary and commit counts are public', site: 'Site ↗',
  d7: 'this week', y1: 'this year', all: 'total', lastUpdate: 'Last update', hush: 'Commit details are private',
  fAll: 'All', fApp: 'Apps', fWeb: 'Web', fOther: 'Other', fPublic: 'Public', fPrivate: 'Private', fGroup: 'Filter projects', none: 'No matching projects',
  synced: (t) => `Data syncs every 15 minutes · last updated ${t}`, stale: (h, t) => `⚠ Data has not synced for ${h} hours · last updated ${t}`,
  yearLink: 'Year in review', feedLink: 'Weekly RSS',
  toNight: 'Daytime. Switch to night', toDay: 'Night. Switch to daytime', langBtn: '中', langAria: '切換成中文',
  peak: '🏆 Tallest tower of the year', close: 'Close', dayAria: 'Commits on this day',
  dayPark: (idle) => `No commits. This lot is a park 🌳${idle > 1 ? ` · day ${idle} of rest` : ''}`,
  relNow: 'just now', relMin: (m) => `${m} min ago`, relHour: (h) => `${h} h ago`, relDays: (d) => `${d} days ago`, relMonths: (m) => `${m} mo ago`,
  banner: (r, name) => `Last commit ${r} · ${name}`, otherProjects: 'Other projects', plus: (v) => `+${commits(v)}`,
  ot: 'Overtime', typhoonSign: 'Typhoon',
  wTyphoon: 'typhoon 🌀', wThunder: 'thunderstorm ⛈️', wHeavy: 'heavy rain 🌧️', wRain: 'rain ☔', wCloudy: 'overcast ☁️',
  lines: {
    hammer: (c) => [c ? `Hi! ${commits(c)} so far today 👋` : 'Hi! Nothing built yet today 👋', 'Requirements changed again… 🔨', 'Hard hat on, commits clean ⛑️', 'One more tower tomorrow', 'Boss says no overtime today (sure)'],
    shovel: () => ['Hi! Digging tomorrow’s foundation 👋', 'How tall will this one be?', 'Hold on, I think I hit a bug 🐛', 'Solid foundations survive refactors'],
    lunch: () => ['Lunch break. Great bento 🍱', 'Eat first, commit later'],
    overtime: () => ['Working late… shh 🌙', 'One more bug and I’m done'],
    rain: () => ['Supervising under an umbrella ☔', 'Concrete won’t dry in this rain'],
  },
  yTitle: 'Year in Review | Chung’s Build Log', yKicker: 'Year in review', yLoading: 'Loading…', yFail: 'Failed to load data',
  yHero: 'Chung’s<br>Year', yHeroSub: 'The past 365 days of building, computed from commits. Scroll down.',
  yTotal: 'In total', yTotalUnit: 'commits',
  yTotalSub: (p, avg) => `Across <b>${p} projects</b>, averaging <b>${avg}</b> per active day.`,
  yDays: 'Active days', yDaysUnit: 'days',
  yDaysSub: (pct, longest, end, streak) => `Coding on <b>${pct}%</b> of days. Longest streak: <b>${longest} days</b> (ending ${end})${streak ? `; current streak: <b>${streak} days</b>` : ''}.`,
  yPeak: 'Tallest tower', yPeakDay: (d, w) => `${d}, ${WD_EN_LONG[w].slice(0, -1)}`, yPeakSub: (who) => `Mostly ${who}.`, yJoin: ', ',
  yTop: 'Most-worked projects', yTop5: 'Top five',
  yMonths: 'Month by month', yBusiest: (m) => `Busiest month: ${MON_EN[m - 1]}`, yMonthsAria: 'Commits per month', yMonthTip: (m, v) => `${m}: ${commits(v)}`,
  yRhythm: 'Rhythm', yRhythmHead: (h, d) => `${h12(h)}, ${WD_EN_LONG[d]}`, yRhythmSub: 'The hour and weekday with the most commits.',
  yHour: 'Peak hour', yWeekday: 'Busiest weekday', yLang: 'Top language', yHourVal: h12,
  yNew: 'Projects started this year', yNewUnit: '',
  yCity: 'The city it built', yCityHead: 'Every tower is a day', yCityAlt: 'Commit skyline for the past year', yBack: 'Back to the build log →',
};

const dict = { zh, en };
const TAGS_EN = { 工作: 'Work', 遊戲: 'Game', 'Chrome 擴充': 'Chrome extension', 'Safari 擴充': 'Safari extension' };

let lang = 'zh';
try { lang = localStorage.getItem('home-lang') || ''; } catch { lang = ''; }
if (lang !== 'zh' && lang !== 'en') lang = /^zh\b/i.test(navigator.language || 'zh') ? 'zh' : 'en';

export const getLang = () => lang;
export function setLang(next) {
  lang = next;
  try { localStorage.setItem('home-lang', next); } catch {}
  document.documentElement.lang = next === 'zh' ? 'zh-Hant-TW' : 'en';
}
// t('key') 取字串；字典裡是函式的話，後面的參數會傳進去
export function t(key, ...args) {
  const v = dict[lang][key] ?? zh[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
// 專案的名稱、簡介、標籤：英文版優先用 projects.json 裡的 title_en／summary_en
export const pTitle = (p) => (lang === 'en' && p.en?.title) || p.title;
export const pSummary = (p) => (lang === 'en' && p.en?.summary) || p.summary;
export const tag = (name) => (lang === 'en' && TAGS_EN[name]) || name;
// 把頁面上標了 data-i18n（文字）、data-i18n-html、data-i18n-aria 的元素換成目前的語言
export function applyStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
}
document.documentElement.lang = lang === 'zh' ? 'zh-Hant-TW' : 'en';
