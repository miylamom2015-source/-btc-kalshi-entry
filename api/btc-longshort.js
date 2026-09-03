// /api/btc-longshort — BTC taker buy/sell volume ratio from OKX (US-accessible).
// OKX's long/short account-ratio endpoint was deprecated, so we derive a buy/sell volume
// ratio from OKX rubik taker-volume: ratio = buyVol/sellVol (>1 = more aggressive buying).
// This aligns with the dashboard's "rising ratio = more longs building = UP" logic.
// Returns { points:[{t,ratio}], venue }.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=10, stale-while-revalidate=30');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=BTC&instType=CONTRACTS&period=5m', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('okx ' + r.status);
    const d = await r.json();
    const rows = d.data || [];
    // OKX returns arrays: [ts, buyVol, sellVol]
    const points = rows.map(rw => {
      if (!Array.isArray(rw) || rw.length < 3) return null;
      const t = Number(rw[0]), buyVol = Number(rw[1]), sellVol = Number(rw[2]);
      if (!Number.isFinite(t) || !Number.isFinite(buyVol) || !Number.isFinite(sellVol) || sellVol <= 0) return null;
      return { t, ratio: buyVol / sellVol };
    }).filter(Boolean);
    if (!points.length) throw new Error('no points');
    res.status(200).json({ points, venue: 'okx-longshort' });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e), points: [] });
  }
}
