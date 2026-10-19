// 네이버 금융 차트 API 프록시 — /api/ohlc?code=005930&tf=day|week
const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=300' };
function ymd(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const code = String(q.code || '').replace(/[^0-9A-Za-z]/g, '');
  const tf = q.tf === 'week' ? 'week' : (q.tf === 'month' ? 'month' : 'day');
  if (!/^\d{6}$/.test(code)) return { statusCode: 400, headers: H, body: JSON.stringify({ error: '종목코드 6자리가 필요합니다' }) };
  const end = new Date(); end.setDate(end.getDate() + 1);
  const start = new Date(); start.setFullYear(start.getFullYear() - (tf === 'day' ? 3 : tf === 'week' ? 10 : 25));
  const url = `https://api.stock.naver.com/chart/domestic/item/${code}/${tf}?startDateTime=${ymd(start)}0000&endDateTime=${ymd(end)}0000`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } });
    if (!r.ok) return { statusCode: 502, headers: H, body: JSON.stringify({ error: `네이버 응답 ${r.status}` }) };
    const rows = await r.json();
    const bars = (Array.isArray(rows) ? rows : []).map(x => ({
      t: String(x.localDate), o: +x.openPrice, h: +x.highPrice, l: +x.lowPrice, c: +x.closePrice, v: +(x.accumulatedTradingVolume || 0)
    })).filter(b => b.o > 0 && b.c > 0);
    return { statusCode: 200, headers: H, body: JSON.stringify({ code, tf, bars, fetchedAt: new Date().toISOString() }) };
  } catch (e) {
    return { statusCode: 502, headers: H, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
