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
  let out = [];
  for (let p = 1; out.length < n; p++) {
    const j = await getJSON(`https://m.stock.naver.com/api/stocks/marketValue/${mkt}?page=${p}&pageSize=100`);
    const st = j.stocks || []; out = out.concat(st.map((s, i) => ({ code: s.itemCode, name: s.stockName, market: mkt, rank: (p - 1) * 100 + i + 1 })));
    if (st.length < 100) break;
  }
  return out.slice(0, n);
}
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
    hold: S.holdLine, holdNext: S.holdLineNext, brk: S.breakLine, buyOK: S.buyOK, first: S.firstBear, dt: S.doubleTop, accel: S.accel, sellB: S.sellBounce };
}
async function one(s) {
  const [m, w] = await Promise.all([bars(s.code, 'month', 12), bars(s.code, 'week', 3)]);
  if (m.length < 24 || w.length < 30) return null;
  const mp = isPartial('month', m[m.length - 1].t), wp = isPartial('week', w[w.length - 1].t);
  const mLive = E.analyze(m), mFix = mp ? E.analyze(m.slice(0, -1)) : mLive;
  const wLive = E.analyze(w), wFix = wp ? E.analyze(w.slice(0, -1)) : wLive;
  const perf = E.performance(m.slice(0, mp ? -1 : undefined), mFix, 9999);
  const lastEv = [...mFix.events].reverse().find(e => ['up', 'down', 'doubleTop'].includes(e.type));
  return { ...s, m: { fix: brief(mFix), live: brief(mLive), partial: mp, lastEv: lastEv ? { t: lastEv.t, type: lastEv.type, level: lastEv.level } : null },
    w: { fix: brief(wFix), live: brief(wLive), partial: wp },
    perf: perf.stats ? { n: perf.stats.n, win: +perf.stats.win.toFixed(0), avg: +perf.stats.avg.toFixed(1), med: +perf.stats.med.toFixed(1) } : null,
    mo12: m.length >= 13 ? +((m[m.length - 1].c / m[m.length - 13].c - 1) * 100).toFixed(1) : null };
}
async function pool(items, fn, k) { const out = []; let i = 0; await Promise.all(Array.from({ length: k }, async () => { while (i < items.length) { const it = items[i++]; try { out.push(await fn(it)); } catch (e) { out.push(null); } } })); return out; }

(async () => {
  const universe = [...await list('KOSPI', 200), ...await list('KOSDAQ', 150)].filter(s => /^\d{6}$/.test(s.code) && !/스팩|SPAC/.test(s.name));
  console.log('universe', universe.length);
  const rows = (await pool(universe, one, 8)).filter(Boolean);
  const k = await bars('KOSPI', 'month', 12).catch(() => null);
  let kospi = null;
  if (k) { try { const kk = await getJSON(`https://api.stock.naver.com/chart/domestic/index/KOSPI/month?startDateTime=${ymd(new Date(Date.now() - 12 * 365 * 864e5))}0000&endDateTime=${ymd(new Date(Date.now() + 864e5))}0000`); const kb = E.fromNaver(kk); const mp = isPartial('month', kb[kb.length - 1].t); kospi = { fix: brief(E.analyze(mp ? kb.slice(0, -1) : kb)), live: brief(E.analyze(kb)), partial: mp, gate: E.monthlyGate(E.analyze(mp ? kb.slice(0, -1) : kb)), gateLive: E.monthlyGate(E.analyze(kb)) }; } catch (e) {} }
  const out = { asof: new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' KST', n: rows.length, kospi, rows };
  fs.writeFileSync(path.join(__dirname, '..', 'public', 'scan.json'), JSON.stringify(out));
  console.log('scan.json', rows.length, 'rows');
})();
