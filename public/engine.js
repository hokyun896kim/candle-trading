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
          state = 'up';
          events.push({ i, t: b.t, type: 'up', level: prevBear.hi, price: b.c });
        } else if (state === 'down' && prevBear) {
          // 하락 상태에서의 양봉 = 반등 매도 자리
          events.push({ i, t: b.t, type: 'sellBounce', level: prevBear.hi, price: b.c });
        }
      } else {
        // 음봉
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
            events.push({ i, t: b.t, type: 'buy', first: cur.n === 1, blocked: dt, level: prevBull.lo, price: b.c });
          }
        } else if (state === 'down' && prevBull && b.c < prevBull.lo) {
          // 이미 하락 상태인데 또 깸 — 기록만
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
      buyOK: false, firstBear: false, doubleTop: false, sellBounce: false,
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
    // 상승 상태 + 현재 음봉 + 보유선 유지면 매수 가능
    if (state === 'up' && cur && cur.dir === 'bear' && summary.holdLine != null && last.c >= summary.holdLine) {
      summary.buyOK = !summary.doubleTop; summary.firstBear = cur.n === 1;
    }
    summary.blocks = blocks.concat(cur ? [cur] : []);
    return summary;
  }

  // 2축 종합 판정 (주봉 = 상태, 일봉 = 타이밍)
  function combine(daily, weekly) {
    const w = weekly.state, d = daily.state;
    let code, title, detail;
    if (w === 'none' || d === 'none') {
      code = 'wait'; title = '판정 대기'; detail = '아직 전환 신호가 한 번도 안 나왔다. 데이터가 더 쌓여야 한다.';
    } else if (w === 'up') {
      if (d === 'up') {
        if (daily.buyOK) {
          code = 'buy'; title = daily.firstBear ? '매수 — 첫 음봉' : '매수 — 눌림 음봉';
          detail = `주봉 게이트 열림·보유선 유지. 일봉 음봉이 보유선(${fmt(daily.holdLine)}) 위에서 끝났다. 종가 또는 그 아래 아무 데나.`;
        } else if (daily.doubleTop) {
          code = 'hold'; title = '보유 — 추가매수 중단';
          detail = `일봉에 캔들 쌍봉 경고. 보유선(${fmt(daily.holdLine)})이 안 깨지면 그냥 든다. 더 사지는 않는다.`;
        } else {
          code = 'hold'; title = '보유 — 양봉 진행 중';
          detail = `일봉 양봉 중이라 살 자리 아니다. 다음 음봉이 ${fmt(daily.holdLineNext ?? daily.holdLine)} 위에서 끝나면 매수.`;
        }
      } else {
        code = 'sell'; title = '매도 — 양봉 반등에';
        detail = `주봉은 살아있지만 일봉이 하락 전환. 일봉대로 판다. 양봉 종가가 ${fmt(daily.breakLine)} 넘으면 재진입.`;
      }
    } else { // weekly down
      if (d === 'down') {
        code = 'out'; title = '현금 — 매매 금지';
        detail = `주봉·일봉 모두 하락. 주봉 양봉 종가가 ${fmt(weekly.breakLine)} 넘을 때까지 손 뗀다.`;
      } else {
        code = 'nobuy'; title = '신규 매수 중단';
        detail = `주봉 보유선이 깨졌다. 보유분은 일봉 매도신호(보유선 ${fmt(daily.holdLine)} 이탈) 기다려서 양봉에 판다. 음봉에 던지지 않는다.`;
      }
    }
    return { code, title, detail };
  }

  function fmt(n) { return n == null ? '-' : Math.round(n).toLocaleString('ko-KR'); }

  return { fromNaver, analyze, combine, fmt };
});
