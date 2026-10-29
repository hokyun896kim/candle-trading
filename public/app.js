/* 검증 탭 */
(function () {
  const E = window.CandleEngine;
  const $ = (s) => document.querySelector(s);

  // ---- 탭 ----
  document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
    window.scrollTo(0, 0);
  }));

  // ---- 검색 ----
  const q = $('#q'), sugg = $('#sugg');
  let timer = null;
  q.addEventListener('input', () => {
    clearTimeout(timer);
    const v = q.value.trim();
    if (!v) { sugg.style.display = 'none'; return; }
    if (/^\d{6}$/.test(v) || INDEX[v.toUpperCase()]) { sugg.style.display = 'none'; return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(v));
        const items = await r.json();
        if (!Array.isArray(items) || !items.length) { sugg.style.display = 'none'; return; }
        sugg.innerHTML = items.map(x => `<div data-code="${x.code}" data-name="${x.name}"><span>${x.name}</span><small>${x.code} · ${x.market}</small></div>`).join('');
        sugg.style.display = 'block';
      } catch { sugg.style.display = 'none'; }
    }, 220);
  });
  sugg.addEventListener('click', (e) => {
    const d = e.target.closest('div[data-code]'); if (!d) return;
    sugg.style.display = 'none'; q.value = d.dataset.name;
    run(d.dataset.code, d.dataset.name);
  });
  q.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const v = q.value.trim();
      if (INDEX[v.toUpperCase()]) { sugg.style.display = 'none'; run(INDEX[v.toUpperCase()], v.toUpperCase() === 'KOSDAQ' || v === '코스닥' ? '코스닥' : '코스피'); return; }
      if (/^\d{6}$/.test(v)) { sugg.style.display = 'none'; run(v, v); }
      else if (sugg.style.display === 'block') { const d = sugg.querySelector('div[data-code]'); if (d) { sugg.style.display = 'none'; q.value = d.dataset.name; run(d.dataset.code, d.dataset.name); } }
    }
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.search')) sugg.style.display = 'none'; });

  // ---- 최근 ----
  function getRecent() { try { return JSON.parse(localStorage.getItem('ct_recent') || '[]'); } catch { return []; } }
  function pushRecent(code, name) {
    try {
      let r = getRecent().filter(x => x.code !== code); r.unshift({ code, name }); r = r.slice(0, 8);
      localStorage.setItem('ct_recent', JSON.stringify(r));
    } catch {}
    renderRecent();
  }
  function renderRecent() {
    const r = getRecent();
    $('#recent').innerHTML = r.map(x => `<span class="chip o" data-code="${x.code}" data-name="${x.name}" style="cursor:pointer">${x.name}</span>`).join('');
  }
  $('#recent').addEventListener('click', (e) => { const c = e.target.closest('[data-code]'); if (c) { q.value = c.dataset.name; run(c.dataset.code, c.dataset.name); } });
  renderRecent();

  // ---- KST 시간 ----
  function nowKST() { return new Date(Date.now() + 9 * 3600 * 1000); } // UTC 기준 +9 (getUTC* 로 읽는다)
  function kstYMD(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
  function isPartial(tf, lastT) {
    const k = nowKST();
    const today = kstYMD(k);
    const mins = k.getUTCHours() * 60 + k.getUTCMinutes();
    if (tf === 'day') return lastT === today && mins < 15 * 60 + 40;
    if (tf === 'month') return lastT.slice(0, 6) === today.slice(0, 6); // 이번 달은 월말 종가 전까지 진행 중
    // week: localDate = 주 시작(일요일). 그 주 금요일 15:40 KST 전이면 진행 중
    const y = +lastT.slice(0, 4), m = +lastT.slice(4, 6) - 1, d = +lastT.slice(6, 8);
    const fri = new Date(Date.UTC(y, m, d + 5, 15, 40)); // 일요일+5 = 금요일
    return k.getTime() < fri.getTime();
  }

  // ---- 시총 순위표 ----
  let RANKS = null;
  fetch('ranks.json').then(r => r.json()).then(j => { RANKS = j; }).catch(() => {});
  // 그룹 분류 + 10년 캔들 단독 백테스트(431종목, 수수료 없음) 요약
  const GROUP_STATS = {
    'KOSPI 대형': { label: '코스피 대형 (1~100위)', tone: 'g', month: '승률 48% · 평균 +33% · 손익비 5.1', week: '승률 43% · 손익비 2.5', day: '승률 42% · 손익비 1.5', note: '추세가 길어 캔들 단독이 제일 잘 먹히는 구간' },
    'KOSPI 중형': { label: '코스피 중형 (101~300위)', tone: 'y', month: '승률 42% · 평균 +14% · 손익비 2.5', week: '승률 42% · 손익비 1.9', day: '승률 41% · 손익비 1.3', note: '⚠ 추세 짧고 폭 작아 휩소 비용만 남는 구간 — 캔들 단독 손익비가 대형의 절반' },
    'KOSPI 소형': { label: '코스피 소형 (301위~)', tone: 'y', month: '미검증', week: '미검증', day: '미검증', note: '⚠ 백테스트 범위 밖. 거래정지·상폐 위험까지 겹친다' },
    'KOSDAQ 상위': { label: '코스닥 상위 (1~150위)', tone: 'g', month: '승률 46% · 평균 +41% · 손익비 4.5', week: '승률 42% · 손익비 2.8', day: '승률 41% · 손익비 1.6', note: '터지면 크게 터져 월봉 손익비 높음. 대신 변동성도 크다' },
    'KOSDAQ 기타': { label: '코스닥 (151위~)', tone: 'y', month: '미검증', week: '미검증', day: '미검증', note: '⚠ 백테스트 범위 밖. 상폐·정지 위험 구간' },
  };
  function groupOf(code) {
    if (code === 'KOSPI' || code === 'KOSDAQ') return null;
    const r = RANKS && RANKS.ranks && RANKS.ranks[code]; if (!r) return null;
    const g = r.m === 'KOSPI' ? (r.r <= 100 ? 'KOSPI 대형' : r.r <= 300 ? 'KOSPI 중형' : 'KOSPI 소형') : (r.r <= 150 ? 'KOSDAQ 상위' : 'KOSDAQ 기타');
    return { ...GROUP_STATS[g], key: g, rank: r.r, market: r.m, asof: RANKS.asof };
  }

  // ---- 실행 ----
  let charts = [];
  const INDEX = { '코스피': 'KOSPI', 'KOSPI': 'KOSPI', '코스닥': 'KOSDAQ', 'KOSDAQ': 'KOSDAQ' };
  async function getBars(code, tf) {
    const r = await fetch(`/api/ohlc?code=${code}&tf=${tf}`); const j = await r.json();
    if (j.error) throw new Error(j.error); if (!j.bars || !j.bars.length) throw new Error('데이터 없음: ' + code + ' ' + tf);
    return j.bars;
  }
  // 확정 판정(진행 중 봉 제외) + 진행 중 판정
  function judge(tf, bars) {
    const partial = isPartial(tf, bars[bars.length - 1].t);
    const live = E.analyze(bars);
    const fixed = partial && bars.length > 2 ? E.analyze(bars.slice(0, -1)) : live;
    return { partial, live, fixed, bars, act: effective(fixed, live, partial) };
  }
  // 행동 판정용: 상태(상승/하락)는 확정 봉, 행동 플래그(매수/반등매도/가속/쌍봉)는 진행 중 봉 기준.
  // 확정 상태와 진행 상태가 다르면(전환 임박·종료 임박) 행동 플래그는 전부 끈다 — 월말/금요일 종가 확인 전.
  function effective(fixed, live, partial) {
    if (!partial) return fixed;
    if (fixed.state === live.state) return live;
    return { ...fixed, lastDir: live.lastDir, curBlock: live.curBlock, lastBar: live.lastBar, buyOK: false, firstBear: false, doubleTop: false, sellBounce: false, accel: false, pending: true, pullNo: fixed.pullNo, upT: fixed.upT, upP: fixed.upP };
  }
  async function run(code, name) {
    const out = $('#result');
    out.innerHTML = '<div class="card loading">월봉·주봉·일봉 불러오는 중…</div>';
    charts.forEach(c => { try { c.remove(); } catch {} }); charts = [];
    try {
      const isIdx = /^(KOSPI|KOSDAQ)$/.test(code);
      const [dB, wB, mB, kB] = await Promise.all([getBars(code, 'day'), getBars(code, 'week'), getBars(code, 'month'), isIdx ? null : getBars('KOSPI', 'month')]);
      const D = judge('day', dB), W = judge('week', wB), M = judge('month', mB);
      const K = kB ? judge('month', kB) : null;
      pushRecent(code, name);
      render(out, { code, name, D, W, M, K });
    } catch (e) {
      out.innerHTML = `<div class="card"><div class="err">불러오기 실패: ${e.message}</div><p class="note">로컬 파일로 열었으면 /api 가 없어서 실패한다. candle-trading.netlify.app 에서 열어라.</p></div>`;
    }
  }

  function dateK(t) { return `${t.slice(2, 4)}.${t.slice(4, 6)}.${t.slice(6, 8)}`; }
  // 시간축별 말
  function words(tf, lastT) {
    const y = +lastT.slice(0, 4), m = +lastT.slice(4, 6), d = +lastT.slice(6, 8);
    if (tf === 'month') { let dt = new Date(Date.UTC(y, m, 0)); while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6) dt = new Date(dt.getTime() - 864e5); return { this: '이번 달', next: `${m === 12 ? 1 : m + 1}월`, closeAt: `${m}월 ${dt.getUTCDate()}일 종가`, bar: '달' }; }
    if (tf === 'week') { const fri = new Date(Date.UTC(y, m - 1, d + 5)); return { this: '이번 주', next: '다음 주', closeAt: `${fri.getUTCMonth() + 1}월 ${fri.getUTCDate()}일(금) 종가`, bar: '주' }; }
    return { this: '오늘', next: '내일', closeAt: '오늘 15:30 종가', bar: '날' };
  }
  function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

  function render(out, R) {
    const { D, W, M, K } = R;
    // 종합 판정은 확정 봉 기준, 진행 중 봉 기준은 참고로
    let comb = E.combine(D.act, W.act, M.act);
    if (M.act.pending) {
      comb = M.live.state === 'up'
        ? (() => { const w = words('month', M.live.lastBar.t); return { ...comb, code: 'nobuy', title: `⏳ ${w.this} 월봉 양봉이 앞 음봉을 이기는 중`, detail: `앞 음봉 고가 ${E.fmt(M.fixed.breakLine)}을 지금 넘고 있다. ${w.closeAt}가 ${E.fmt(M.fixed.breakLine)} 위로 끝나면 → ${w.next}부터 음봉 나올 때마다 산다. 못 넘으면 안 산다. (지금 미리 사면: 열에 다섯은 못 넘고, 그땐 평균 -6.5%)` }; })()
        : (() => { const w = words('month', M.live.lastBar.t); return { ...comb, code: 'nobuy', title: `⏳ ${w.this} 월봉 음봉이 앞 양봉을 깨는 중`, detail: `앞 양봉 저가 ${E.fmt(M.live.holdLine)} 밑에 와 있다. ${w.closeAt}가 ${E.fmt(M.live.holdLine)} 밑으로 끝나면 → 다음 양봉 올 때 판다. 새로 사지는 않는다.` }; })();
    } else if (W.act.pending && M.act.state !== 'down') {
      comb = W.live.state === 'up'
        ? (() => { const w = words('week', W.live.lastBar.t); return { ...comb, title: `⏳ ${w.this} 주봉 양봉이 앞 음봉을 이기는 중`, detail: `앞 음봉 고가 ${E.fmt(W.fixed.breakLine)}을 넘고 있다. ${w.closeAt}로 넘으면 일봉 매매 시작. ` + comb.detail }; })()
        : (() => { const w = words('week', W.live.lastBar.t); return { ...comb, title: `⏳ ${w.this} 주봉 음봉이 앞 양봉을 깨는 중`, detail: `앞 양봉 저가 ${E.fmt(W.live.holdLine)} 밑에 와 있다. ${w.closeAt}로 깨지면 새로 안 산다. ` + comb.detail }; })();
    }
    const combLive = (D.partial || W.partial || M.partial) ? E.combine(D.live, W.live, M.live) : null;
    const kg = K ? E.monthlyGate(K.fixed) : null;
    const kgLive = K ? E.monthlyGate(K.live) : null;
    let html = `
      <section class="card verdict ${comb.code}">
        <div class="name">${R.name} · ${R.code}</div>
        <div class="big">${comb.title}</div>
        <p>${comb.detail}</p>
        <div style="margin-top:8px">
          <span class="chip" style="background:rgba(255,255,255,.22);color:#fff">이 종목 월봉: ${comb.gate.label}</span>
          ${kg ? `<span class="chip" style="background:rgba(255,255,255,.22);color:#fff">코스피 월봉: ${kg.label}${kgLive && kgLive.code !== kg.code ? ' → 이번 달은 ' + kgLive.label : ''}</span>` : ''}
        </div>
        ${combLive && (combLive.title !== comb.title) ? `<p style="font-size:12.5px;margin-top:10px;padding:8px 10px;background:rgba(255,255,255,.18);border-radius:10px">⏳ 지금 봉이 이대로 끝나면: <b>${combLive.title}</b> — ${combLive.detail}</p>` : ''}
        <p style="font-size:11.5px;opacity:.85;margin-top:8px">판정은 끝난 봉 기준(일봉 15:30·주봉 금요일·월봉 월말 종가). ${D.partial ? '오늘 장중' : ''}${D.partial && (W.partial || M.partial) ? ' · ' : ''}${W.partial ? '이번 주 아직 안 끝남' : ''}${(D.partial || W.partial) && M.partial ? ' · ' : ''}${M.partial ? '이번 달 아직 안 끝남' : ''}</p>
      </section>
      ${groupCard(groupOf(R.code))}
      ${panel('월봉 — 시황', 'm', M, 'month')}
      ${panel('주봉 — 종목 상태', 'w', W, 'week')}
      ${panel('일봉 — 타이밍', 'd', D, 'day')}
      <p class="note">판정은 전부 종가 기준·꼬리 포함·연속 같은 색은 한 봉으로. 데이터: 네이버 금융. 거래정지·액면분할 종목은 구간이 왜곡될 수 있으니 차트로 한 번 더 확인. 코스피 지수 자체를 보려면 '코스피'라고 쳐라.</p>`;
    out.innerHTML = html;
    drawChart('chart-m', M.bars, M.live, 60);
    drawChart('chart-w', W.bars, W.live, 120);
    drawChart('chart-d', D.bars, D.live, 130);
  }

  function groupCard(G) {
    if (!G) return '';
    return `
      <section class="card">
        <div class="state" style="margin:0 0 6px"><span class="chip ${G.tone}">${G.label}</span><span class="chip">${G.market} 시총 ${G.rank}위</span></div>
        <p style="margin:4px 0 8px"><b>${G.note}</b></p>
        <div class="pstat" style="margin:0"><span>월봉 ${G.month}</span><span>주봉 ${G.week}</span><span>일봉 ${G.day}</span></div>
        <p class="note">같은 그룹 10년 캔들 단독 백테스트(상승전환 매수→하락전환 뒤 양봉 매도, 수수료 없음, 생존편향 있음). 순위 기준일 ${G.asof}.</p>
      </section>`;
  }

  function upTxt(t, w) { return w.bar === '달' ? `${t.slice(2, 4)}년 ${+t.slice(4, 6)}월` : `${+t.slice(4, 6)}월 ${+t.slice(6, 8)}일`; }
  function stateLine(S, w) {
    const st = S.state; w = w || { this: '이번', next: '다음', closeAt: '종가', bar: '봉' };
    const stTxt = st === 'up' ? '상승 중' : st === 'down' ? '하락 중' : '판정 없음';
    let action, chip;
    if (st === 'up') {
      if (S.lastDir === 'bear') {
        if (S.doubleTop) { action = `음봉 고가가 낮아짐(쌍봉) — 더 안 산다. 앞 양봉 저가 ${E.fmt(S.holdLine)} 지키는지만 본다`; chip = 'y'; }
        else if (S.buyOK) {
          const n = S.pullNo || 1, since = S.upT ? `${upTxt(S.upT, w)}에 양봉이 음봉 이긴 뒤${S.upP ? `(그때 ${E.fmt(S.upP)} → 지금 ${pct((S.lastBar.c / S.upP - 1) * 100)})` : ''} ` : '';
          const mo = w.bar === '달';
          action = `${since}${n}번째 음봉 — 이 종가에 산다${n === 1 ? ' (제일 좋은 자리)' : mo && n >= 3 ? ' (많이 오른 뒤라 힘 빠진 자리)' : ''}`; chip = mo && n >= 3 ? 'y' : 'r';
        }
        else { action = `앞 양봉 저가 ${E.fmt(S.holdLine)} 깨짐`; chip = 'y'; }
      } else { action = `양봉 중 — 들고 간다. ${w.next} 음봉 오면 산다`; chip = 'g'; }
    } else if (st === 'down') {
      if (S.lastDir === 'bull') { action = '하락 중 양봉 반등 — 이 양봉에 판다'; chip = 'b'; }
      else { action = S.accel ? '⚠ 양봉이 앞 음봉 못 이기고 또 음봉 — 더 큰 음봉 올 수 있다' : '하락 중 — 양봉 반등 오면 판다'; chip = S.accel ? 'y' : 'b'; }
    } else { action = '양봉이 음봉 이긴 적도, 음봉이 양봉 깬 적도 없음'; chip = ''; }
    return { stTxt, action, chip };
  }

  function panel(title, key, J, tf) {
    const S = J.fixed, L = J.live, A = J.act, last = S.lastBar;
    const w = words(tf, L.lastBar.t);
    const f = stateLine(A, w), l = stateLine(L, w);
    if (A.pending) { f.action = L.state === 'up' ? `⏳ ${w.this} 양봉이 앞 음봉 고가 ${E.fmt(S.breakLine)} 넘는 중 — ${w.closeAt} 보고 결정` : `⏳ ${w.this} 음봉이 앞 양봉 저가 ${E.fmt(L.holdLine)} 깨는 중 — ${w.closeAt} 보고 결정`; f.chip = 'y'; }
    const dirTxt = (A.lastDir === 'bull' ? '양봉' : '음봉') + ` ${A.curBlock.n}개째` + (J.partial ? ' (아직 안 끝남)' : '');
    const evs = S.events.filter(e => ['up', 'down', 'doubleTop', 'accel'].includes(e.type)).slice(-6).reverse();
    const perf = E.performance(J.bars, L, 8, 'turn', 0.25), perfB = E.performance(J.bars, L, 8, 'bear', 0.25);
    const nowBear = J.partial && S.lastDir === 'bull' && L.lastDir === 'bear' && S.holdLineNext != null;
    const hl = nowBear ? S.holdLineNext : S.holdLine;
    const kv = S.state === 'up'
      ? `<div class="box"><div class="k">앞 양봉 저가 — 여기 깨면 판다</div><div class="v" style="color:var(--orange-deep)">${E.fmt(hl)}</div><div class="s">${nowBear ? `${w.this} 음봉 기준 · 지금 ${E.fmt(L.lastBar.c)}에서 ${pct((hl / L.lastBar.c - 1) * 100)}` : S.holdLineNext != null && S.holdLineNext !== S.holdLine ? '이 양봉 끝나면 ' + E.fmt(S.holdLineNext) + '로 올라감' : (S.holdLine != null ? '여기까지 ' + pct((last.c / S.holdLine - 1) * 100) : '')}</div></div>`
      : `<div class="box"><div class="k">앞 음봉 고가 — 여기 넘으면 산다</div><div class="v" style="color:var(--blue)">${E.fmt(S.breakLine)}</div><div class="s">${S.breakLine != null ? '양봉 종가가 ' + pct((S.breakLine / last.c - 1) * 100) + ' 더 가야' : ''}</div></div>`;
    const liveBar = L.lastBar;
    const liveBlock = J.partial ? `
        <div class="live">
          <div class="k">⏳ ${w.this} 봉 (${L.lastDir === 'bull' ? '양봉' : '음봉'} · 지금 ${E.fmt(liveBar.c)})</div>
          <div class="t">${w.closeAt}가 이대로면 → <b>${l.stTxt}</b> · ${l.action}${L.state === 'up' && L.holdLine != null ? ` · 깨면 파는 선 ${E.fmt(L.holdLine)}` : ''}${L.state === 'down' && L.breakLine != null ? ` · 넘으면 사는 선 ${E.fmt(L.breakLine)}` : ''}</div>
        </div>` : '';
    const perfRows = perf.trades.map(t => `<tr><td>${dateK(t.et)}</td><td>${dateK(t.xt)}${t.openTrade ? '<small> ' + t.note + '</small>' : ''}</td><td class="${t.pct >= 0 ? 'pos' : 'neg'}">${pct(t.pct)}</td><td>${t.bars}${w.bar}</td></tr>`).join('');
    const nowIs = A.pending && L.state === 'up' ? 'turn' : (A.state === 'up' && L.lastDir === 'bear' ? 'bear' : '');
    const t10 = (() => { const k = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''); return String(+k.slice(0, 4) - 10) + k.slice(4); })();
    const pfTxt = x => x.pf >= 99 ? '손해 없음' : x.pf.toFixed(1);
    const sline = (p, lab, k) => {
      if (!p.stats) return `<div class="pstat"><span><b>${lab}</b></span><span>끝난 매매 없음</span></div>`;
      const r10 = E.statsOf(p.allTrades, t10);
      return `<div class="pstat" style="${nowIs === k ? 'background:#FFF1E6;border-radius:10px;padding:6px 8px' : ''}"><span><b>${lab}</b>${nowIs === k ? ' ← 지금 자리' : ''}</span><span>${p.stats.n}번</span><span>승률 <b>${p.stats.win.toFixed(0)}%</b></span><span>평균 <b class="${p.stats.avg >= 0 ? 'pos' : 'neg'}">${pct(p.stats.avg)}</b></span><span>손익비 <b class="${p.stats.pf >= 1 ? 'pos' : 'neg'}">${pfTxt(p.stats)}</b></span>${r10 && r10.n !== p.stats.n ? `<span>최근 10년만: ${r10.n}번 · 평균 ${pct(r10.avg)} · 손익비 <b class="${r10.pf >= 1 ? 'pos' : 'neg'}">${pfTxt(r10)}</b></span>` : ''}</div>`;
    };
    const perfStat = sline(perf, `넘은 ${w.bar} 종가에 샀으면`, 'turn') + sline(perfB, '음봉마다 샀으면', 'bear') + ((perf.stats && perf.stats.n < 5) || (perfB.stats && perfB.stats.n < 5) ? `<p class="note" style="margin:2px 0 6px">5번 안 되는 건 우연이 많이 섞인다 — 참고만.</p>` : '');
    return `
      <section class="card">
        <h2>${title}</h2>
        <div class="state"><span class="dot ${S.state}"></span><b>${f.stTxt}</b><span class="chip">${dirTxt}</span></div>
        <span class="chip ${f.chip}">${f.action}</span>
        <div class="kv">
          <div class="box"><div class="k">끝난 봉 종가 (${dateK(last.t)})</div><div class="v">${E.fmt(last.c)}</div><div class="s">${S.lastDir === 'bull' ? '양봉' : '음봉'} · 저 ${E.fmt(last.l)} / 고 ${E.fmt(last.h)}</div></div>
          ${kv}
        </div>
        ${liveBlock}
        <div id="chart-${key}" class="chart"></div>
        <ul class="ev">${evs.map(e => `<li><span class="d">${dateK(e.t)}</span><span class="tag ${e.type === 'up' ? 'up' : e.type === 'down' ? 'down' : e.type === 'accel' ? 'ac' : 'dt'}">${e.type === 'up' ? '양봉이 이김' : e.type === 'down' ? '음봉이 깸' : e.type === 'accel' ? '또 음봉' : '고가 낮아짐'}</span><span>${e.type === 'up' ? '양봉 종가 ' + E.fmt(e.price) + ' > 앞 음봉 고가 ' + E.fmt(e.level) + ' → 상승 시작' : e.type === 'down' ? '음봉 종가 ' + E.fmt(e.price) + ' < 앞 양봉 저가 ' + E.fmt(e.level) + ' → 하락 시작' : e.type === 'accel' ? '양봉이 ' + E.fmt(e.level) + ' 못 넘고 또 음봉' : '음봉 고가가 ' + E.fmt(e.level) + ' 못 넘고 낮아짐(쌍봉)'}</span></li>`).join('') || '<li><span class="d">-</span>신호 없음</li>'}</ul>
        <h3 style="margin-top:14px">이 종목에서 과거에 이렇게 했으면 <span class="note" style="display:inline">파는 건 둘 다 음봉이 양봉 깬 뒤 첫 양봉 종가 · 수수료·세금 0.25% 뺌 · 아래 표는 넘은 ${w.bar} 종가 매수</span></h3>
        ${perfStat}
        <table class="perf"><tr><th>샀을 때</th><th>팔았을 때</th><th>수익</th><th>기간</th></tr>${perfRows || '<tr><td colspan="4">-</td></tr>'}</table>
      </section>`;
  }

  function drawChart(id, bars, S, N) {
    const el = document.getElementById(id); if (!el || !window.LightweightCharts) return;
    const data = bars.slice(-N).map(b => ({ time: `${b.t.slice(0, 4)}-${b.t.slice(4, 6)}-${b.t.slice(6, 8)}`, open: b.o, high: b.h, low: b.l, close: b.c }));
    const chart = LightweightCharts.createChart(el, {
      layout: { background: { color: '#fff' }, textColor: '#868B94', fontSize: 11 },
      localization: { locale: 'ko-KR', dateFormat: 'yy.MM.dd' },
      grid: { vertLines: { color: '#F2F3F6' }, horzLines: { color: '#F2F3F6' } },
      rightPriceScale: { borderColor: '#EAEBEE' }, timeScale: { borderColor: '#EAEBEE', timeVisible: false },
      crosshair: { mode: 0 }, handleScroll: true, handleScale: true, autoSize: true,
    });
    const s = chart.addCandlestickSeries({ upColor: '#F04452', downColor: '#3182F6', borderUpColor: '#F04452', borderDownColor: '#3182F6', wickUpColor: '#F04452', wickDownColor: '#3182F6', priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    s.setData(data);
    const firstT = data[0].time.replace(/-/g, '');
    const markers = S.events.filter(e => e.t >= firstT && (e.type === 'up' || e.type === 'down' || e.type === 'doubleTop')).map(e => ({
      time: `${e.t.slice(0, 4)}-${e.t.slice(4, 6)}-${e.t.slice(6, 8)}`,
      position: e.type === 'down' ? 'aboveBar' : 'belowBar',
      color: e.type === 'up' ? '#FF6F0F' : e.type === 'down' ? '#3182F6' : '#FFB300',
      shape: e.type === 'up' ? 'arrowUp' : e.type === 'down' ? 'arrowDown' : 'circle',
      text: e.type === 'up' ? '↑' : e.type === 'down' ? '↓' : ''
    }));
    s.setMarkers(markers);
    if (S.state === 'up' && S.holdLine != null) s.createPriceLine({ price: S.holdLine, color: '#FF6F0F', lineWidth: 1.5, lineStyle: 2, title: '깨면 판다' });
    if (S.state === 'up' && S.holdLineNext != null && S.holdLineNext !== S.holdLine) s.createPriceLine({ price: S.holdLineNext, color: '#FFB27A', lineWidth: 1, lineStyle: 3, title: '이 양봉 끝나면' });
    if (S.state === 'down' && S.breakLine != null) s.createPriceLine({ price: S.breakLine, color: '#3182F6', lineWidth: 1.5, lineStyle: 2, title: '넘으면 산다' });
    chart.timeScale().fitContent();
    charts.push(chart);
    
  }

  // URL ?code= 지원
  const p = new URLSearchParams(location.search);
  if (p.get('code')) { document.querySelector('[data-tab="verify"]').click(); q.value = p.get('code'); run(p.get('code'), p.get('name') || p.get('code')); }
})();
