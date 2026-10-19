// 종목명 자동완성 프록시 — /api/search?q=삼성
const H = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' };
exports.handler = async (event) => {
  const q = (event.queryStringParameters || {}).q || '';
  if (!q.trim()) return { statusCode: 200, headers: H, body: '[]' };
  try {
    const r = await fetch(`https://ac.stock.naver.com/ac?q=${encodeURIComponent(q)}&target=stock`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const j = await r.json();
    const items = (j.items || []).filter(x => x.nationCode === 'KOR' && /^\d{6}$/.test(x.code))
      .map(x => ({ code: x.code, name: x.name, market: x.typeName }));
    return { statusCode: 200, headers: H, body: JSON.stringify(items.slice(0, 10)) };
  } catch (e) {
    return { statusCode: 502, headers: H, body: JSON.stringify({ error: String(e.message || e) }) };
  }
};
