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
      if (/^\d{6}$/.test(v)) { sugg.style.display = 'none'; run(v, null); }
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
  async function nameOf(code) {
    try { const r = await fetch('/api/search?q=' + code); const j = await r.json(); const x = Array.isArray(j) && j.find(i => i.code === code); return x ? x.name : code; } catch { return code; }
  }
  async function run(code, name) {
    const out = $('#result');
    out.innerHTML = '<div class="card"><div class="skel" style="width:35%"></div><div class="skel" style="height:36px;width:55%"></div><div class="skel"></div><div class="skel" style="width:80%"></div></div>';
    charts.forEach(c => { try { c.remove(); } catch {} }); charts = [];
    try {
      const isIdx = /^(KOSPI|KOSDAQ)$/.test(code);
      if (!name || name === code) name = /^(KOSPI|KOSDAQ)$/.test(code) ? (code === 'KOSDAQ' ? '코스닥' : '코스피') : await nameOf(code);
      if (q.value.trim() === code) q.value = name;
      const [dB, wB, mB, kB] = await Promise.all([getBars(code, 'day'), getBars(code, 'week'), getBars(code, 'month'), isIdx ? null : getBars('KOSPI', 'month')]);
      const D = judge('day', dB), W = judge('week', wB), M = judge('month', mB);
      const K = kB ? judge('month', kB) : null;
      pushRecent(code, name);
      render(out, { code, name, D, W, M, K });
    } catch (e) {
      out.innerHTML = `<div class="card"><div class="err">불러오기 실패: ${e.message}</div><p class="note">로컬 파일로 열었으면 /api 가 없어서 실패한다. candle-trading.netlify.app 에서 열어라.</p></div>`;
    }
  }

  const clean = (t) => String(t || '').replace(/[⏳⚠🔥🎯⛔⭐👍]\uFE0F?\s?/g, '');
  function friK(t) { const d = new Date(Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8) + 5)); return `${String(d.getUTCFullYear()).slice(2)}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}(금)`; }
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
    const G = groupOf(R.code);
    const nowB = D.bars[D.bars.length - 1], prevB = D.bars[D.bars.length - 2];
    const chg = prevB ? (nowB.c / prevB.c - 1) * 100 : 0;
    const KIND = { buy: '산다', hold: '들고 간다', sell: '판다', out: '현금', nobuy: '새로 안 산다', wait: '기다린다' };
    const title = clean(comb.title);
    const ongoing = [D.partial && '오늘 장중', W.partial && '이번 주 진행 중', M.partial && '이번 달 진행 중'].filter(Boolean).join(' · ');
    const html = `
      <section class="card sum">
        <div class="who"><span class="nm">${R.name}</span><span class="cd">${R.code}</span>${G ? `<span class="chip ${G.tone === 'y' ? 'y' : ''}" style="margin:0">${G.market === 'KOSPI' ? '코스피' : '코스닥'} 시총 ${G.rank}위</span>` : ''}</div>
        <div class="px num">${E.fmt(nowB.c)}<span class="chg ${chg >= 0 ? 'pos' : 'neg'}">${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg).toFixed(2)}%</span></div>
        <div class="note" style="margin-top:2px">${dateK(nowB.t)} ${D.partial ? '장중' : '종가'}</div>
        <div class="verdict-box ${comb.code}">
          <div class="k">${KIND[comb.code] || '판정'}</div>
          <div class="big">${title}</div>
          <p>${clean(comb.detail)}</p>
          ${combLive && combLive.title !== comb.title ? `<div class="ifclose">지금 봉들이 이대로 끝나면 <b>${clean(combLive.title)}</b> — ${clean(combLive.detail)}</div>` : ''}
        </div>
        <dl class="metarow">
          <dt>이 종목 월봉</dt><dd>${clean(comb.gate.label)}</dd>
          ${kg ? `<dt>코스피 월봉</dt><dd>${kg.label}${kgLive && kgLive.code !== kg.code ? ` <span class="note">· 이번 달은 ${kgLive.label}</span>` : ''}</dd>` : ''}
          ${G ? `<dt>종목군</dt><dd>${G.label.replace(/\s*\(.*\)/, '')} — ${G.note.replace(/^⚠\s*/, '')}</dd>` : ''}
        </dl>
        <p class="note">판정은 끝난 봉 종가 기준(일봉 15:30 · 주봉 금요일 · 월봉 월말).${ongoing ? ' 지금 ' + ongoing + '.' : ''}</p>
      </section>
      <div class="sticky-seg"><div class="seg" id="tf-seg">
        <button class="on" data-k="m">월봉<small>시황</small></button>
        <button data-k="w">주봉<small>종목 상태</small></button>
        <button data-k="d">일봉<small>타이밍</small></button>
      </div></div>
      <div data-panel="m">${panel('월봉', 'm', M, 'month')}</div>
      <div data-panel="w" hidden>${panel('주봉', 'w', W, 'week')}</div>
      <div data-panel="d" hidden>${panel('일봉', 'd', D, 'day')}</div>
      ${G ? groupCard(G) : ''}
      <p class="note" style="padding:0 4px">꼬리 포함 · 연속 같은 색은 한 봉으로 · 데이터 네이버 금융. 거래정지·액면분할 종목은 구간이 왜곡될 수 있다. 코스피 지수는 '코스피'라고 치면 된다.</p>`;
    out.innerHTML = html;
    const drawn = {};
    const show = (k) => {
      out.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== k; });
      out.querySelectorAll('#tf-seg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
      if (!drawn[k]) { drawn[k] = 1; const J = { m: M, w: W, d: D }[k]; drawChart('chart-' + k, J.bars, J.live, { m: 72, w: 120, d: 120 }[k], k !== 'd'); }
    };
    out.querySelector('#tf-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.k); });
    show('m');
  }

  function groupCard(G) {
    return `
      <section class="card">
        <h3>${G.label} 10년 실측</h3>
        <p style="margin-top:0">${G.note.replace(/^⚠\s*/, '')}</p>
        <table class="map"><tr><th>축</th><th>같은 종목군 성적</th></tr>
          <tr><td>월봉</td><td>${G.month}</td></tr><tr><td>주봉</td><td>${G.week}</td></tr><tr><td>일봉</td><td>${G.day}</td></tr></table>
        <p class="note">양봉이 음봉 이긴 종가에 사서 음봉이 양봉 깬 뒤 양봉에 판 결과, 수수료 없음, 지금 살아있는 종목만이라 실제보다 좋게 나온다. 순위 기준일 ${G.asof}.</p>
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

  function evText(e) {
    if (e.type === 'up') return ['up', '양봉이 이김', `양봉 종가 ${E.fmt(e.price)}가 앞 음봉 고가 ${E.fmt(e.level)}를 넘음 → 상승 시작`];
    if (e.type === 'down') return ['down', '음봉이 깸', `음봉 종가 ${E.fmt(e.price)}가 앞 양봉 저가 ${E.fmt(e.level)}를 깸 → 하락 시작`];
    if (e.type === 'accel') return ['ac', '또 음봉', `양봉이 ${E.fmt(e.level)}를 못 넘고 또 음봉`];
    return ['dt', '고가 낮아짐', `음봉 고가가 ${E.fmt(e.level)}를 못 넘고 낮아짐(쌍봉)`];
  }

  function panel(title, key, J, tf) {
    const S = J.fixed, L = J.live, A = J.act, last = S.lastBar;
    const w = words(tf, L.lastBar.t);
    const f = stateLine(A, w), l = stateLine(L, w);
    if (A.pending) { f.action = L.state === 'up' ? `${w.this} 양봉이 앞 음봉 고가 ${E.fmt(S.breakLine)}를 넘는 중 — ${w.closeAt} 보고 결정` : `${w.this} 음봉이 앞 양봉 저가 ${E.fmt(L.holdLine)}를 깨는 중 — ${w.closeAt} 보고 결정`; f.chip = 'y'; }
    f.action = clean(f.action);
    const dirTxt = (A.lastDir === 'bull' ? '양봉' : '음봉') + ` ${A.curBlock.n}${w.bar === '날' ? '일' : w.bar === '주' ? '주' : '달'}째` + (J.partial ? ' · 진행 중' : '');
    const evs = S.events.filter(e => ['up', 'down', 'doubleTop', 'accel'].includes(e.type)).slice(-8).reverse();
    const perf = E.performance(J.bars, L, 8, 'turn', 0.25), perfB = E.performance(J.bars, L, 8, 'bear', 0.25);
    const nowBear = J.partial && S.lastDir === 'bull' && L.lastDir === 'bear' && S.holdLineNext != null;
    const hl = nowBear ? S.holdLineNext : S.holdLine;
    const cur = L.lastBar.c;
    const kv = S.state === 'up'
      ? `<div class="box"><div class="k">깨면 판다 · 앞 양봉 저가</div><div class="v">${E.fmt(hl)}</div><div class="s">${hl != null ? `지금보다 ${pct((hl / cur - 1) * 100)}` : ''}${!nowBear && S.holdLineNext != null && S.holdLineNext !== S.holdLine ? ` · 이 양봉 끝나면 ${E.fmt(S.holdLineNext)}로 올라감` : ''}</div></div>`
      : `<div class="box"><div class="k">넘으면 산다 · 앞 음봉 고가</div><div class="v">${E.fmt(S.breakLine)}</div><div class="s">${S.breakLine != null ? `지금보다 ${pct((S.breakLine / cur - 1) * 100)}` : ''}</div></div>`;
    const liveBlock = J.partial ? `
        <div class="live">
          <div class="k">${w.this} 봉 진행 중 · ${L.lastDir === 'bull' ? '양봉' : '음봉'} ${E.fmt(cur)}</div>
          <div class="t">${w.closeAt}가 이대로면 <b>${l.stTxt}</b> · ${clean(l.action)}${L.state === 'up' && L.holdLine != null ? ` · 깨면 파는 선 ${E.fmt(L.holdLine)}` : ''}${L.state === 'down' && L.breakLine != null ? ` · 넘으면 사는 선 ${E.fmt(L.breakLine)}` : ''}</div>
        </div>` : '';
    const perfRows = perf.trades.map(t => `<tr><td>${dateK(t.et)}</td><td>${dateK(t.xt)}${t.openTrade ? '<small> ' + t.note + '</small>' : ''}</td><td class="${t.pct >= 0 ? 'pos' : 'neg'}">${pct(t.pct)}</td><td>${t.bars}${w.bar === '날' ? '일' : w.bar}</td></tr>`).join('');
    const nowIs = A.pending && L.state === 'up' ? 'turn' : (A.state === 'up' && L.lastDir === 'bear' ? 'bear' : '');
    const t10 = (() => { const k = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, ''); return String(+k.slice(0, 4) - 10) + k.slice(4); })();
    const pfTxt = x => x.pf >= 99 ? '손해 없음' : x.pf.toFixed(1);
    const cell = (p, lab, k) => {
      if (!p.stats) return `<div class="pcell"><div class="lab">${lab}</div><div class="pf">-</div><div class="sub">끝난 매매 없음</div></div>`;
      const r10 = E.statsOf(p.allTrades, t10);
      return `<div class="pcell ${nowIs === k ? 'now' : ''}"><div class="lab">${lab}${nowIs === k ? ' <em>· 지금 자리</em>' : ''}</div>
        <div class="pf ${p.stats.pf >= 1 ? '' : 'neg'}">${pfTxt(p.stats)}<small>손익비</small></div>
        <div class="sub">${p.stats.n}번 · 승률 ${p.stats.win.toFixed(0)}% · 평균 <span class="${p.stats.avg >= 0 ? 'pos' : 'neg'}">${pct(p.stats.avg)}</span>${r10 && r10.n !== p.stats.n ? `<br>최근 10년 ${r10.n}번 · 손익비 ${pfTxt(r10)}` : ''}</div></div>`;
    };
    const few = (perf.stats && perf.stats.n < 5) || (perfB.stats && perfB.stats.n < 5);
    return `
      <section class="card">
        <div class="state"><span class="dot ${S.state}"></span><b>${title} ${f.stTxt}</b><span class="chip" style="margin:0 0 0 auto">${dirTxt}</span></div>
        <div class="action ${f.chip}">${f.action}</div>
        <div class="kv">
          <div class="box"><div class="k">끝난 봉 종가 · ${tf === 'week' ? friK(last.t) : tf === 'month' ? `${last.t.slice(2, 4)}년 ${+last.t.slice(4, 6)}월` : dateK(last.t)}</div><div class="v">${E.fmt(last.c)}</div><div class="s">${S.lastDir === 'bull' ? '양봉' : '음봉'} · 저 ${E.fmt(last.l)} / 고 ${E.fmt(last.h)}</div></div>
          ${kv}
        </div>
        ${liveBlock}
        <div id="chart-${key}" class="chart"></div>
        <details class="fold"><summary>지난 신호<small>${evs.length}개</small></summary>
          <ul class="ev">${evs.map(e => { const [c, tg, tx] = evText(e); return `<li><span class="d">${dateK(e.t)}</span><span class="tag ${c}">${tg}</span><span>${tx}</span></li>`; }).join('') || '<li><span class="d">-</span>신호 없음</li>'}</ul>
        </details>
        <details class="fold" ${nowIs ? 'open' : ''}><summary>이 종목에서 과거에 이렇게 했으면</summary>
          <div class="pgrid">${cell(perf, `넘은 ${w.bar === '날' ? '날' : w.bar} 종가에 샀으면`, 'turn')}${cell(perfB, '음봉마다 샀으면', 'bear')}</div>
          <p class="note" style="margin-top:0">파는 건 둘 다 음봉이 양봉 깬 뒤 첫 양봉 종가. 수수료·세금 0.25% 뺌.${few ? ' 5번 안 되는 건 우연이 많이 섞인다.' : ''}</p>
          <table class="perf"><tr><th>샀을 때</th><th>팔았을 때</th><th>수익</th><th>기간</th></tr>${perfRows || '<tr><td colspan="4">-</td></tr>'}</table>
          <p class="note">표는 넘은 ${w.bar === '날' ? '날' : w.bar} 종가 매수 기준 최근 8번.</p>
        </details>
      </section>`;
  }

  function drawChart(id, bars, S, N, logScale) {
    const el = document.getElementById(id); if (!el || !window.LightweightCharts) return;
    const data = bars.slice(-N).map(b => ({ time: `${b.t.slice(0, 4)}-${b.t.slice(4, 6)}-${b.t.slice(6, 8)}`, open: b.o, high: b.h, low: b.l, close: b.c }));
    const chart = LightweightCharts.createChart(el, {
      layout: { background: { color: '#fff' }, textColor: '#8B95A1', fontSize: 11, fontFamily: 'Pretendard Variable, Pretendard, sans-serif' },
      localization: { locale: 'ko-KR', dateFormat: 'yy.MM.dd' },
      grid: { vertLines: { visible: false }, horzLines: { color: '#F2F4F6' } },
      rightPriceScale: { borderVisible: false, mode: logScale ? 1 : 0, scaleMargins: { top: .08, bottom: .08 } },
      timeScale: { borderVisible: false, timeVisible: false },
      crosshair: { mode: 0 }, handleScroll: true, handleScale: true, autoSize: true,
    });
    const s = chart.addCandlestickSeries({ upColor: '#F04452', downColor: '#3182F6', borderUpColor: '#F04452', borderDownColor: '#3182F6', wickUpColor: '#F04452', wickDownColor: '#3182F6', priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    s.setData(data);
    const firstT = data[0].time.replace(/-/g, '');
    s.setMarkers(S.events.filter(e => e.t >= firstT && (e.type === 'up' || e.type === 'down')).map(e => ({
      time: `${e.t.slice(0, 4)}-${e.t.slice(4, 6)}-${e.t.slice(6, 8)}`,
      position: e.type === 'down' ? 'aboveBar' : 'belowBar',
      color: e.type === 'up' ? '#F04452' : '#3182F6', shape: e.type === 'up' ? 'arrowUp' : 'arrowDown', text: ''
    })));
    if (S.state === 'up' && S.holdLine != null) s.createPriceLine({ price: S.holdLine, color: '#FF6F0F', lineWidth: 1, lineStyle: 2, title: '깨면 판다' });
    if (S.state === 'down' && S.breakLine != null) s.createPriceLine({ price: S.breakLine, color: '#3182F6', lineWidth: 1, lineStyle: 2, title: '넘으면 산다' });
    chart.timeScale().fitContent();
    charts.push(chart);
  }

  // URL ?code= 지원
  const p = new URLSearchParams(location.search);
  if (p.get('code')) { document.querySelector('[data-tab="verify"]').click(); q.value = p.get('name') || p.get('code'); run(p.get('code'), p.get('name')); }
})();
