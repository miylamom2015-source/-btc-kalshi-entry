// /api/btc-longshort — Binance global long/short account ratio (BTCUSDT, 5m bars).
// Returns { points:[{t,ratio}], venue }. ratio = long/short (>1 = more longs).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=5m&limit=30', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('binance ' + r.status);
    const d = await r.json();
    const points = (Array.isArray(d) ? d : []).map(x => ({
      t: Number(x.timestamp), ratio: Number(x.longShortRatio)
    })).filter(x => Number.isFinite(x.t) && Number.isFinite(x.ratio) && x.ratio > 0);
    if (!points.length) throw new Error('no points');
    res.status(200).json({ points, venue: 'binance-longshort' });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e), points: [] });
  }
}
