/* 지수·코인 탭 — markets.json + markets_log.json */
(function () {
  const $ = s => document.querySelector(s);
  let DATA = null, LOG = {}, sel = {};
  const charts = [];
  const fmtN = (v, unit) => {
    if (unit !== 'krw') return Math.round(v).toLocaleString('ko-KR');
    if (v >= 1e8) { const e = Math.floor(v / 1e8), m = Math.round((v - e * 1e8) / 1e4); return `${e}억${m ? ' ' + m.toLocaleString('ko-KR') + '만' : ''}`; }
    if (v >= 1e4) { const m = Math.floor(v / 1e4), r = Math.round(v - m * 1e4); return `${m.toLocaleString('ko-KR')}만${r ? ' ' + r.toLocaleString('ko-KR') : ''}`; }
    return Math.round(v).toLocaleString('ko-KR');
  };
  const ym = t => `${t.slice(2, 4)}.${t.slice(4, 6)}`;
  const TF = { month: '월봉', week: '주봉' };

  const clean = (t) => String(t || '').replace(/[⏳⚠🔥🎯⛔⭐👍]️?\s?/g, '');
  function render() {
    if (!DATA) return;
    charts.forEach(c => { try { c.remove(); } catch {} }); charts.length = 0;
    $('#mk-meta').textContent = `기준 ${DATA.asof} · 매일 아침 7시 반, 평일 장 마감 뒤 자동 갱신`;
    $('#mk-list').innerHTML = DATA.assets.map(a => {
      const tf = sel[a.key] || a.best; const j = a.tf[tf]; const b = j.bt;
      const tabs = Object.keys(a.tf).map(k => `<button data-a="${a.key}" data-tf="${k}" class="${k === tf ? 'on' : ''}">${TF[k]}${k === a.best ? '<small>잘 먹힌 쪽</small>' : '<small>&nbsp;</small>'}</button>`).join('');
      const pk = j.probKind === 'sell', col = pk ? 'var(--blue)' : 'var(--orange)';
      const pbar = j.prob == null ? '' : `
        <div class="prob">
          <div class="row"><b>${pk ? '판다 신호' : '산다 신호'} 나올 확률</b><span class="v" style="color:${pk ? '#1B64DA' : 'var(--orange-deep)'}">${j.prob}%</span></div>
          <div class="bar"><i style="width:${j.prob}%;background:${col}"></i></div>
          <div class="sub">${j.probLabel}. 돈 벌 확률이 아니라 그 날 신호가 나올지만 센 거다.</div>
        </div>`;
      const holding = b.open ? (b.open.waitSell
        ? `<b>들고 있으면</b> ${ym(b.open.t)}에 산 게 음봉이 양봉을 깨서 끝났다(지금 <span class="${b.open.pct >= 0 ? 'pos' : 'neg'}">${b.open.pct >= 0 ? '+' : ''}${b.open.pct}%</span>). ${j.dir === 'bull' ? `<b>지금 ${tf === 'month' ? '이번 달' : '이번 주'} 양봉이 그 반등이다 — 여기서 판다.</b>` : '다음 양봉 반등에 판다.'}`
        : `<b>들고 있는 매매</b> ${ym(b.open.t)}에 ${fmtN(b.open.p, a.unit)}에 샀다 → 지금 <b class="${b.open.pct >= 0 ? 'pos' : 'neg'}">${b.open.pct >= 0 ? '+' : ''}${b.open.pct}%</b>`)
        : (b.lastClosed ? `<b>들고 있는 매매 없음</b> · 마지막은 ${ym(b.lastClosed.et)} → ${ym(b.lastClosed.xt)} <span class="${b.lastClosed.pct >= 0 ? 'pos' : 'neg'}">${b.lastClosed.pct >= 0 ? '+' : ''}${b.lastClosed.pct}%</span>` : '');
      const log = (LOG[`${a.key}_${tf}`] || []).slice(-7).reverse();
      const logHtml = log.length ? `<ul class="ev">${log.map(e => `<li><span class="d">${e.d.slice(5).replace('-', '.')}</span><span style="flex:1">${clean(e.s)} · ${fmtN(e.p, a.unit)}${e.prob != null ? ` · 신호 확률 ${e.prob}%` : ''}</span></li>`).join('')}</ul>` : '<p class="note">기록이 내일부터 쌓인다.</p>';
      const tone = j.tone === 'o' ? 'o' : j.tone;
      return `
      <section class="card">
        <div class="mk-head"><h2 style="margin:0">${a.name}</h2><span class="px">${fmtN(a.price, a.unit)}${a.unit === 'krw' ? '<small style="font-size:15px;font-weight:500"> 원</small>' : ''}</span></div>
        <div class="seg">${tabs}</div>
        <span class="chip dot ${tone}">${clean(j.status)}</span>
        <p style="margin-top:10px;color:var(--text)">${j.text}</p>
        ${pbar}
        <div id="mk-chart-${a.key}" class="chart" style="height:240px"></div>
        <div class="live" style="background:var(--bg3)"><div class="t">${holding}</div></div>
        <details class="fold"><summary>이 방식 과거 성적<small>${TF[tf]} · ${b.years}년</small></summary>
          <div class="pgrid">
            <div class="pcell now"><div class="lab">캔들매매</div><div class="pf">연 ${b.cagr}%</div><div class="sub">최대 낙폭 ${b.mdd}% · ${b.n}번 · 승률 ${b.win}%</div></div>
            <div class="pcell"><div class="lab">그냥 들고 있기</div><div class="pf">연 ${b.holdCagr}%</div><div class="sub">최대 낙폭 ${b.holdMdd}%</div></div>
          </div>
          <p class="note" style="margin-top:0">양봉 종가가 앞 음봉 고가를 넘은 ${tf === 'month' ? '달' : '주'} 종가에 사서, 음봉 종가가 앞 양봉 저가를 깬 뒤 첫 양봉 종가에 판 결과. ${a.note}</p>
        </details>
        <details class="fold"><summary>모니터링 기록<small>최근 ${log.length}일</small></summary>${logHtml}</details>
      </section>`;
    }).join('');
    DATA.assets.forEach(a => draw(a, a.tf[sel[a.key] || a.best]));
  }

  function draw(a, j) {
    const el = document.getElementById('mk-chart-' + a.key); if (!el || !window.LightweightCharts) return;
    const chart = LightweightCharts.createChart(el, {
      layout: { background: { color: '#fff' }, textColor: '#8B95A1', fontSize: 11, fontFamily: 'Pretendard Variable, Pretendard, sans-serif' }, localization: { locale: 'ko-KR', dateFormat: 'yy.MM', priceFormatter: a.unit === 'krw' ? (v => fmtN(v, 'krw')) : (v => Math.round(v).toLocaleString('ko-KR')) },
      grid: { vertLines: { visible: false }, horzLines: { color: '#F2F4F6' } }, rightPriceScale: { borderVisible: false, mode: 1 },
      timeScale: { borderVisible: false }, crosshair: { mode: 0 }, autoSize: true,
    });
    const s = chart.addCandlestickSeries({ upColor: '#F04452', downColor: '#3182F6', borderUpColor: '#F04452', borderDownColor: '#3182F6', wickUpColor: '#F04452', wickDownColor: '#3182F6', priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    const iso = t => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    s.setData(j.bars.map(b => ({ time: iso(b[0]), open: b[1], high: b[2], low: b[3], close: b[4] })));
    const first = j.bars[0][0];
    s.setMarkers(j.events.filter(e => e.t >= first && (e.type === 'up' || e.type === 'down')).map(e => ({ time: iso(e.t), position: e.type === 'up' ? 'belowBar' : 'aboveBar', color: e.type === 'up' ? '#F04452' : '#3182F6', shape: e.type === 'up' ? 'arrowUp' : 'arrowDown', text: '' })));
    if (j.hold != null && (j.state === 'up' || j.liveState === 'up')) s.createPriceLine({ price: j.hold, color: '#FF6F0F', lineWidth: 1, lineStyle: 2, title: '깨면 판다' });
    if (j.brk != null && (j.state === 'down' || j.liveState === 'down' || /양봉이 음봉 이기는/.test(j.status))) s.createPriceLine({ price: j.brk, color: '#3182F6', lineWidth: 1, lineStyle: 2, title: '넘으면 산다' });
    chart.timeScale().fitContent(); charts.push(chart);
  }

  document.addEventListener('click', e => { const b = e.target.closest('#mk-list .seg button'); if (!b) return; sel[b.dataset.a] = b.dataset.tf; render(); });
  let loaded = false;
  function load() {
    if (loaded) return; loaded = true;
    Promise.all([fetch('markets.json').then(r => r.json()), fetch('markets_log.json').then(r => r.json()).catch(() => ({}))])
      .then(([d, l]) => { DATA = d; LOG = l; render(); })
      .catch(() => { $('#mk-list').innerHTML = '<div class="card err">markets.json 없음 — 첫 갱신이 아직 안 돌았다.</div>'; });
  }
  document.querySelector('[data-tab="markets"]').addEventListener('click', () => setTimeout(load, 30));
  if (location.hash === '#markets') { document.querySelector('[data-tab="markets"]').click(); }
})();
