/* 개념 탭 도해 — 합성 캔들을 SVG로 그린다 */
(function () {
  const RED = '#F04452', BLUE = '#3182F6', OR = '#E8600A', GR = '#8B95A1', TX = '#191F28';
  const FONT = 'Pretendard Variable,Pretendard,Apple SD Gothic Neo,Noto Sans KR,sans-serif';

  function draw(id, candles, opt) {
    const W = 330, H = 236, padL = 12, padR = 12, padT = 46, padB = 46;
    const n = candles.length;
    const hi = Math.max(...candles.map(c => c.h)), lo = Math.min(...candles.map(c => c.l));
    const px = (i) => padL + (i + 0.5) * (W - padL - padR) / n;
    const py = (v) => padT + (hi - v) * (H - padT - padB) / (hi - lo);
    const cw = Math.min(16, (W - padL - padR) / n * 0.6);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">`;
    // 음영
    (opt.shade || []).forEach(sh => {
      s += `<rect x="${px(sh.from) - cw}" y="${py(sh.y2)}" width="${px(sh.to) - px(sh.from) + cw * 2}" height="${py(sh.y1) - py(sh.y2)}" fill="${sh.color || OR}" opacity=".10" rx="4"/>`;
    });
    // 블록 묶음
    (opt.groups || []).forEach(g => {
      const x1 = px(g.from) - cw, x2 = px(g.to) + cw;
      const top = Math.min(...candles.slice(g.from, g.to + 1).map(c => c.h));
      const yH = py(Math.max(...candles.slice(g.from, g.to + 1).map(c => c.h))) - 4;
      const yL = py(Math.min(...candles.slice(g.from, g.to + 1).map(c => c.l))) + 4;
      s += `<rect x="${x1}" y="${yH}" width="${x2 - x1}" height="${yL - yH}" fill="none" stroke="${g.color || GR}" stroke-dasharray="3 3" rx="6"/>`;
      if (g.label) s += `<text x="${(x1 + x2) / 2}" y="${H - 12}" font-size="12" fill="${g.color || GR}" text-anchor="middle" font-weight="600">${g.label}</text>`;
    });
    // 캔들
    candles.forEach((c, i) => {
      const up = c.c >= c.o, col = up ? RED : BLUE, x = px(i);
      s += `<line x1="${x}" y1="${py(c.h)}" x2="${x}" y2="${py(c.l)}" stroke="${col}" stroke-width="1.5"/>`;
      const yo = py(Math.max(c.o, c.c)), hh = Math.max(2, Math.abs(py(c.o) - py(c.c)));
      s += `<rect x="${x - cw / 2}" y="${yo}" width="${cw}" height="${hh}" fill="${col}" rx="2"/>`;
    });
    // 수평선
    (opt.lines || []).forEach(L => {
      const x1 = px(L.from ?? 0) - cw, x2 = px(L.to ?? n - 1) + cw;
      s += `<line x1="${x1}" y1="${py(L.y)}" x2="${x2}" y2="${py(L.y)}" stroke="${L.color || OR}" stroke-width="1.5" stroke-dasharray="${L.solid ? '0' : '5 4'}"/>`;
      if (L.label) s += `<text x="${L.labelRight ? x2 : x1}" y="${py(L.y) + (L.below ? 15 : -6)}" font-size="12" fill="${L.color || OR}" text-anchor="${L.labelRight ? 'end' : 'start'}" font-weight="600" paint-order="stroke" stroke="#F9FAFB" stroke-width="4">${L.label}</text>`;
    });
    // 라벨/화살표
    (opt.labels || []).forEach(L => {
      const c = candles[L.i], x = px(L.i);
      const est = L.text.length * 12 * 0.9;
      const tx = Math.min(W - 4 - est / 2, Math.max(4 + est / 2, x));
      const col = L.color || OR;
      if (L.above) {
        s += `<line x1="${x}" y1="24" x2="${x}" y2="${py(c.h) - 6}" stroke="${col}" stroke-width="1" stroke-dasharray="2 3"/>`;
        s += `<text x="${tx}" y="18" font-size="12" text-anchor="middle" fill="${col}" font-weight="600">${L.text}</text>`;
      } else {
        s += `<line x1="${x}" y1="${py(c.l) + 6}" x2="${x}" y2="${H - 26}" stroke="${col}" stroke-width="1" stroke-dasharray="2 3"/>`;
        s += `<text x="${tx}" y="${H - 12}" font-size="12" text-anchor="middle" fill="${col}" font-weight="600">${L.text}</text>`;
      }
    });
    s += '</svg>';
    const el = document.getElementById(id);
    el.innerHTML = s + (opt.cap ? `<div class="cap">${opt.cap}</div>` : '');
  }

  // 간이 캔들 생성 helper: [open, close, highExtra, lowExtra]
  const K = (o, c, hx = 1, lx = 1) => ({ o, c, h: Math.max(o, c) + hx, l: Math.min(o, c) - lx });

  // 0. 합봉
  draw('fig-block', [
    K(50, 54), K(54, 58), K(58, 61), K(61, 57), K(57, 52, 1, 2), K(52, 56), K(56, 60), K(60, 59), K(59, 63)
  ], {
    groups: [{ from: 0, to: 2, label: '양봉 묶음', color: RED }, { from: 3, to: 4, label: '음봉 묶음', color: BLUE }, { from: 5, to: 6, label: '양봉 묶음', color: RED }],
    cap: '같은 색이 이어지면 한 덩어리. 고가·저가는 꼬리까지.'
  });

  // 1. 게이트
  draw('fig-gate', [
    K(80, 74, 1, 2), K(74, 70, 1, 2), K(70, 72, 2, 1), K(72, 66, 1, 2), K(66, 61, 1, 2), K(61, 63, 1, 1), K(63, 60, 1, 2), K(60, 58, 1, 1), K(58, 62, 1, 1), K(62, 67, 1, 1), K(67, 65, 1, 1), K(65, 70, 1, 1)
  ], {
    groups: [{ from: 6, to: 7, label: '앞 음봉', color: BLUE }],
    lines: [{ y: 64, from: 4, to: 11, label: '앞 음봉 고가 64', labelRight: true }],
    labels: [{ i: 9, text: '종가 67 > 64 상승 시작', above: true }, { i: 2, text: '반등뿐', above: true, color: GR }],
    cap: '내려올 땐 양봉이 직전 음봉을 못 이긴다. 넘는 순간 상승 전환.'
  });

  // 2. 매수
  draw('fig-buy', [
    K(58, 62), K(62, 67), K(67, 65, 1, 1), K(65, 64, 1, 1), K(64, 69), K(69, 73), K(73, 71, 1, 1), K(71, 76), K(76, 75, 1, 1), K(75, 72, 1, 1), K(72, 78)
  ], {
    groups: [{ from: 0, to: 1, color: RED }, { from: 4, to: 5, color: RED }],
    lines: [{ y: 57, from: 0, to: 3, label: '깨면 파는 선 57', labelRight: true }, { y: 63, from: 4, to: 10, label: '선이 63으로 올라감', below: true, labelRight: true }],
    labels: [{ i: 2, text: '1번째 음봉', above: true }, { i: 6, text: '2번째', above: true }, { i: 9, text: '또 산다', above: true }],
    shade: [{ from: 2, to: 3, y1: 57, y2: 67 }, { from: 6, to: 9, y1: 63, y2: 77 }],
    cap: '앞 양봉 저가 위에서 끝나는 음봉은 전부 살 자리. 양봉이 새로 나오면 그 선이 새 양봉 저가로 올라간다.'
  });

  // 3. 하락 전환 + 양봉 매도
  draw('fig-sell', [
    K(70, 75), K(75, 79), K(79, 77, 1, 1), K(77, 81), K(81, 78, 1, 1), K(78, 72, 1, 2), K(72, 75, 1, 1), K(75, 70, 1, 2), K(70, 66, 1, 2), K(66, 69, 1, 1), K(69, 63, 1, 2)
  ], {
    groups: [{ from: 3, to: 3, color: RED }],
    lines: [{ y: 76, from: 3, to: 10, label: '앞 양봉 저가 76', color: OR, below: true, labelRight: true }, { y: 79, from: 5, to: 10, label: '앞 음봉 고가 79', color: BLUE, labelRight: true }],
    labels: [{ i: 5, text: '72 < 76 하락 시작', above: false, color: BLUE }, { i: 6, text: '양봉에 판다', above: true }, { i: 9, text: '반등마다', above: true }],
    cap: '앞 양봉 저가 깬 음봉에 던지지 않는다. 다음 양봉 반등에 판다. 양봉이 직전 음봉 고점 넘을 때까지 계속.'
  });

  // 4. 쌍봉 경고
  draw('fig-dt', [
    K(60, 66), K(66, 71), K(71, 68, 1, 1), K(68, 65, 1, 1), K(65, 69, 1, 1), K(69, 71, 0.5, 1), K(71, 68, 0.5, 1), K(68, 66, 0.5, 1), K(66, 69, 1, 1), K(69, 63, 1, 2)
  ], {
    groups: [{ from: 2, to: 3, color: BLUE }, { from: 6, to: 7, color: BLUE }],
    lines: [{ y: 72, from: 2, to: 9, label: '앞 음봉 고가 72', color: BLUE, labelRight: true }, { y: 64, from: 3, to: 9, label: '앞 양봉 저가 64', color: OR, below: true }],
    labels: [{ i: 7, text: '고가 낮아짐 = 쌍봉', above: true, color: '#8A6100' }, { i: 9, text: '저가 깨짐 = 끝', above: false, color: BLUE }],
    cap: '양봉이 직전 음봉 고점을 못 넘고, 음봉 고점이 낮아지면 쌍봉. 추가매수 중단. 앞 양봉 저가까지 깨지면 끝.'
  });

  // 5. 2축
  const el = document.getElementById('fig-2axis');
  el.innerHTML = `<svg viewBox="0 0 360 150" xmlns="http://www.w3.org/2000/svg" font-family="${FONT}">
    <rect x="12" y="14" width="160" height="120" rx="14" fill="#FFF3EA"/>
    <text x="92" y="40" font-size="14" font-weight="600" fill="#E8600A" text-anchor="middle">주봉 = 상태</text>
    <text x="92" y="62" font-size="12" fill="#4E5968" text-anchor="middle">양봉이 음봉 이겼나?</text>
    <text x="92" y="80" font-size="12" fill="#4E5968" text-anchor="middle">앞 양봉 저가 안 깼나?</text>
    <text x="92" y="106" font-size="12" fill="#8B95A1" text-anchor="middle">금요일 종가 1회 판정</text>
    <rect x="188" y="14" width="160" height="120" rx="14" fill="#ECF3FE"/>
    <text x="268" y="40" font-size="14" font-weight="600" fill="#1B64DA" text-anchor="middle">일봉 = 타이밍</text>
    <text x="268" y="62" font-size="12" fill="#4E5968" text-anchor="middle">음봉 → 매수</text>
    <text x="268" y="80" font-size="12" fill="#4E5968" text-anchor="middle">저가 깨지면 → 양봉에 판다</text>
    <text x="268" y="106" font-size="12" fill="#8B95A1" text-anchor="middle">주봉 허용일 때만</text>
    <path d="M172 74 L186 74" stroke="#868B94" stroke-width="2" marker-end="url(#a)"/>
    <defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#868B94"/></marker></defs>
  </svg>`;
})();
