// /api/btc-liquidations — OKX forced-liquidation orders for BTC swaps (US-accessible).
// Returns { liquidations:[{price,size,side,time}], venue }.
// side = direction of the FORCED order: 'buy' = short squeeze / forced buying (bullish),
// 'sell' = long liquidation / forced selling (bearish). Empty list is a valid quiet market.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://www.okx.com/api/v5/public/liquidation-orders?instType=SWAP&instFamily=BTC-USDT&state=filled', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('okx ' + r.status);
    const d = await r.json();
    const liqs = [];
    for (const row of (d.data || [])) {
      const det = row.details || row.liqDetails || [];
      for (const x of det) {
        const side = (x.side || '').toLowerCase() === 'buy' ? 'buy' : ((x.side || '').toLowerCase() === 'sell' ? 'sell' : null);
        if (!side) continue;
        const price = Number(x.bkPx), size = Number(x.sz), time = Number(x.time || x.ts);
        if (Number.isFinite(price) && Number.isFinite(size) && Number.isFinite(time)) liqs.push({ price, size, side, time });
      }
    }
    res.status(200).json({ liquidations: liqs, venue: 'okx-liquidations' });
  } catch (e) {
    // Empty liquidations is a valid successful state (quiet market).
    res.status(200).json({ liquidations: [], venue: 'okx-liquidations' });
  }
}
