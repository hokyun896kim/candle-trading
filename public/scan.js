/* 스캔 탭 — scan.json 표시 */
(function () {
  const E = window.CandleEngine;
  const $ = (s) => document.querySelector(s);
  let DATA = null, filter = 'turn', mk = 'ALL', q = '';

  function classify(r) {
    const f = r.m.fix, l = r.m.live;
    // 전환 임박: 확정 하락인데 이번 달 양봉이 전환선 넘고 있음 → 월말 종가로 확정되면 게이트 열림
    if (f.state === 'down' && l.state === 'up') return 'turn';
    // 시세 종료 임박: 확정 상승인데 이번 달 음봉이 보유선(직전 양봉 저점)을 깨고 있음 → 월말 종가로 확정되면 하락 전환
    if (f.state === 'up' && l.state === 'down') return 'end';
    // 매수 자리: 확정 월봉 상승 + 이번 달 음봉 진행 + 보유선 위(라이브) + 쌍봉 아님
    if (f.state === 'up' && l.dir === 'bear' && l.buyOK) return 'buy';
    // 보유 중: 확정 상승 + 양봉 진행(또는 쌍봉 경고 중)
    if (f.state === 'up') return 'hold';
    return 'out';
  }
  const LABEL = { turn: '🔥 전환 임박', end: '⛔ 시세 종료 임박', buy: '🎯 매수 자리', hold: '보유 중', out: '하락·현금' };
  const TONE = { turn: 'o', end: 'b', buy: 'r', hold: 'g', out: '' };
  const NOTE = {
    turn: '이번 달 양봉이 전환선(직전 음봉 고점) 위에 있다. 월말 종가로 넘으면 게이트 열림. 431종목 10년 실측: 이 자리에서 사면 <b>월말 확정률 49%</b>, 실패 시 월말 정리 평균 <b>-6.5%</b>, 대신 성공분은 제일 싸게 사서 손익비 5.6(확정 뒤 매수 3.8). 반은 틀린다는 걸 알고 <b>미확정이면 월말에 무조건 정리</b>.',
    end: '이번 달 음봉이 보유선(직전 양봉 저점) 아래에 있다. 월말 종가로 깨지면 하락 전환 = 매도 신호. 강사 규칙은 그 음봉에 던지지 않고 <b>다음 양봉 반등에 판다</b>. 전환선을 다시 넘기 전까지 반등마다 매도.',
    buy: '확정 월봉 상승 + 이번 달 음봉이 보유선 위에서 눌림. <b>월말에 음봉으로 끝나면 그 종가가 매수가</b>. 강사가 "제일 좋다"고 한 자리고, 실측 손익비도 확정 매수 중 최고(4.0). 첫 음봉이 위로 정렬.',
    hold: '확정 상승 상태. 양봉 진행 중이면 다음 음봉 대기, 쌍봉 경고면 추가매수 중단.',
    all: ''
  };

  function render() {
    if (!DATA) return;
    $('#scan-meta').textContent = `기준 ${DATA.asof} · ${DATA.n}종목 · 월봉 12년·주봉 3년`;
    if (DATA.kospi) {
      const k = DATA.kospi;
      $('#scan-kospi').innerHTML = `<div class="live" style="background:var(--bg2)"><div class="k">코스피 월봉 게이트</div><div class="t"><b>${k.gate.label}</b>${k.gateLive && k.gateLive.code !== k.gate.code ? ` · ⏳ 이번 달 진행: ${k.gateLive.label}` : ''} · 종가 ${E.fmt(k.live.close)}</div></div>`;
    }
    let rows = DATA.rows.map(r => ({ ...r, cls: classify(r) }));
    if (mk !== 'ALL') rows = rows.filter(r => r.market === mk);
    if (q) rows = rows.filter(r => r.name.includes(q) || r.code.includes(q));
    if (filter !== 'all') rows = rows.filter(r => r.cls === filter);
    const order = { turn: 0, buy: 1, end: 2, hold: 3, out: 4 };
    rows.sort((a, b) => order[a.cls] - order[b.cls] || (a.cls === 'buy' ? (b.m.live.first - a.m.live.first) : 0) || (a.cls === 'turn' ? margin(b) - margin(a) : 0) || a.rank - b.rank);
    $('#scan-note').innerHTML = NOTE[filter] ? `<div class="live" style="background:${filter === 'turn' ? '#FFF1E6' : filter === 'end' ? '#EAF2FF' : 'var(--bg2)'}"><div class="t">${NOTE[filter]}</div></div>` : '';
    const counts = DATA.rows.reduce((o, r) => { const c = classify(r); o[c] = (o[c] || 0) + 1; return o; }, {});
    $('#scan-seg').querySelectorAll('button').forEach(b => { const f = b.dataset.f; b.textContent = `${f === 'all' ? '전체' : LABEL[f]} ${f === 'all' ? DATA.rows.length : (counts[f] || 0)}`; });
    $('#scan-list').innerHTML = rows.length ? rows.map(card).join('') : '<div class="card loading">해당 없음</div>';
  }

  function margin(r) { const l = r.m.live, f = r.m.fix; return f.brk ? (l.close / f.brk - 1) * 100 : 0; }

  function card(r) {
    const f = r.m.fix, l = r.m.live, w = r.w.fix;
    const grp = r.market === 'KOSPI' ? (r.rank <= 100 ? '대형' : '중형') : '상위';
    const gTone = grp === '중형' ? 'y' : '';
    let line;
    if (r.cls === 'buy') line = `이번 달 ${l.first ? '<b>첫 음봉</b>' : '음봉 ' + l.n + '개째'} · 종가 ${E.fmt(l.close)} · 보유선 ${E.fmt(l.hold)} (여유 ${((l.close / l.hold - 1) * 100).toFixed(1)}%)${l.dt ? ' · ⚠ 쌍봉' : ''}`;
    else if (r.cls === 'turn') line = `이번 달 양봉 종가 <b>${E.fmt(l.close)}</b> > 전환선 ${E.fmt(f.brk)} (+${margin(r).toFixed(1)}%) · <b>월말 종가로 넘으면 게이트 열림</b> · 못 넘으면 월말 정리`;
    else if (r.cls === 'end') line = `이번 달 음봉 종가 <b>${E.fmt(l.close)}</b> < 보유선 ${E.fmt(l.hold)} (${((l.close / l.hold - 1) * 100).toFixed(1)}%) · <b>월말 종가로 깨지면 하락 전환</b> → 다음 양봉 반등에 매도${l.accel ? ' · ⚠ 하락 가속' : ''}`;
    else if (r.cls === 'hold') line = `${l.dir === 'bull' ? '양봉 진행 — 다음 음봉 대기' : (l.dt ? '쌍봉 경고 — 추가매수 중단' : '음봉 — 보유선 이탈 중')} · 보유선 ${E.fmt(f.hold)}${l.dir === 'bull' && l.holdNext != null ? ' → ' + E.fmt(l.holdNext) : ''}`;
    else line = `하락 상태 · 전환선 ${E.fmt(f.brk)} (${((f.brk / l.close - 1) * 100).toFixed(1)}% 위)${l.accel ? ' · ⚠ 하락 가속' : ''}`;
    const ev = r.m.lastEv ? `${r.m.lastEv.t.slice(2, 4)}.${r.m.lastEv.t.slice(4, 6)} ${r.m.lastEv.type === 'up' ? '상승전환' : r.m.lastEv.type === 'down' ? '하락전환' : '쌍봉'}` : '';
    const perf = r.perf ? `월봉 ${r.perf.n}회 · 승률 ${r.perf.win}% · 평균 ${r.perf.avg >= 0 ? '+' : ''}${r.perf.avg}%` : '성과 없음';
    return `
      <section class="card" style="padding:14px 16px" onclick="location.href='?code=${r.code}&name=${encodeURIComponent(r.name)}'">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <b style="font-size:16px">${r.name}</b><span class="note" style="margin:0">${r.code}</span>
          <span class="chip ${TONE[r.cls]}">${LABEL[r.cls]}</span>
          <span class="chip ${gTone}">${r.market === 'KOSPI' ? '코스피' : '코스닥'} ${r.rank}위 · ${grp}</span>
        </div>
        <div style="font-size:13.5px;color:var(--text2);margin-top:6px;line-height:1.55">${line}</div>
        <div class="note" style="margin-top:4px">주봉 ${w.state === 'up' ? '상승' : w.state === 'down' ? '하락' : '-'} · ${ev} · ${perf} · 12개월 ${r.mo12 >= 0 ? '+' : ''}${r.mo12}%</div>
      </section>`;
  }

  $('#scan-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; $('#scan-seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  document.querySelectorAll('[data-mk]').forEach(c => c.addEventListener('click', () => { mk = c.dataset.mk; document.querySelectorAll('[data-mk]').forEach(x => x.classList.toggle('o', x === c)); render(); }));
  $('#scan-q').addEventListener('input', e => { q = e.target.value.trim(); render(); });

  fetch('scan.json').then(r => r.json()).then(j => { DATA = j; render(); }).catch(() => { $('#scan-list').innerHTML = '<div class="card err">scan.json 없음 — 첫 스캔이 아직 안 돌았다.</div>'; });
})();
