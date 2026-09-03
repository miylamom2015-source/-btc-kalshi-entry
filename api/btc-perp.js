// /api/btc-perp — BTC perpetual futures agg trades (taker/aggressor side, server-corrected).
// Binance USDS-M first, Bybit linear fallback. Returns { trades:[{price,size,side,time}], venue }.
// side is the TAKER direction: 'buy' = aggressive buying (bullish), 'sell' = aggressive selling (bearish).
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=10');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=200', { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('binance ' + r.status);
    const d = await r.json();
    const trades = (Array.isArray(d) ? d : []).map(t => ({
      price: Number(t.p), size: Number(t.q), side: t.m ? 'sell' : 'buy', time: t.T
    })).filter(x => Number.isFinite(x.price) && Number.isFinite(x.size) && Number.isFinite(x.time) && (x.side === 'buy' || x.side === 'sell'));
    if (trades.length) return res.status(200).json({ trades, venue: 'binance-perp' });
    throw new Error('no trades');
  } catch (e) {
    try {
      const r2 = await fetch('https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=BTCUSDT&limit=200', { headers: { Accept: 'application/json' } });
      if (!r2.ok) throw new Error('bybit ' + r2.status);
      const d2 = await r2.json();
      const list = (d2.result && d2.result.list) || [];
      const trades = list.map(t => ({
        price: Number(t.price), size: Number(t.size), side: (t.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell', time: Number(t.time)
      })).filter(x => Number.isFinite(x.price) && Number.isFinite(x.size) && Number.isFinite(x.time));
      return res.status(200).json({ trades, venue: 'bybit-perp' });
    } catch (e2) {
      res.status(502).json({ error: String(e2 && e2.message || e2), trades: [] });
    }
  }
}
