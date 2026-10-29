// 월봉 캔들 스캔: 코스피 200 + 코스닥 150 → public/scan.json
// 실행: node scripts/scan.js   (GitHub Actions에서 평일 장 마감 뒤 자동 실행)
const E = require('../public/engine.js');
const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');
const H = { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' };

async function getJSON(url) {
  try { const r = await fetch(url, { headers: H }); if (!r.ok) throw new Error(r.status); return await r.json(); }
  catch (e) { return JSON.parse(execFileSync('curl', ['-s', '-A', 'Mozilla/5.0', url], { maxBuffer: 1e8 }).toString()); }
}
async function list(mkt, n) {
  // 시총 순으로 받되 ETF·스팩은 빼고 종목만 n개 — 순위도 종목끼리 다시 매긴다
  let out = [];
  for (let p = 1; out.length < n && p < 20; p++) {
    const j = await getJSON(`https://m.stock.naver.com/api/stocks/marketValue/${mkt}?page=${p}&pageSize=100`);
    const st = (j.stocks || []).filter(s => /^\d{6}$/.test(s.itemCode) && !isEtf(s.stockName));
    out = out.concat(st.map(s => ({ code: s.itemCode, name: s.stockName, market: mkt })));
    if ((j.stocks || []).length < 100) break;
  }
  return out.slice(0, n).map((s, i) => ({ ...s, rank: i + 1 }));
}
const ETF_RE = /^(KODEX|TIGER|ACE|KBSTAR|RISE|SOL|HANARO|PLUS|KOSEF|ARIRANG|TIMEFOLIO|KoAct|WON|1Q|BNK|HK|KIWOOM|DAISHIN|UNICORN|마이티|히어로즈|파워|TREX|FOCUS|KCGI|VITA|WOORI|ITF|TIME|SAMSUNG|MIRAE|KB|KODEX)\b|스팩|SPAC|ETN|ETF/i;
function isEtf(n) { return ETF_RE.test(n); }
function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
async function bars(code, tf, years) {
  const end = new Date(); end.setDate(end.getDate() + 1);
  const start = new Date(); start.setFullYear(start.getFullYear() - years);
  const rows = await getJSON(`https://api.stock.naver.com/chart/domestic/item/${code}/${tf}?startDateTime=${ymd(start)}0000&endDateTime=${ymd(end)}0000`);
  return E.fromNaver(Array.isArray(rows) ? rows : []);
}
// KST 기준 진행 중 봉 판정
function nowKST() { return new Date(Date.now() + 9 * 3600 * 1000); }
function isPartial(tf, lastT) {
  const k = nowKST(); const today = ymd(k); const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
  if (tf === 'day') return lastT === today && mins < 15 * 60 + 40;
  if (tf === 'month') return lastT.slice(0, 6) === today.slice(0, 6);
  const y = +lastT.slice(0, 4), m = +lastT.slice(4, 6) - 1, d = +lastT.slice(6, 8);
  return k.getTime() < Date.UTC(y, m, d + 5, 15, 40);
}
function brief(S) {
  return { state: S.state, dir: S.lastDir, n: S.curBlock ? S.curBlock.n : 0, close: S.lastBar.c, t: S.lastBar.t,
    hold: S.holdLine, holdNext: S.holdLineNext, brk: S.breakLine, buyOK: S.buyOK, first: S.firstBear, nth: S.pullNo, upT: S.upT, upP: S.upP, dt: S.doubleTop, accel: S.accel, sellB: S.sellBounce };
}
async function one(s) {
  const [m, w] = await Promise.all([bars(s.code, 'month', 25), bars(s.code, 'week', 10)]);
  if (m.length < 24 || w.length < 30) return null;
  const mp = isPartial('month', m[m.length - 1].t), wp = isPartial('week', w[w.length - 1].t);
  const mLive = E.analyze(m), mFix = mp ? E.analyze(m.slice(0, -1)) : mLive;
  const wLive = E.analyze(w), wFix = wp ? E.analyze(w.slice(0, -1)) : wLive;
  const COST = 0.25;   // 수수료·세금 왕복 %
  const st = p => p.stats ? { n: p.stats.n, win: Math.round(p.stats.win), avg: +p.stats.avg.toFixed(1), pf: +p.stats.pf.toFixed(2) } : null;
  const mB = m.slice(0, mp ? -1 : undefined), wB = w.slice(0, wp ? -1 : undefined);
  const perf = E.performance(mB, mFix, 9999, 'turn', COST);
  const pm = { turn: st(perf), bear: st(E.performance(mB, mFix, 9999, 'bear', COST)) };
  const pw = { turn: st(E.performance(wB, wFix, 9999, 'turn', COST)), bear: st(E.performance(wB, wFix, 9999, 'bear', COST)) };
  const lastEv = [...mFix.events].reverse().find(e => ['up', 'down', 'doubleTop'].includes(e.type));
  return { ...s, m: { fix: brief(mFix), live: brief(mLive), partial: mp, lastEv: lastEv ? { t: lastEv.t, type: lastEv.type, level: lastEv.level } : null },
    w: { fix: brief(wFix), live: brief(wLive), partial: wp },
    perf: perf.stats ? { n: perf.stats.n, win: +perf.stats.win.toFixed(0), avg: +perf.stats.avg.toFixed(1), med: +perf.stats.med.toFixed(1) } : null,
    pm, pw, mFrom: mB[0].t.slice(0, 4),
    mo12: m.length >= 13 ? +((m[m.length - 1].c / m[m.length - 13].c - 1) * 100).toFixed(1) : null };
}
async function pool(items, fn, k) { const out = []; let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const it = items[i++]; try { out.push(await fn(it)); } catch (e) { out.push(null); } } })); return out; }

(async () => {
  const universe = [...await list('KOSPI', 200), ...await list('KOSDAQ', 150)];
  console.log('universe', universe.length);
  const rows = (await pool(universe, one, 8)).filter(Boolean);
  const k = await bars('KOSPI', 'month', 12).catch(() => null);
  let kospi = null;
  if (k) { try { const kk = await getJSON(`https://api.stock.naver.com/chart/domestic/index/KOSPI/month?startDateTime=${ymd(new Date(Date.now() - 12 * 365 * 864e5))}0000&endDateTime=${ymd(new Date(Date.now() + 864e5))}0000`); const kb = E.fromNaver(kk); const mp = isPartial('month', kb[kb.length - 1].t); kospi = { fix: brief(E.analyze(mp ? kb.slice(0, -1) : kb)), live: brief(E.analyze(kb)), partial: mp, gate: E.monthlyGate(E.analyze(mp ? kb.slice(0, -1) : kb)), gateLive: E.monthlyGate(E.analyze(kb)) }; } catch (e) {} }
  const out = { asof: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' KST', n: rows.length, kospi, rows };
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'scan.json'), JSON.stringify(out));
  console.log('scan.json', rows.length, 'rows');
})();
