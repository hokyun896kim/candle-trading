// 지수·코인 모니터링: 코스피·나스닥·비트코인·이더리움 → public/markets.json (+ markets_log.json 누적)
// 실행: node scripts/markets.js   (GitHub Actions: 매일 아침 + 평일 장 마감 뒤)
const E = require('../public/engine.js');
const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');
const UA = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };
const OUT = path.join(__dirname, '..', 'public', 'markets.json');
const LOG = path.join(__dirname, '..', 'public', 'markets_log.json');

async function getJSON(url) {
  try { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { return JSON.parse(execFileSync('curl', ['-s', '-A', 'Mozilla/5.0', url], { maxBuffer: 1e9 }).toString()); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ymd = d => d.toISOString().slice(0, 10).replace(/-/g, '');

// ---------- 데이터 ----------
async function naverIndex(code, tf) {
  const rows = await getJSON(`https://api.stock.naver.com/chart/domestic/index/${code}/${tf}?startDateTime=198001010000&endDateTime=${ymd(new Date(Date.now() + 2 * 864e5))}0000`);
  return E.fromNaver(rows);
}
async function yahooDaily(sym) {
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=${Math.floor(Date.now() / 1000)}&interval=1d`);
  const r = j.chart.result[0], q = r.indicators.quote[0]; const out = [];
  r.timestamp.forEach((ts, i) => { const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i]; if ([o, h, l, c].some(v => v == null) || o <= 0) return; out.push({ t: ymd(new Date(ts * 1000 - 4 * 3600e3)), o, h, l, c }); });
  return dedupe(out);
}
async function upbit(mkt, kind) {
  let out = [], to = null;
  for (let k = 0; k < 40; k++) {
    const j = await getJSON(`https://api.upbit.com/v1/candles/${kind}?market=${mkt}&count=200` + (to ? `&to=${encodeURIComponent(to)}` : ''));
    if (!Array.isArray(j) || !j.length) break;
    out = out.concat(j); to = j[j.length - 1].candle_date_time_utc.replace('T', ' ');
    if (j.length < 200) break; await sleep(150);
  }
  return dedupe(out.map(x => ({ t: x.candle_date_time_utc.slice(0, 10).replace(/-/g, ''), o: x.opening_price, h: x.high_price, l: x.low_price, c: x.trade_price })));
}
function dedupe(a) { const m = new Map(); a.forEach(b => m.set(b.t, b)); return [...m.values()].sort((x, y) => x.t < y.t ? -1 : 1); }
function aggregate(days, keyf) {
  const m = new Map();
  for (const d of days) { const k = keyf(d.t); const o = m.get(k); if (!o) m.set(k, { ...d, t: k }); else { o.h = Math.max(o.h, d.h); o.l = Math.min(o.l, d.l); o.c = d.c; } }
  return [...m.values()];
}
const monthKey = t => t.slice(0, 6) + '01';
const weekKey = t => { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8))); const w = (d.getUTCDay() + 6) % 7; return ymd(new Date(d.getTime() - w * 864e5)); };

// ---------- 시간 ----------
function isEDT(d) { // 미국 서머타임: 3월 둘째 일요일 ~ 11월 첫째 일요일
  const y = d.getUTCFullYear();
  const nth = (m, n) => { const f = new Date(Date.UTC(y, m, 1)); const off = (7 - f.getUTCDay()) % 7; return Date.UTC(y, m, 1 + off + 7 * (n - 1)); };
  return d.getTime() >= nth(2, 2) + 7 * 3600e3 && d.getTime() < nth(10, 1) + 6 * 3600e3;
}
function lastWeekday(y, m) { let d = new Date(Date.UTC(y, m, 0)); while ([0, 6].includes(d.getUTCDay())) d = new Date(d.getTime() - 864e5); return d; }
const kd = d => `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
// 시장별 '지금' 날짜와 봉 마감 정보
function market(kind) {
  const now = new Date();
  if (kind === 'kr') { // KST, 15:30 마감
    const k = new Date(now.getTime() + 9 * 3600e3); const today = ymd(k); const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
    return { today, afterClose: mins >= 15 * 60 + 40, closeTxt: d => `${kd(d)}(${DOW[d.getUTCDay()]}) 15:30 종가`, weekdays: true };
  }
  if (kind === 'us') { // 뉴욕 16:00 마감
    const off = isEDT(now) ? 4 : 5; const e = new Date(now.getTime() - off * 3600e3); const today = ymd(e); const mins = e.getUTCHours() * 60 + e.getUTCMinutes();
    return { today, afterClose: mins >= 16 * 60 + 10, closeTxt: d => { const kst = isEDT(d) ? 5 : 6; const n = new Date(d.getTime() + 864e5); return `미국 ${kd(d)}(${DOW[d.getUTCDay()]}) 장 마감 (한국시간 ${kd(n)} 새벽 ${kst}시)`; }, weekdays: true };
  }
  // coin: 업비트 봉은 UTC 자정(한국 오전 9시)에 끊김
  const today = ymd(now);
  return { today, afterClose: false, closeTxt: d => { const n = new Date(d.getTime() + 864e5); return `${kd(n)} 오전 9시(한국시간)`; }, weekdays: false };
}
// 이번 봉의 마지막 날 (UTC Date)
function periodEnd(tf, lastT, mk) {
  const y = +lastT.slice(0, 4), m = +lastT.slice(4, 6), d = +lastT.slice(6, 8);
  if (tf === 'month') return mk.weekdays ? lastWeekday(y, m) : new Date(Date.UTC(y, m, 0));
  const start = new Date(Date.UTC(y, m - 1, d)); // 주 시작(월요일, 네이버는 일요일)
  const mon = new Date(start.getTime() + ((8 - start.getUTCDay()) % 7 === 7 ? 0 : 0));
  const dow = start.getUTCDay(); const toMon = dow === 0 ? 1 : (dow === 1 ? 0 : (8 - dow) % 7);
  const monday = new Date(start.getTime() + toMon * 864e5);
  return mk.weekdays ? new Date(monday.getTime() + 4 * 864e5) : new Date(monday.getTime() + 6 * 864e5);
}
function remainingDays(fromT, end, weekdays) {
  let n = 0; let d = new Date(Date.UTC(+fromT.slice(0, 4), +fromT.slice(4, 6) - 1, +fromT.slice(6, 8)) + 864e5);
  while (d <= end) { if (!weekdays || ![0, 6].includes(d.getUTCDay())) n++; d = new Date(d.getTime() + 864e5); }
  return n;
}

// ---------- 확률: 과거 N일 수익률 분포에서 [lo, hi) 구간 비율 ----------
function prob(days, n, lo, hi) {
  if (n <= 0) return null;
  const c = days.map(d => d.c); let hit = 0, tot = 0;
  for (let i = 0; i + n < c.length; i++) { const r = c[i + n] / c[i] - 1; tot++; if (r >= lo && r < hi) hit++; }
  return tot ? Math.round(hit / tot * 100) : null;
}

// ---------- 백테스트 ----------
function backtest(bars, dailyForHold) {
  const S = E.analyze(bars); const p = E.performance(bars, S, 999);
  let eq = 1, peak = 1, mdd = 0, pos = null;
  for (let i = 0; i < bars.length; i++) {
    const tr = p.trades.find(t => t.ei === i); if (tr && !pos) pos = { tr, base: eq };
    let v = eq; if (pos) { v = pos.base * bars[i].c / pos.tr.ep; if (i === pos.tr.xi && !pos.tr.openTrade) { eq = pos.base * pos.tr.xp / pos.tr.ep; v = eq; pos = null; } }
    peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1);
  }
  if (pos) eq = pos.base * bars[bars.length - 1].c / pos.tr.ep;
  const T = p.trades.filter(t => !t.openTrade);
  const hd = dailyForHold.filter(d => d.t >= bars[0].t); let pk = 0, bm = 0; for (const d of hd) { pk = Math.max(pk, d.c); bm = Math.min(bm, d.c / pk - 1); }
  const yrs = Math.max(0.5, (Date.parse(bars.at(-1).t.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3')) - Date.parse(bars[0].t.replace(/(\d{4})(\d\d)(\d\d)/, '$1-$2-$3'))) / 31557600000);
  const bh = hd.at(-1).c / hd[0].c;
  const open = p.trades.find(t => t.openTrade);
  return {
    from: bars[0].t, years: +yrs.toFixed(1), n: T.length, win: T.length ? Math.round(T.filter(t => t.pct > 0).length / T.length * 100) : 0,
    cagr: +((Math.pow(eq, 1 / yrs) - 1) * 100).toFixed(1), mdd: Math.round(mdd * 100),
    holdCagr: +((Math.pow(bh, 1 / yrs) - 1) * 100).toFixed(1), holdMdd: Math.round(bm * 100),
    open: open ? { t: open.et, p: open.ep, pct: +open.pct.toFixed(1), waitSell: open.note === '매도 대기' } : null,
    lastClosed: T.length ? { et: T[0].et, xt: T[0].xt, pct: +T[0].pct.toFixed(1) } : null,   // performance()는 최신순
    trades: p.trades.slice(0, 8).map(t => ({ et: t.et, xt: t.xt, pct: +t.pct.toFixed(1), open: !!t.openTrade }))
  };
}

// ---------- 코멘트 ----------
const won = (v, unit) => {
  if (unit !== 'krw') return Math.round(v).toLocaleString('ko-KR');
  if (v >= 1e8) { const eok = Math.floor(v / 1e8), man = Math.round((v - eok * 1e8) / 1e4); return `${eok}억${man ? ' ' + man.toLocaleString('ko-KR') + '만' : ''} 원`; }
  if (v >= 1e4) { const man = Math.floor(v / 1e4), rest = Math.round(v - man * 1e4); return `${man.toLocaleString('ko-KR')}만${rest ? ' ' + rest.toLocaleString('ko-KR') : ''} 원`; }
  return Math.round(v).toLocaleString('ko-KR') + ' 원';
};
const pc = x => (x >= 0 ? '+' : '') + x.toFixed(1) + '%';
const ym = t => `${t.slice(2, 4)}년 ${+t.slice(4, 6)}월`;
const ymd2 = t => `${t.slice(2, 4)}.${t.slice(4, 6)}.${t.slice(6, 8)}`;

function judge(asset, tf, bars, days, mk) {
  const lastT = bars.at(-1).t;
  const end = periodEnd(tf, lastT, mk);
  const endT = ymd(end);
  const partial = mk.today < endT || (mk.today === endT && !mk.afterClose) || (!mk.weekdays && mk.today <= endT);
  const fixedBars = partial ? bars.slice(0, -1) : bars;
  const F = E.analyze(fixedBars), L = E.analyze(bars);
  const cur = bars.at(-1), c = days.at(-1).c;
  const N = partial ? remainingDays(days.at(-1).t, end, mk.weekdays) : 0;
  const when = mk.closeTxt(end);
  const fmt = v => won(v, asset.unit);
  const unitWord = tf === 'month' ? '달' : '주';
  const mo = +lastT.slice(4, 6);
  const thisW = tf === 'month' ? `${mo}월` : '이번 주';           // + 도/에
  const thisS = tf === 'month' ? `${mo}월이` : '이번 주가';        // 주어
  let status, tone, text, p = null, pLabel = '';
  if (F.state === 'down' && L.state === 'up') {
    const need = F.breakLine / c - 1; p = prob(days, N, Math.max(need, cur.o / c - 1), Infinity); pLabel = `${when}에 앞 음봉 고가 위로 끝날 확률`; var pk = 'buy';
    status = '🔥 양봉이 음봉 이기는 중'; tone = 'o';
    text = `${thisW} 양봉이 앞 음봉 고가(${fmt(F.breakLine)})를 넘고 있다(지금 ${fmt(c)}, ${pc((c / F.breakLine - 1) * 100)}). ${when}에 그 위로 끝나면 상승 시작 — 그다음 ${unitWord}부터 음봉 나올 때마다 산다. 못 넘고 끝나면 안 산다.`;
  } else if (F.state === 'up' && L.state === 'down') {
    const need = L.holdLine / c - 1; p = prob(days, N, -Infinity, need); pLabel = `${when}에 앞 양봉 저가 밑으로 끝날 확률`; var pk = 'sell';
    status = '⛔ 음봉이 양봉 깨는 중'; tone = 'b';
    text = `${thisW} 음봉이 앞 양봉 저가(${fmt(L.holdLine)}) 밑에 와 있다(지금 ${fmt(c)}, ${pc((c / L.holdLine - 1) * 100)}). ${when}에 그 밑이면 하락 시작 — 그 음봉에 던지지 말고 다음 양봉 반등에 판다. 그 위로 회복하면 그냥 들고 간다.`;
  } else if (F.state === 'up' && L.lastDir === 'bear') {
    const lo = L.holdLine / c - 1, hi = cur.o / c - 1; p = prob(days, N, lo, hi); pLabel = `${when}에 음봉이면서 ${fmt(L.holdLine)} 위로 끝날 확률`; var pk = 'buy';
    status = L.doubleTop ? '🎯 상승 중 음봉 (고가 낮아짐)' : '🎯 상승 중 음봉 눌림'; tone = L.doubleTop ? 'y' : 'r';
    text = `상승 중인데 ${thisS} 음봉이다(지금 ${fmt(c)}, 시가 ${fmt(cur.o)}). ${when}에 음봉으로 끝나고 앞 양봉 저가(${fmt(L.holdLine)})를 안 깨면 그 종가에 산다${L.firstBear ? ' — 상승 시작 뒤 첫 음봉이라 제일 좋은 자리' : ''}.` + (L.doubleTop ? ' 다만 음봉 고가가 앞 음봉보다 낮아져서(쌍봉) 더 사지는 않는다.' : '') + ` 깨면 파는 선까지 ${pc((L.holdLine / c - 1) * 100)}.`;
  } else if (F.state === 'up') {
    const lo = L.holdLine != null ? L.holdLine / c - 1 : -Infinity; p = prob(days, N, -Infinity, lo); pLabel = `${when}에 앞 양봉 저가 밑으로 끝날 확률`; var pk = 'sell';
    status = '상승 중 · 양봉'; tone = 'g';
    text = `상승 중이고 ${thisW}도 양봉이라 그냥 들고 간다. 산 자리 아니다 — 다음 음봉 기다린다. 깨면 파는 선은 앞 양봉 저가(${fmt(L.holdLine)})${L.holdLineNext != null ? `, 이 양봉이 끝나면 ${fmt(L.holdLineNext)}까지 올라간다` : ''}.`;
  } else {
    const need = F.breakLine / c - 1; p = prob(days, N, Math.max(need, cur.o / c - 1), Infinity); pLabel = `${when}에 양봉이면서 ${fmt(F.breakLine)} 위로 끝날 확률`; var pk = 'buy';
    status = '하락 중'; tone = '';
    text = `하락 중이다. 양봉이 앞 음봉 고가(${fmt(F.breakLine)})를 넘어야 산다(지금 ${fmt(c)}, ${pc(need * 100)} 남음).` + (L.accel ? ' 양봉이 앞 음봉 못 이기고 또 음봉이 나와서 더 큰 음봉을 조심할 때다.' : '') + (L.lastDir === 'bull' ? ` 이번 ${unitWord} 양봉은 아직 반등일 뿐이다.` : '');
  }
  return {
    tf, status, tone, text, prob: p, probKind: typeof pk === 'undefined' ? 'buy' : pk, probLabel: p == null ? '' : pLabel + (N ? ` · 과거 ${N}${mk.weekdays ? '거래일' : '일'} 움직임으로 셈` : ''),
    when, partial, price: c, open: cur.o, hold: L.holdLine, holdNext: L.holdLineNext, brk: F.state === 'down' ? F.breakLine : L.breakLine,
    state: F.state, liveState: L.state, dir: L.lastDir, events: L.events.filter(e => ['up', 'down', 'doubleTop'].includes(e.type)).slice(-12).map(e => ({ t: e.t, type: e.type })),
    bars: bars.slice(tf === 'month' ? -96 : -156).map(b => [b.t, b.o, b.h, b.l, b.c])
  };
}

const ASSETS = [
  { key: 'KOSPI', name: '코스피', mk: 'kr', unit: 'pt', tfs: ['week', 'month'], best: 'week', note: '37년 실측: 주봉이 제일 좋았다(연 8.1%, 최대 낙폭 -40%). 월봉도 보유보다 낫다.' },
  { key: 'NASDAQ', name: '나스닥', mk: 'us', unit: 'pt', tfs: ['month', 'week'], best: 'month', note: '42년 실측: 월봉 승률 76%. 수익은 보유와 비슷한데 최대 낙폭이 -75% → -46%로 반토막. 닷컴·금융위기 둘 다 피했다.' },
  { key: 'BTC', name: '비트코인', mk: 'coin', unit: 'krw', tfs: ['month', 'week'], best: 'month', note: '9년 실측: 월봉 3번 매매로 상승장 두 번을 먹고 하락장 두 번을 피했다(낙폭 -87% → -43%). 주봉은 휩소가 심해 별로.' },
  { key: 'ETH', name: '이더리움', mk: 'coin', unit: 'krw', tfs: ['month', 'week'], best: 'month', note: '9년 실측: 월봉·주봉 둘 다 보유보다 나았다. 표본이 적고(월봉 4~5번) 한 번 틀리면 크게 틀린다.' },
];

async function load(a) {
  if (a.key === 'KOSPI') { const [m, w, d] = await Promise.all([naverIndex('KOSPI', 'month'), naverIndex('KOSPI', 'week'), naverIndex('KOSPI', 'day')]); return { month: m, week: w, day: d }; }
  if (a.key === 'NASDAQ') { const d = await yahooDaily('^IXIC'); return { day: d, month: aggregate(d, monthKey), week: aggregate(d.filter(x => x.t >= '19710208'), weekKey) }; }
  const mkt = 'KRW-' + a.key; const month = await upbit(mkt, 'months'); const week = await upbit(mkt, 'weeks'); const day = await upbit(mkt, 'days'); return { month, week, day };
}

(async () => {
  const out = { asof: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ') + ' KST', assets: [] };
  for (const a of ASSETS) {
    try {
      const D = await load(a); const mk = market(a.mk);
      const res = { key: a.key, name: a.name, unit: a.unit, best: a.best, note: a.note, price: D.day.at(-1).c, priceT: D.day.at(-1).t, tf: {} };
      for (const tf of a.tfs) {
        const j = judge(a, tf, D[tf], D.day, mk);
        const fixed = j.partial ? D[tf].slice(0, -1) : D[tf];
        j.bt = backtest(fixed, D.day);
        res.tf[tf] = j;
      }
      out.assets.push(res); console.log(a.key, 'ok', res.tf[a.best].status);
    } catch (e) { console.log(a.key, 'FAIL', e.message); }
  }
  if (!out.assets.length) process.exit(1);
  fs.writeFileSync(OUT, JSON.stringify(out));
  // 모니터링 기록: 상태 문구가 바뀌었거나 날짜가 바뀌면 한 줄 추가
  let log = {}; try { log = JSON.parse(fs.readFileSync(LOG, 'utf8')); } catch {}
  const day = out.asof.slice(0, 10);
  for (const a of out.assets) for (const [tf, j] of Object.entries(a.tf)) {
    const k = `${a.key}_${tf}`; log[k] = log[k] || [];
    const lastE = log[k].at(-1);
    const entry = { d: day, s: j.status, p: j.price, prob: j.prob, txt: j.text };
    if (!lastE || lastE.d !== day) log[k].push(entry); else log[k][log[k].length - 1] = entry;
    log[k] = log[k].slice(-60);
  }
  fs.writeFileSync(LOG, JSON.stringify(log));
  console.log('markets.json written');
})();
