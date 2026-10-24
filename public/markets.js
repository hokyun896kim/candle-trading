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

  function render() {
    if (!DATA) return;
    charts.forEach(c => { try { c.remove(); } catch {} }); charts.length = 0;
    $('#mk-meta').textContent = `기준 ${DATA.asof} · 매일 아침 7시 반, 평일 장 마감 뒤 자동 갱신`;
    $('#mk-list').innerHTML = DATA.assets.map(a => {
      const tf = sel[a.key] || a.best; const j = a.tf[tf]; const b = j.bt;
      const tabs = Object.keys(a.tf).map(k => `<button data-a="${a.key}" data-tf="${k}" class="${k === tf ? 'on' : ''}">${TF[k]}${k === a.best ? ' ⭐' : ''}</button>`).join('');
      const pk = j.probKind === 'sell';
      const pbar = j.prob == null ? '' : `
        <div style="margin-top:12px;background:${pk ? '#EAF2FF' : '#FFF1E6'};border-radius:12px;padding:10px 12px">
          <div style="display:flex;justify-content:space-between;align-items:baseline">
            <b style="font-size:14px;color:${pk ? 'var(--blue)' : 'var(--orange-deep)'}">${pk ? '판다 신호' : '산다 신호'} 나올 확률</b>
            <b style="font-size:22px;color:${pk ? 'var(--blue)' : 'var(--orange-deep)'}">${j.prob}%</b>
          </div>
          <div style="height:8px;background:rgba(255,255,255,.8);border-radius:99px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${j.prob}%;background:${pk ? 'var(--blue)' : 'var(--orange)'}"></div></div>
          <div style="font-size:11.5px;color:var(--text3);margin-top:6px;line-height:1.5">${j.probLabel}. 돈 벌 확률이 아니라 그 날 신호가 나올지만 센 거다.</div>
        </div>`;
      const holding = b.open ? (b.open.waitSell
        ? `<b>들고 있으면</b>: ${ym(b.open.t)}에 산 게 음봉이 양봉을 깨서 끝났다(지금 ${b.open.pct >= 0 ? '+' : ''}${b.open.pct}%). ${j.dir === 'bull' ? `<b>지금 ${tf === 'month' ? '이번 달' : '이번 주'} 양봉이 그 반등이다 — 여기서 판다.</b>` : '다음 양봉 반등에 판다.'}`
        : `<b>지금 들고 있는 매매</b>: ${ym(b.open.t)}에 ${fmtN(b.open.p, a.unit)}에 샀다 → 지금 <b class="${b.open.pct >= 0 ? 'pos' : 'neg'}">${b.open.pct >= 0 ? '+' : ''}${b.open.pct}%</b>`)
        : (b.lastClosed ? `<b>지금 들고 있는 매매 없음</b> · 마지막은 ${ym(b.lastClosed.et)}→${ym(b.lastClosed.xt)} ${b.lastClosed.pct >= 0 ? '+' : ''}${b.lastClosed.pct}%` : '');
      const log = (LOG[`${a.key}_${tf}`] || []).slice(-7).reverse();
      const logHtml = log.length ? `<ul class="ev" style="margin-top:6px">${log.map(e => `<li><span class="d">${e.d.slice(5).replace('-', '.')}</span><span style="flex:1"><b>${e.s}</b> · ${fmtN(e.p, a.unit)}${e.prob != null ? ` · 신호 확률 ${e.prob}%` : ''}</span></li>`).join('')}</ul>` : '<p class="note">기록이 내일부터 쌓인다.</p>';
      return `
      <section class="card">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <h2 style="margin:0">${a.name}</h2>
          <span style="font-size:20px;font-weight:800">${fmtN(a.price, a.unit)}${a.unit === 'krw' ? ' 원' : ''}</span>
        </div>
        <div class="seg" style="margin:10px 0 8px">${tabs}</div>
        <span class="chip ${j.tone}" style="font-size:13px">${j.status}</span>
        <p style="margin-top:8px;color:var(--text);font-size:14.5px;line-height:1.65">${j.text}</p>
        ${pbar}
        <div id="mk-chart-${a.key}" class="chart" style="height:260px"></div>
        <div class="live" style="background:var(--bg2);margin-top:10px"><div class="t">${holding}</div></div>
        <h3 style="margin-top:14px">이 방식 과거 성적 (${TF[tf]})</h3>
        <p class="note" style="margin:-2px 0 6px">양봉 종가가 앞 음봉 고가를 넘은 ${tf === 'month' ? '달' : '주'} 종가에 사서, 음봉 종가가 앞 양봉 저가를 깬 뒤 첫 양봉 종가에 판 결과</p>
        <div class="pstat"><span>${b.years}년 · 매매 ${b.n}번 · 승률 ${b.win}%</span><span>연 <b class="${b.cagr >= 0 ? 'pos' : 'neg'}">${b.cagr}%</b> · 최대 낙폭 <b>${b.mdd}%</b></span><span>그냥 보유: 연 ${b.holdCagr}% · 낙폭 ${b.holdMdd}%</span></div>
        <p class="note" style="margin-top:2px">${a.note}</p>
        <h3 style="margin-top:12px">모니터링 기록</h3>
        ${logHtml}
      </section>`;
    }).join('');
    DATA.assets.forEach(a => draw(a, a.tf[sel[a.key] || a.best]));
  }

  function draw(a, j) {
    const el = document.getElementById('mk-chart-' + a.key); if (!el || !window.LightweightCharts) return;
    const chart = LightweightCharts.createChart(el, {
      layout: { background: { color: '#fff' }, textColor: '#868B94', fontSize: 11 }, localization: { locale: 'ko-KR', dateFormat: 'yy.MM' },
      grid: { vertLines: { color: '#F2F3F6' }, horzLines: { color: '#F2F3F6' } }, rightPriceScale: { borderColor: '#EAEBEE', mode: 1 },
      timeScale: { borderColor: '#EAEBEE' }, crosshair: { mode: 0 }, autoSize: true,
    });
    const s = chart.addCandlestickSeries({ upColor: '#F04452', downColor: '#3182F6', borderUpColor: '#F04452', borderDownColor: '#3182F6', wickUpColor: '#F04452', wickDownColor: '#3182F6', priceFormat: { type: 'price', precision: 0, minMove: 1 } });
    const iso = t => `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`;
    s.setData(j.bars.map(b => ({ time: iso(b[0]), open: b[1], high: b[2], low: b[3], close: b[4] })));
    const first = j.bars[0][0];
    s.setMarkers(j.events.filter(e => e.t >= first && e.type !== 'doubleTop').map(e => ({ time: iso(e.t), position: e.type === 'up' ? 'belowBar' : 'aboveBar', color: e.type === 'up' ? '#FF6F0F' : '#3182F6', shape: e.type === 'up' ? 'arrowUp' : 'arrowDown', text: e.type === 'up' ? '산다' : '판다' })));
    if (j.hold != null && (j.state === 'up' || j.liveState === 'up')) s.createPriceLine({ price: j.hold, color: '#FF6F0F', lineWidth: 1.5, lineStyle: 2, title: '깨면 판다' });
    if (j.brk != null && (j.state === 'down' || j.liveState === 'down' || j.status.startsWith('🔥'))) s.createPriceLine({ price: j.brk, color: '#3182F6', lineWidth: 1.5, lineStyle: 2, title: '넘으면 산다' });
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
