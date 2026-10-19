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
    if (/^\d{6}$/.test(v)) { sugg.style.display = 'none'; return; }
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
    // week: localDate = 주 시작(일요일). 그 주 금요일 15:40 KST 전이면 진행 중
    const y = +lastT.slice(0, 4), m = +lastT.slice(4, 6) - 1, d = +lastT.slice(6, 8);
    const fri = new Date(Date.UTC(y, m, d + 5, 15, 40)); // 일요일+5 = 금요일
    return k.getTime() < fri.getTime();
  }

  // ---- 실행 ----
  let charts = [];
  async function run(code, name) {
    const out = $('#result');
    out.innerHTML = '<div class="card loading">일봉·주봉 불러오는 중…</div>';
    charts.forEach(c => { try { c.remove(); } catch {} }); charts = [];
    try {
      const [dR, wR] = await Promise.all([fetch(`/api/ohlc?code=${code}&tf=day`), fetch(`/api/ohlc?code=${code}&tf=week`)]);
      const dJ = await dR.json(), wJ = await wR.json();
      if (dJ.error || wJ.error) throw new Error(dJ.error || wJ.error);
      if (!dJ.bars.length || !wJ.bars.length) throw new Error('데이터가 없습니다. 종목코드를 확인하세요.');
      const daily = E.analyze(dJ.bars), weekly = E.analyze(wJ.bars);
      const comb = E.combine(daily, weekly);
      pushRecent(code, name);
      render(out, { code, name, daily, weekly, comb, dBars: dJ.bars, wBars: wJ.bars });
    } catch (e) {
      out.innerHTML = `<div class="card"><div class="err">불러오기 실패: ${e.message}</div><p class="note">로컬에서 열었으면 /api 가 없어서 실패한다. 넷리파이에 올리거나 <code>netlify dev</code>로 실행하면 된다.</p></div>`;
    }
  }

  function dateK(t) { return `${t.slice(2, 4)}.${t.slice(4, 6)}.${t.slice(6, 8)}`; }

  function render(out, R) {
    const { daily, weekly, comb } = R;
    const dPart = isPartial('day', daily.lastBar.t), wPart = isPartial('week', weekly.lastBar.t);
    let html = `
      <section class="card verdict ${comb.code}">
        <div class="name">${R.name} · ${R.code}</div>
        <div class="big">${comb.title}</div>
        <p>${comb.detail}</p>
        ${(dPart || wPart) ? `<p style="font-size:12px;opacity:.9">⏳ ${dPart ? '일봉 장중 진행 중 (15:30 종가로 확정)' : ''}${dPart && wPart ? ' · ' : ''}${wPart ? '이번 주봉 진행 중 (금요일 종가로 확정)' : ''}</p>` : ''}
      </section>
      ${panel('주봉 · 상태', 'w', weekly, wPart)}
      ${panel('일봉 · 타이밍', 'd', daily, dPart)}
      <p class="note">판정은 전부 종가 기준·꼬리 포함·합봉 적용. 데이터: 네이버 금융. 거래정지·액면분할 종목은 구간이 왜곡될 수 있으니 차트로 한 번 더 확인.</p>`;
    out.innerHTML = html;
    drawChart('chart-w', R.wBars, weekly);
    drawChart('chart-d', R.dBars, daily);
  }

  function panel(title, key, S, partial) {
    const st = S.state, last = S.lastBar;
    const stTxt = st === 'up' ? '상승 (게이트 열림)' : st === 'down' ? '하락 (게이트 닫힘)' : '판정 대기';
    const dirTxt = S.lastDir === 'bull' ? `양봉 ${S.curBlock.n}개째` : `음봉 ${S.curBlock.n}개째`;
    let action, actionChip;
    if (st === 'up') {
      if (S.lastDir === 'bear') {
        if (S.doubleTop) { action = '쌍봉 경고 — 추가매수 중단, 보유선 지키는지만 본다'; actionChip = 'y'; }
        else if (S.buyOK) { action = S.firstBear ? '첫 음봉 — 매수 자리' : '눌림 음봉 — 매수 자리 (종가 낮아지면 더)'; actionChip = 'r'; }
        else { action = '보유선 이탈 임박'; actionChip = 'y'; }
      } else { action = '양봉 진행 중 — 보유. 다음 음봉에 매수'; actionChip = 'g'; }
    } else if (st === 'down') {
      action = S.lastDir === 'bull' ? '양봉 반등 — 매도 자리' : '하락 중 — 양봉 기다려 매도';
      actionChip = 'b';
    } else { action = '전환 신호 없음'; actionChip = ''; }
    const evs = S.events.filter(e => e.type === 'up' || e.type === 'down' || e.type === 'doubleTop').slice(-6).reverse();
    return `
      <section class="card">
        <h2>${title}</h2>
        <div class="state"><span class="dot ${st}"></span><b>${stTxt}</b><span class="chip">${dirTxt}</span>${partial ? '<span class="chip y">진행 중</span>' : ''}</div>
        <span class="chip ${actionChip}">${action}</span>
        <div class="kv">
          <div class="box"><div class="k">종가 (${dateK(last.t)})</div><div class="v">${E.fmt(last.c)}</div><div class="s">${S.lastDir === 'bull' ? '양봉' : '음봉'} · 저 ${E.fmt(last.l)} / 고 ${E.fmt(last.h)}</div></div>
          ${st === 'up'
            ? `<div class="box"><div class="k">보유선 (직전 양봉블록 저점)</div><div class="v" style="color:var(--orange-deep)">${E.fmt(S.holdLine)}</div><div class="s">${S.holdLineNext != null ? '다음 음봉부터 ' + E.fmt(S.holdLineNext) : (S.holdLine != null ? '여유 ' + ((last.c / S.holdLine - 1) * 100).toFixed(1) + '%' : '')}</div></div>`
            : `<div class="box"><div class="k">전환선 (직전 음봉블록 고점)</div><div class="v" style="color:var(--blue)">${E.fmt(S.breakLine)}</div><div class="s">${S.breakLine != null ? '양봉 종가가 넘어야 ' + ((S.breakLine / last.c - 1) * 100).toFixed(1) + '%' : ''}</div></div>`}
        </div>
        <div id="chart-${key}" class="chart"></div>
        <ul class="ev">${evs.map(e => `<li><span class="d">${dateK(e.t)}</span><span class="tag ${e.type === 'up' ? 'up' : e.type === 'down' ? 'down' : 'dt'}">${e.type === 'up' ? '상승 전환' : e.type === 'down' ? '하락 전환' : '쌍봉 경고'}</span><span>${e.type === 'up' ? '양봉 종가 ' + E.fmt(e.price) + ' > 음봉 고점 ' + E.fmt(e.level) : e.type === 'down' ? '음봉 종가 ' + E.fmt(e.price) + ' < 양봉 저점 ' + E.fmt(e.level) : '음봉 고점이 ' + E.fmt(e.level) + ' 못 넘고 낮아짐'}</span></li>`).join('') || '<li><span class="d">-</span>신호 없음</li>'}</ul>
      </section>`;
  }

  function drawChart(id, bars, S) {
    const el = document.getElementById(id); if (!el || !window.LightweightCharts) return;
    const N = id.endsWith('w') ? 120 : 130;
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
