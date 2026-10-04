// 訪客統計：GoatCounter（不用 cookie、不追蹤個人）。首頁與年度回顧共用。
// projects.json 有設代號、而且是在正式網址上，才會載入統計程式。
export function track(data, skip = false) {
  const code = data?.goatcounter;
  if (!code || skip || location.hostname !== `${data.owner}.github.io`) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${code}.goatcounter.com/count`;
  document.head.append(s);
}
