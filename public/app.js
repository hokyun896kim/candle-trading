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
    return { partial, live, fixed, bars };
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
  function pct(n) { return (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }

  function render(out, R) {
    const { D, W, M, K } = R;
    // 종합 판정은 확정 봉 기준, 진행 중 봉 기준은 참고로
    const comb = E.combine(D.fixed, W.fixed, M.fixed);
    const combLive = (D.partial || W.partial || M.partial) ? E.combine(D.live, W.live, M.live) : null;
    const kg = K ? E.monthlyGate(K.fixed) : null;
    const kgLive = K ? E.monthlyGate(K.live) : null;
    let html = `
      <section class="card verdict ${comb.code}">
        <div class="name">${R.name} · ${R.code}</div>
        <div class="big">${comb.title}</div>
        <p>${comb.detail}</p>
        <div style="margin-top:8px">
          <span class="chip" style="background:rgba(255,255,255,.22);color:#fff">종목 월봉: ${comb.gate.label}</span>
          ${kg ? `<span class="chip" style="background:rgba(255,255,255,.22);color:#fff">코스피 월봉: ${kg.label}${kgLive && kgLive.code !== kg.code ? ' → 이번 달 진행: ' + kgLive.label : ''}</span>` : ''}
        </div>
        ${combLive && (combLive.title !== comb.title) ? `<p style="font-size:12.5px;margin-top:10px;padding:8px 10px;background:rgba(255,255,255,.18);border-radius:10px">⏳ 진행 중 봉 그대로 끝나면: <b>${combLive.title}</b> — ${combLive.detail}</p>` : ''}
        <p style="font-size:11.5px;opacity:.85;margin-top:8px">확정 봉 기준(일봉 15:30·주봉 금요일·월봉 월말 종가). ${D.partial ? '일봉 장중' : ''}${D.partial && (W.partial || M.partial) ? ' · ' : ''}${W.partial ? '이번 주봉 진행 중' : ''}${(D.partial || W.partial) && M.partial ? ' · ' : ''}${M.partial ? '이번 월봉 진행 중' : ''}</p>
      </section>
      ${panel('월봉 · 시황 게이트', 'm', M)}
      ${panel('주봉 · 상태', 'w', W)}
      ${panel('일봉 · 타이밍', 'd', D)}
      <p class="note">판정은 전부 종가 기준·꼬리 포함·합봉 적용. 데이터: 네이버 금융. 거래정지·액면분할 종목은 구간이 왜곡될 수 있으니 차트로 한 번 더 확인. 코스피 지수 자체를 보려면 '코스피'라고 쳐라.</p>`;
    out.innerHTML = html;
    drawChart('chart-m', M.bars, M.live, 60);
    drawChart('chart-w', W.bars, W.live, 120);
    drawChart('chart-d', D.bars, D.live, 130);
  }

  function stateLine(S) {
    const st = S.state;
    const stTxt = st === 'up' ? '상승 (게이트 열림)' : st === 'down' ? '하락 (게이트 닫힘)' : '판정 대기';
    let action, chip;
    if (st === 'up') {
      if (S.lastDir === 'bear') {
        if (S.doubleTop) { action = '쌍봉 경고 — 추가매수 중단, 보유선만 본다'; chip = 'y'; }
        else if (S.buyOK) { action = S.firstBear ? '첫 음봉 — 매수 자리' : '눌림 음봉 — 매수 자리'; chip = 'r'; }
        else { action = '보유선 이탈'; chip = 'y'; }
      } else { action = '양봉 진행 — 보유, 다음 음봉에 매수'; chip = 'g'; }
    } else if (st === 'down') {
      if (S.lastDir === 'bull') { action = '양봉 반등 — 매도 자리'; chip = 'b'; }
      else { action = S.accel ? '⚠ 하락 가속 — 더 큰 음봉 경계' : '하락 중 — 양봉 기다려 매도'; chip = S.accel ? 'y' : 'b'; }
    } else { action = '전환 신호 없음'; chip = ''; }
    return { stTxt, action, chip };
  }

  function panel(title, key, J) {
    const S = J.fixed, L = J.live, last = S.lastBar;
    const f = stateLine(S), l = stateLine(L);
    const dirTxt = (S.lastDir === 'bull' ? '양봉' : '음봉') + ` ${S.curBlock.n}개째`;
    const evs = S.events.filter(e => ['up', 'down', 'doubleTop', 'accel'].includes(e.type)).slice(-6).reverse();
    const perf = E.performance(J.bars, L, 8);
    const kv = S.state === 'up'
      ? `<div class="box"><div class="k">보유선 (직전 양봉블록 저점)</div><div class="v" style="color:var(--orange-deep)">${E.fmt(S.holdLine)}</div><div class="s">${S.holdLineNext != null && S.holdLineNext !== S.holdLine ? '다음 음봉부터 ' + E.fmt(S.holdLineNext) : (S.holdLine != null ? '여유 ' + pct((last.c / S.holdLine - 1) * 100) : '')}</div></div>`
      : `<div class="box"><div class="k">전환선 (직전 음봉블록 고점)</div><div class="v" style="color:var(--blue)">${E.fmt(S.breakLine)}</div><div class="s">${S.breakLine != null ? '양봉 종가가 넘어야 ' + pct((S.breakLine / last.c - 1) * 100) : ''}</div></div>`;
    const liveBar = L.lastBar;
    const liveBlock = J.partial ? `
        <div class="live">
          <div class="k">⏳ 진행 중 봉 (${dateK(liveBar.t)} · ${L.lastDir === 'bull' ? '양봉' : '음봉'} · 종가 ${E.fmt(liveBar.c)})</div>
          <div class="t">이대로 끝나면 → <b>${l.stTxt}</b> · ${l.action}${L.state === 'up' && L.holdLine != null ? ` · 보유선 ${E.fmt(L.holdLine)}` : ''}${L.state === 'down' && L.breakLine != null ? ` · 전환선 ${E.fmt(L.breakLine)}` : ''}</div>
        </div>` : '';
    const perfRows = perf.trades.map(t => `<tr><td>${dateK(t.et)}</td><td>${dateK(t.xt)}${t.openTrade ? '<small> ' + t.note + '</small>' : ''}</td><td class="${t.pct >= 0 ? 'pos' : 'neg'}">${pct(t.pct)}</td><td>${t.bars}봉</td></tr>`).join('');
    const perfStat = perf.stats ? `<div class="pstat"><span>신호 ${perf.total}회</span><span>승률 <b>${perf.stats.win.toFixed(0)}%</b></span><span>평균 <b class="${perf.stats.avg >= 0 ? 'pos' : 'neg'}">${pct(perf.stats.avg)}</b></span><span>중앙 <b class="${perf.stats.med >= 0 ? 'pos' : 'neg'}">${pct(perf.stats.med)}</b></span><span>평균 ${perf.stats.avgBars.toFixed(0)}봉</span></div>` : '<div class="pstat"><span>완료된 거래 없음</span></div>';
    return `
      <section class="card">
        <h2>${title}</h2>
        <div class="state"><span class="dot ${S.state}"></span><b>${f.stTxt}</b><span class="chip">${dirTxt}</span></div>
        <span class="chip ${f.chip}">${f.action}</span>
        <div class="kv">
          <div class="box"><div class="k">확정 종가 (${dateK(last.t)})</div><div class="v">${E.fmt(last.c)}</div><div class="s">${S.lastDir === 'bull' ? '양봉' : '음봉'} · 저 ${E.fmt(last.l)} / 고 ${E.fmt(last.h)}</div></div>
          ${kv}
        </div>
        ${liveBlock}
        <div id="chart-${key}" class="chart"></div>
        <ul class="ev">${evs.map(e => `<li><span class="d">${dateK(e.t)}</span><span class="tag ${e.type === 'up' ? 'up' : e.type === 'down' ? 'down' : e.type === 'accel' ? 'ac' : 'dt'}">${e.type === 'up' ? '상승 전환' : e.type === 'down' ? '하락 전환' : e.type === 'accel' ? '하락 가속' : '쌍봉 경고'}</span><span>${e.type === 'up' ? '양봉 종가 ' + E.fmt(e.price) + ' > 음봉 고점 ' + E.fmt(e.level) : e.type === 'down' ? '음봉 종가 ' + E.fmt(e.price) + ' < 양봉 저점 ' + E.fmt(e.level) : e.type === 'accel' ? '양봉이 ' + E.fmt(e.level) + ' 못 넘고 다시 밀림' : '음봉 고점이 ' + E.fmt(e.level) + ' 못 넘고 낮아짐'}</span></li>`).join('') || '<li><span class="d">-</span>신호 없음</li>'}</ul>
        <h3 style="margin-top:14px">과거 신호 성과 <span class="note" style="display:inline">상승전환 종가 매수 → 하락전환 뒤 첫 양봉 종가 매도</span></h3>
        ${perfStat}
        <table class="perf"><tr><th>매수</th><th>매도</th><th>수익</th><th>보유</th></tr>${perfRows || '<tr><td colspan="4">-</td></tr>'}</table>
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
    if (S.state === 'up' && S.holdLine != null) s.createPriceLine({ price: S.holdLine, color: '#FF6F0F', lineWidth: 1.5, lineStyle: 2, title: '보유선' });
    if (S.state === 'up' && S.holdLineNext != null && S.holdLineNext !== S.holdLine) s.createPriceLine({ price: S.holdLineNext, color: '#FFB27A', lineWidth: 1, lineStyle: 3, title: '다음' });
    if (S.state === 'down' && S.breakLine != null) s.createPriceLine({ price: S.breakLine, color: '#3182F6', lineWidth: 1.5, lineStyle: 2, title: '전환선' });
    chart.timeScale().fitContent();
    charts.push(chart);
    
  }

  // URL ?code= 지원
  const p = new URLSearchParams(location.search);
  if (p.get('code')) { document.querySelector('[data-tab="verify"]').click(); q.value = p.get('code'); run(p.get('code'), p.get('name') || p.get('code')); }
})();
