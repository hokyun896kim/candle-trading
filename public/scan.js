/* 스캔 탭 — scan.json 표시 */
(function () {
  const E = window.CandleEngine;
  const $ = (s) => document.querySelector(s);
  let DATA = null, filter = 'top', mk = 'ALL', q = '';

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
  const LABEL = { turn: '🔥 양봉이 음봉 이기는 중', end: '⛔ 음봉이 양봉 깨는 중', buy: '🎯 상승 중 음봉 눌림', hold: '상승 중', out: '하락 중' };
  const TONE = { turn: 'o', end: 'b', buy: 'r', hold: 'g', out: '' };
  const NOTE = {
    turn: '이번 달 양봉이 <b>지난 음봉 고가를 넘고 있는</b> 종목. 월말 종가가 그 위면 → 다음 달부터 음봉 나올 때마다 산다. 못 넘으면 안 산다.<br>지금 미리 사면: 열에 다섯은 월말에 못 넘고(그땐 평균 -6.5%), 대신 넘는 다섯은 제일 싸게 산 거라 전체로는 제일 많이 남는다. <b>월말에 못 넘으면 무조건 판다</b>는 조건으로만.',
    end: '상승 중이던 종목인데 이번 달 음봉이 <b>지난 양봉 저가 밑으로 내려와 있는</b> 종목. 월말 종가가 그 밑이면 끝난 거다. 그 음봉에 던지지 말고 <b>다음 양봉 올 때 판다</b>. 양봉이 지난 음봉 고가 다시 넘기 전까진 반등마다 판다.',
    buy: '상승 중인데 이번 달 음봉이고, 지난 양봉 저가는 안 깬 종목. <b>월말에 음봉으로 끝나면 그 종가에 산다</b>. 양봉이 음봉 이긴 뒤 <b>첫 번째 음봉</b>이 제일 좋다(실측 손익비 3.9). 2번째 3.2, 3번째 2.6, 4번째부터 2.2로 갈수록 힘 빠진다.',
    hold: '상승 중. 양봉이면 다음 음봉 기다리고, 음봉 고가가 낮아졌으면(쌍봉) 더 안 산다.',
    top: '🔥·🎯 사는 쪽 종목만 점수 매겨 위에서 15개. <b>🔥은 월말 종가가 음봉 고가 위여야 다음 달부터 사는 거고, 🎯은 월말에 음봉으로 끝나면 그 종가에 사는 거다.</b><br>점수: 주봉 조합(🔥은 주봉도 상승 양봉, 🎯은 주봉 하락 중일 때 실측으로 제일 남았다) · 상승 시작 뒤 몇 번째 음봉인지(1번째 +, 3번째부터 −) · 깨면 파는 선이 먼지(멀수록 더 남았다) · 코스피 중형 감점 · 그 종목 과거 성적.<br>상승 시작 뒤 <b>4번째 음봉부터</b>나 시작가보다 <b>두 배 넘게 오른 뒤</b> 음봉은 여기서 뺐다(🎯 목록엔 있다).',
    all: ''
  };

  function render() {
    if (!DATA) return;
    $('#scan-meta').textContent = `기준 ${DATA.asof} · ${DATA.n}종목 · 월봉 12년·주봉 3년`;
    if (DATA.kospi) {
      const k = DATA.kospi;
      $('#scan-kospi').innerHTML = `<div class="live" style="background:var(--bg2)"><div class="k">코스피 월봉 (시황)</div><div class="t"><b>${k.gate.label}</b>${k.gateLive && k.gateLive.code !== k.gate.code ? ` · ⏳ 이번 달은 ${k.gateLive.label}` : ''} · 지금 ${E.fmt(k.live.close)}</div></div>`;
    }
    let rows = DATA.rows.map(r => ({ ...r, cls: classify(r) }));
    if (mk !== 'ALL') rows = rows.filter(r => r.market === mk);
    if (q) rows = rows.filter(r => r.name.includes(q) || r.code.includes(q));
    if (filter === 'top') {
      rows = rows.filter(r => (r.cls === 'turn' || r.cls === 'buy') && !late(r)).map(r => ({ ...r, sc: score(r) }));
      rows.sort((a, b) => b.sc.s - a.sc.s || b.sc.down - a.sc.down);
      rows = rows.slice(0, 15);
    } else {
      if (filter !== 'all') rows = rows.filter(r => r.cls === filter);
      const order = { turn: 0, buy: 1, end: 2, hold: 3, out: 4 };
      rows.sort((a, b) => order[a.cls] - order[b.cls] || (a.cls === 'buy' ? ((a.m.live.nth || 9) - (b.m.live.nth || 9) || (b.m.live.first - a.m.live.first)) : 0) || (a.cls === 'turn' ? margin(b) - margin(a) : 0) || a.rank - b.rank);
    }
    const kWarn = DATA.kospi && DATA.kospi.gateLive && DATA.kospi.gateLive.code === 'closed' ? '<br>⚠ <b>코스피 월봉이 지금 하락 쪽이다.</b> 월말 종가로 그게 확정되면 아래 순위는 전부 새로 안 사는 게 강사 규칙이다.' : '';
    $('#scan-note').innerHTML = NOTE[filter] ? `<div class="live" style="background:${filter === 'turn' || filter === 'top' ? '#FFF1E6' : filter === 'end' ? '#EAF2FF' : 'var(--bg2)'}"><div class="t">${NOTE[filter]}${filter === 'top' ? kWarn : ''}</div></div>` : '';
    const counts = DATA.rows.reduce((o, r) => { const c = classify(r); o[c] = (o[c] || 0) + 1; return o; }, {});
    counts.top = Math.min(15, DATA.rows.filter(r => { const c = classify(r); return (c === 'turn' || c === 'buy') && !late({ ...r, cls: c }); }).length);
    $('#scan-seg').querySelectorAll('button').forEach(b => { const f = b.dataset.f; if (!b.dataset.label) b.dataset.label = b.textContent.trim(); b.textContent = `${b.dataset.label} ${f === 'all' ? DATA.rows.length : (counts[f] || 0)}`; });
    $('#scan-list').innerHTML = rows.length ? rows.map((r, i) => card(r, filter === 'top' ? i + 1 : 0)).join('') : '<div class="card loading">해당 없음</div>';
  }

  // ⭐ 추천 점수 — 사는 쪽(🔥·🎯)만. 실측으로 확인한 것 + 손절 거리·과거 성적
  function score(r) {
    const f = r.m.fix, l = r.m.live, wf = r.w.fix, wl = r.w.live;
    const big = r.market === 'KOSPI' ? r.rank <= 100 : true;
    const mid = r.market === 'KOSPI' && r.rank > 100;
    let s = 0; const why = [];
    const down = l.hold ? (l.hold / l.close - 1) * 100 : -99;   // 깨면 파는 선까지 (음수)
    if (r.cls === 'turn') {
      const m = margin(r);
      if (wl.state === 'up' && wl.dir === 'bull') { s += 3; why.push('주봉도 상승 양봉 👍'); }
      else if (wl.state === 'up') { s -= 1; why.push('주봉은 눌림'); }
      else { s -= 2; why.push('주봉은 아직 하락'); }
      if (m >= 10) { s += 2; why.push(`음봉 고가보다 ${m.toFixed(0)}% 위 — 월말까지 여유`); }
      else if (m >= 5) { s += 1; why.push(`음봉 고가보다 ${m.toFixed(0)}% 위`); }
      else { s -= 1; why.push(`음봉 고가보다 ${m.toFixed(1)}%뿐 — 월말까지 빠듯`); }
    } else {
      if (wf.state === 'down' || wl.state === 'down') { s += 3; why.push('주봉은 하락 중 — 싸게 사는 자리 👍'); }
      else if (wl.dir === 'bear') { s -= 1; why.push('주봉도 눌림'); }
      else why.push('주봉 상승');
      const n = l.nth || (l.first ? 1 : 2), up = l.upT ? `${l.upT.slice(2, 4)}년 ${+l.upT.slice(4, 6)}월 상승 시작 뒤 ` : '';
      if (n === 1) { s += 2; why.push(`${up}첫 음봉 👍`); }
      else if (n === 2) why.push(`${up}2번째 음봉`);
      else if (n === 3) { s -= 1; why.push(`${up}3번째 음봉 — 힘 빠짐`); }
      else { s -= 2; why.push(`${up}${n}번째 음봉 — 많이 늦음`); }
      if (!l.first) { s -= 1; why.push(`음봉 ${l.n}달째`); }
      if (l.upP && l.close / l.upP > 2) { s -= 1; why.push(`상승 시작 뒤 이미 +${Math.round((l.close / l.upP - 1) * 100)}%`); }
      if (l.dt) { s -= 3; why.push('음봉 고가 낮아짐(쌍봉)'); }
    }
    // 실측(월봉 450종목): 깨면 파는 선이 멀수록(=앞 양봉이 크게 올라온 자리) 더 남았다. 8% 이내 2.5 · 15~30% 3.1 · 30% 넘게 4.0
    if (down < -30) { s += 1; why.push(`깨면 파는 선 ${down.toFixed(0)}% — 앞 양봉이 크게 올라온 자리 👍`); }
    else if (down > -15) { s -= 1; why.push(`깨면 파는 선 ${down.toFixed(0)}% — 가까운 건 오히려 덜 남았다`); }
    else why.push(`깨면 파는 선 ${down.toFixed(0)}%`);
    if (mid) { s -= 2; why.push('코스피 중형 — 남는 게 적은 구간'); }
    const p = r.perf;
    if (p && p.n >= 3) {
      if (p.avg >= 20 && p.win >= 50) { s += 2; why.push(`과거 ${p.n}번 중 ${p.win}% 이김·평균 +${p.avg.toFixed(0)}% 👍`); }
      else if (p.avg < 0) { s -= 2; why.push(`과거 평균 ${p.avg.toFixed(0)}%`); }
      else why.push(`과거 ${p.n}번 중 ${p.win}% 이김·평균 ${p.avg >= 0 ? '+' : ''}${p.avg.toFixed(0)}%`);
    }
    return { s, why, down };
  }

  // 너무 늦은 눌림: 상승 시작 뒤 4번째 음봉부터, 또는 시작가의 두 배 넘게 오른 뒤 → ⭐추천에서 뺀다 (🎯 목록엔 남김)
  function late(r) { const l = r.m.live; return r.cls === 'buy' && ((l.nth || 0) >= 4 || (l.upP && l.close / l.upP > 2)); }
  function margin(r) { const l = r.m.live, f = r.m.fix; return f.brk ? (l.close / f.brk - 1) * 100 : 0; }

  function card(r, rank) {
    const f = r.m.fix, l = r.m.live, w = r.w.fix, wl = r.w.live;
    const grp = r.market === 'KOSPI' ? (r.rank <= 100 ? '대형' : '중형') : '상위';
    const gTone = grp === '중형' ? 'y' : '';
    let line;
    if (r.cls === 'buy') line = `${l.upT ? l.upT.slice(2, 4) + '년 ' + (+l.upT.slice(4, 6)) + '월 양봉이 음봉 이긴 뒤 ' : ''}<b>${l.nth || '?'}번째 음봉</b>${l.first ? '' : ' (' + l.n + '달째)'} · 지금 ${E.fmt(l.close)} · 지난 양봉 저가 ${E.fmt(l.hold)} (깨면 파는 선 ${((l.hold / l.close - 1) * 100).toFixed(0)}%) · <b>월말 음봉이면 그 종가에 산다</b>${l.dt ? ' · ⚠ 음봉 고가 낮아짐 — 더 안 산다' : ''}`;
    else if (r.cls === 'turn') line = `지금 <b>${E.fmt(l.close)}</b> — 지난 음봉 고가 ${E.fmt(f.brk)}보다 ${margin(r).toFixed(1)}% 위 · <b>월말 종가가 ${E.fmt(f.brk)} 위면 다음 달부터 음봉마다 산다</b>`;
    else if (r.cls === 'end') line = `지금 <b>${E.fmt(l.close)}</b> — 지난 양봉 저가 ${E.fmt(l.hold)}보다 ${Math.abs((l.close / l.hold - 1) * 100).toFixed(1)}% 밑 · <b>월말 종가가 ${E.fmt(l.hold)} 밑이면 다음 양봉에 판다</b>${l.accel ? ' · ⚠ 더 큰 음봉 올 수 있다' : ''}`;
    else if (r.cls === 'hold') line = `${l.dir === 'bull' ? '양봉 중 — 다음 음봉 오면 산다' : (l.dt ? '음봉 고가 낮아짐(쌍봉) — 더 안 산다' : '음봉 — 지난 양봉 저가 깨는 중')} · 깨면 파는 선 ${E.fmt(f.hold)}${l.dir === 'bull' && l.holdNext != null ? ' → 이 양봉 끝나면 ' + E.fmt(l.holdNext) : ''}`;
    else line = `하락 중 · 양봉이 ${E.fmt(f.brk)} 넘어야 산다 (${((f.brk / l.close - 1) * 100).toFixed(1)}% 위)${l.accel ? ' · ⚠ 더 큰 음봉 올 수 있다' : ''}`;
    const ev = r.m.lastEv ? `${r.m.lastEv.t.slice(2, 4)}.${r.m.lastEv.t.slice(4, 6)}에 ${r.m.lastEv.type === 'up' ? '상승 시작' : r.m.lastEv.type === 'down' ? '하락 시작' : '쌍봉'}` : '';
    const perf = r.perf ? `과거 ${r.perf.n}번 중 ${r.perf.win}% 수익 · 평균 ${r.perf.avg >= 0 ? '+' : ''}${r.perf.avg}%` : '과거 기록 없음';
    return `
      <section class="card" style="padding:14px 16px" onclick="location.href='?code=${r.code}&name=${encodeURIComponent(r.name)}'">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${rank ? `<span style="font-size:18px;font-weight:900;color:var(--orange);min-width:22px">${rank}</span>` : ''}
          <b style="font-size:16px">${r.name}</b><span class="note" style="margin:0">${r.code}</span>
          <span class="chip ${TONE[r.cls]}">${LABEL[r.cls]}</span>
          <span class="chip ${gTone}">${r.market === 'KOSPI' ? '코스피' : '코스닥'} ${r.rank}위 · ${grp}</span>
        </div>
        <div style="font-size:13.5px;color:var(--text2);margin-top:6px;line-height:1.55">${line}</div>
        ${rank && r.sc ? `<div style="margin-top:6px;font-size:12.5px;line-height:1.6;color:var(--text2);background:var(--bg2);border-radius:10px;padding:7px 10px"><b style="color:var(--orange-deep)">점수 ${r.sc.s}</b> · ${r.sc.why.join(' · ')}</div>` : ''}
        <div class="note" style="margin-top:4px">주봉은 ${w.state === 'up' ? '상승 중' : w.state === 'down' ? '하락 중' : '-'}${w.state !== wl.state ? ' (이번 주 ' + (wl.state === 'up' ? '양봉이 이기는 중' : '음봉이 깨는 중') + ')' : (wl.dir === 'bull' ? '·양봉' : '·음봉')} · ${ev} · ${perf} · 12개월 ${r.mo12 >= 0 ? '+' : ''}${r.mo12}%</div>
      </section>`;
  }

  $('#scan-seg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.f; $('#scan-seg').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); render(); });
  document.querySelectorAll('[data-mk]').forEach(c => c.addEventListener('click', () => { mk = c.dataset.mk; document.querySelectorAll('[data-mk]').forEach(x => x.classList.toggle('o', x === c)); render(); }));
  $('#scan-q').addEventListener('input', e => { q = e.target.value.trim(); render(); });

  fetch('scan.json').then(r => r.json()).then(j => { DATA = j; render(); }).catch(() => { $('#scan-list').innerHTML = '<div class="card err">scan.json 없음 — 첫 스캔이 아직 안 돌았다.</div>'; });
})();
