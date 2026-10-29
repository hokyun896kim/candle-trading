/* 비단길 캔들매매 판정 엔진 (캔들 단독)
 * 규칙 요약
 *  - 색깔만 본다. 양봉 = 종가 >= 시가, 음봉 = 종가 < 시가. 연속 같은 색은 합봉(블록) 하나로.
 *  - 상승 전환: 양봉 종가가 직전 음봉블록 고점(꼬리 포함)을 넘으면.
 *  - 하락 전환: 음봉 종가가 직전 양봉블록 저점(꼬리 포함)을 깨면.
 *  - 상승 상태: 음봉이 보유선(직전 양봉블록 저점) 안 깨면 매수. 첫 음봉이 최상.
 *  - 하락 상태: 양봉 반등마다 매도. 양봉 종가가 직전 음봉블록 고점 넘기 전까지.
 *  - 쌍봉 경고: 양봉이 직전 음봉 고점 못 넘은 채 음봉 나와 고점이 낮아지면.
 * 브라우저(window.CandleEngine)와 node(module.exports) 둘 다 지원.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CandleEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  function fromNaver(rows) {
    return rows.map(r => ({
      t: String(r.localDate),
      o: +r.openPrice, h: +r.highPrice, l: +r.lowPrice, c: +r.closePrice,
      v: +(r.accumulatedTradingVolume || 0)
    })).filter(b => b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0);
  }

  function isUp(b) { return b.c >= b.o; }

  function analyze(bars) {
    const blocks = [];      // 완료된 블록
    let cur = null;         // 진행 중 블록 {dir, hi, lo, start, end, maxClose, minClose, n}
    let state = 'none';     // 'none' | 'up' | 'down'
    const events = [];      // {i, t, type, level}
    let lastBearHiForDT = null; // 쌍봉 판정용: 마지막 완료 음봉블록 고점
    let dtWarnedBlockStart = -1;
    let pull = 0, upT = null, upP = null;   // 상승 시작 뒤 몇 번째 음봉 덩어리(눌림)인지

    const lastBlock = (dir) => {
      for (let k = blocks.length - 1; k >= 0; k--) if (blocks[k].dir === dir) return blocks[k];
      return null;
    };

    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      const dir = isUp(b) ? 'bull' : 'bear';
      if (!cur || cur.dir !== dir) {
        if (cur) blocks.push(cur);
        cur = { dir, hi: b.h, lo: b.l, start: i, end: i, maxClose: b.c, minClose: b.c, n: 1 };
      } else {
        cur.hi = Math.max(cur.hi, b.h); cur.lo = Math.min(cur.lo, b.l);
        cur.maxClose = Math.max(cur.maxClose, b.c); cur.minClose = Math.min(cur.minClose, b.c);
        cur.end = i; cur.n++;
      }

      const prevBear = lastBlock('bear');   // 완료된 직전 음봉블록
      const prevBull = lastBlock('bull');   // 완료된 직전 양봉블록

      if (dir === 'bull') {
        // 상승 전환 판정
        if (state !== 'up' && prevBear && b.c > prevBear.hi) {
          state = 'up'; pull = 0; upT = b.t; upP = b.c;
          events.push({ i, t: b.t, type: 'up', level: prevBear.hi, price: b.c });
        } else if (state === 'down' && prevBear) {
          // 하락 상태에서의 양봉 = 반등 매도 자리
          events.push({ i, t: b.t, type: 'sellBounce', level: prevBear.hi, price: b.c });
        }
      } else {
        // 음봉
        if (state === 'up' && cur.n === 1) pull++;
        if (state === 'up' && prevBull) {
          if (b.c < prevBull.lo) {
            state = 'down';
            events.push({ i, t: b.t, type: 'down', level: prevBull.lo, price: b.c });
          } else {
            // 보유선 안 깬 음봉 = 매수 자리
            // 쌍봉 경고: 직전 양봉블록이 직전 음봉블록 고점(prevBear.hi)을 종가로 못 넘었고,
            //           현재 음봉블록 고점이 그 음봉 고점보다 낮다
            let dt = false;
            if (prevBear && prevBull && prevBull.maxClose <= prevBear.hi && cur.hi < prevBear.hi) dt = true;
            if (dt && dtWarnedBlockStart !== cur.start) {
              dtWarnedBlockStart = cur.start;
              events.push({ i, t: b.t, type: 'doubleTop', level: prevBear.hi, price: b.c });
            }
            // 쌍봉 상태에서는 추가매수 금지 (직전 음봉 고점보다 높아진 눌림만 허용)
            events.push({ i, t: b.t, type: 'buy', first: cur.n === 1, nth: pull, blocked: dt, level: prevBull.lo, price: b.c });
          }
        } else if (state === 'down' && prevBear && prevBull && cur.n === 1) {
          // 하락 가속 경고: 양봉이 직전 음봉 고점을 못 넘고(종가), 새 음봉이 그 고점보다 낮게 시작
          if (prevBull.maxClose <= prevBear.hi && b.h < prevBear.hi) {
            events.push({ i, t: b.t, type: 'accel', level: prevBear.hi, price: b.c });
          }
        }
      }
    }

    // ---- 현재 상태 요약 ----
    const last = bars[bars.length - 1];
    const prevBear = lastBlock('bear');
    const prevBull = lastBlock('bull');
    const summary = {
      state,
      lastBar: last,
      lastDir: cur ? cur.dir : null,
      curBlock: cur,
      // 보유선: 상승 상태일 때 음봉이 깨면 안 되는 선 = 완료된 직전 양봉블록 저점.
      //   진행 중 블록이 양봉이면 '다음 음봉부터 적용될 선'은 진행 블록 저점.
      holdLine: null, holdLineNext: null,
      // 재진입/전환선: 양봉 종가가 넘어야 하는 선 = 직전 음봉블록 고점(진행 중이 음봉이면 그 블록 고점)
      breakLine: null,
      upT: state === 'up' ? upT : null, upP: state === 'up' ? upP : null, pullNo: state === 'up' ? pull : 0,
      buyOK: false, firstBear: false, doubleTop: false, sellBounce: false, accel: false,
      events
    };
    if (cur && cur.dir === 'bear') {
      summary.holdLine = prevBull ? prevBull.lo : null;
      summary.breakLine = cur.hi;
    } else if (cur && cur.dir === 'bull') {
      summary.holdLine = prevBull ? prevBull.lo : null;   // 지금까지 적용되던 선
      summary.holdLineNext = cur.lo;                      // 다음 음봉부터
      summary.breakLine = prevBear ? prevBear.hi : null;
    }
    const lastEv = events.length ? events[events.length - 1] : null;
    if (lastEv && lastEv.i === bars.length - 1) {
      if (lastEv.type === 'buy') { summary.buyOK = !lastEv.blocked; summary.firstBear = !!lastEv.first; summary.doubleTop = !!lastEv.blocked; }
      if (lastEv.type === 'doubleTop') { summary.doubleTop = true; }
      if (lastEv.type === 'sellBounce') summary.sellBounce = true;
    }
    // 쌍봉 경고가 현재 음봉블록에 걸려있는지
    if (cur && cur.dir === 'bear' && dtWarnedBlockStart === cur.start) summary.doubleTop = true;
    // 하락 상태 + 현재 양봉이면 반등 매도
    if (state === 'down' && cur && cur.dir === 'bull') summary.sellBounce = true;
    if (state === 'down' && cur && cur.dir === 'bear') {
      const acc = events.filter(e => e.type === 'accel' && e.i >= cur.start);
      summary.accel = acc.length > 0;
    }
    // 상승 상태 + 현재 음봉 + 보유선 유지면 매수 가능
    if (state === 'up' && cur && cur.dir === 'bear' && summary.holdLine != null && last.c >= summary.holdLine) {
      summary.buyOK = !summary.doubleTop; summary.firstBear = cur.n === 1;
    }
    summary.blocks = blocks.concat(cur ? [cur] : []);
    return summary;
  }

  // 과거 신호 성과 — 파는 건 둘 다 같다: 음봉이 앞 양봉 저가 깬 뒤 첫 양봉 종가
  //   mode 'turn' : 양봉 종가가 앞 음봉 고가 넘은 그 봉 종가에 산다 (상승 한 번에 1회)
  //   mode 'bear' : 상승 중 음봉 덩어리 첫 봉 종가마다 산다 (쌍봉 경고 걸린 건 안 삼)
  //   cost        : 왕복 비용(%) — 수익률에서 뺀다
  function performance(bars, summary, maxRows, mode, cost) {
    mode = mode || 'turn'; cost = cost || 0;
    const ev = summary.events;
    const trades = [];
    let opens = [];
    const exitAfter = (i) => { for (let j = i + 1; j < bars.length; j++) if (bars[j].c >= bars[j].o) return j; return -1; };
    for (let k = 0; k < ev.length; k++) {
      const e = ev[k];
      if (mode === 'turn' && e.type === 'up' && !opens.length) opens.push({ ei: e.i, et: e.t, ep: e.price });
      else if (mode === 'bear' && e.type === 'buy' && e.first && !e.blocked) opens.push({ ei: e.i, et: e.t, ep: e.price, nth: e.nth });
      else if (e.type === 'down' && opens.length) {
        const xi = exitAfter(e.i);
        if (xi < 0) { opens.forEach(o => trades.push({ ...o, xi: bars.length - 1, xt: bars[bars.length - 1].t, xp: bars[bars.length - 1].c, openTrade: true, note: '매도 대기' })); opens = []; break; }
        opens.forEach(o => trades.push({ ...o, xi, xt: bars[xi].t, xp: bars[xi].c }));
        opens = [];
      }
    }
    opens.forEach(o => trades.push({ ...o, xi: bars.length - 1, xt: bars[bars.length - 1].t, xp: bars[bars.length - 1].c, openTrade: true, note: '보유 중' }));
    trades.forEach(t => { t.pct = (t.xp / t.ep - 1) * 100 - cost; t.bars = t.xi - t.ei; });
    const stats = statsOf(trades);
    return { trades: trades.slice(-(maxRows || 8)).reverse(), allTrades: trades, stats, total: trades.length };
  }

  // 끝난 매매만으로 성적 (since: 'YYYYMMDD' 이후 산 것만)
  function statsOf(trades, since) {
    const closed = trades.filter(t => !t.openTrade && (!since || t.et >= since));
    if (!closed.length) return null;
    const pcts = closed.map(t => t.pct).sort((a, b) => a - b);
    const gw = closed.filter(t => t.pct > 0).reduce((a, t) => a + t.pct, 0), gl = -closed.filter(t => t.pct <= 0).reduce((a, t) => a + t.pct, 0);
    return {
      n: closed.length,
      win: closed.filter(t => t.pct > 0).length / closed.length * 100,
      avg: closed.reduce((a, t) => a + t.pct, 0) / closed.length,
      med: pcts[Math.floor(pcts.length / 2)],
      pf: gl > 0 ? gw / gl : (gw > 0 ? 99 : 0),
      avgBars: closed.reduce((a, t) => a + t.bars, 0) / closed.length
    };
  }

  // 월봉 게이트 판정
  function monthlyGate(m) {
    if (!m || m.state === 'none') return { code: 'wait', label: '월봉 판정 대기' };
    if (m.state === 'down') return { code: 'closed', label: '월봉 하락 중 — 현금' };
    if (m.lastDir === 'bear' && m.holdLine != null && m.lastBar.c < m.holdLine) return { code: 'closed', label: '이번 달 음봉이 양봉 저가 깨는 중' };
    if (m.doubleTop) return { code: 'caution', label: '월봉 음봉 고가 낮아짐(쌍봉) — 비중 절반' };
    return { code: 'open', label: m.lastDir === 'bull' ? '월봉 양봉 — 매매 해도 됨' : '월봉 음봉 눌림 — 매매 해도 됨' };
  }

  // 종합 판정 (월봉 = 시황, 주봉 = 상태, 일봉 = 타이밍) — 쉬운 말로
  function combine(daily, weekly, monthly) {
    const w = weekly.state, d = daily.state;
    let code, title, detail;
    const mg = monthlyGate(monthly);
    if (monthly && mg.code === 'closed') {
      return { code: 'out', title: '사지 마라 — 월봉이 하락', detail: `${mg.label}. 월봉 양봉이 앞 음봉 고가 ${fmt(monthly.breakLine)}을 넘을 때까지 새로 안 산다. 들고 있는 건 일봉 양봉 반등에 정리.`, gate: mg };
    }
    if (w === 'none' || d === 'none') {
      code = 'wait'; title = '아직 판정 없음'; detail = '양봉이 음봉을 이기거나 음봉이 양봉을 깬 적이 한 번도 없다. 데이터가 더 쌓여야 한다.';
    } else if (w === 'up') {
      if (d === 'up') {
        if (daily.buyOK) {
          code = 'buy'; title = daily.firstBear ? '산다 — 오늘 첫 음봉' : '산다 — 음봉 눌림';
          detail = `주봉·일봉 다 상승 중. 오늘 음봉인데 앞 양봉 저가 ${fmt(daily.holdLine)}는 안 깼다. 오늘 종가나 그 아래 아무 데서나 산다.`;
        } else if (daily.doubleTop) {
          code = 'hold'; title = '들고만 있어라 — 더 안 산다';
          detail = `일봉 음봉 고가가 낮아졌다(쌍봉). 앞 양봉 저가 ${fmt(daily.holdLine)} 안 깨지면 그냥 든다. 추가 매수는 없다.`;
        } else {
          code = 'hold'; title = '들고 있어라 — 양봉 중';
          detail = `오늘 양봉이라 살 자리 아니다. 다음 음봉이 ${fmt(daily.holdLineNext ?? daily.holdLine)} 위에서 끝나면 그때 산다.`;
        }
      } else {
        code = 'sell'; title = daily.sellBounce ? '판다 — 지금 양봉 반등' : '판다 — 양봉 반등 오면';
        detail = `주봉은 상승인데 일봉은 음봉이 양봉을 깼다. 일봉대로 양봉 반등에 판다. 일봉 양봉이 ${fmt(daily.breakLine)} 넘으면 다시 산다.` + (daily.accel ? ' ⚠ 양봉이 앞 음봉 못 이기고 또 음봉 — 더 큰 음봉 올 수 있다.' : '');
      }
    } else {
      if (d === 'down') {
        code = 'out'; title = '현금 — 손 떼라';
        detail = `주봉·일봉 다 하락 중. 주봉 양봉이 앞 음봉 고가 ${fmt(weekly.breakLine)} 넘을 때까지 안 산다.` + ((daily.accel || weekly.accel) ? ' ⚠ 더 큰 음봉 올 수 있다.' : '');
      } else {
        code = 'nobuy'; title = '새로 사지 마라';
        detail = `주봉 음봉이 앞 양봉 저가를 깼다. 들고 있는 건 일봉이 깨질 때(앞 양봉 저가 ${fmt(daily.holdLine)}) 양봉 반등에 판다. 음봉에 던지지 않는다.`;
      }
    }
    if (mg.code === 'caution') detail = `월봉 음봉 고가가 낮아졌다(쌍봉) — 비중은 평소 절반. ` + detail;
    return { code, title, detail, gate: mg };
  }

  function fmt(n) { return n == null ? '-' : Math.round(n).toLocaleString('ko-KR'); }

  return { fromNaver, analyze, combine, monthlyGate, performance, statsOf, fmt };
});
