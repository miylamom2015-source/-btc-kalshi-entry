// /api/btc-perp — BTC perpetual futures trades (taker/aggressor side, server-corrected).
// OKX (BTC-USDT-SWAP) primary — US-accessible; Binance/Bybit as fallbacks.
// Returns { trades:[{price,size,side,time}], venue }.
// side = TAKER direction: 'buy' = aggressive buying (bullish), 'sell' = aggressive selling (bearish).
async function fromOkx(){
  const r = await fetch('https://www.okx.com/api/v5/market/trades?instId=BTC-USDT-SWAP&limit=100', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('okx ' + r.status);
  const d = await r.json();
  const trades = (d.data || []).map(t => ({
    price: Number(t.px), size: Number(t.sz), side: (t.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell', time: Number(t.ts)
  })).filter(x => Number.isFinite(x.price) && Number.isFinite(x.size) && Number.isFinite(x.time));
  if (!trades.length) throw new Error('no trades');
  return { trades, venue: 'okx-perp' };
}
async function fromBinance(){
  const r = await fetch('https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&limit=200', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('binance ' + r.status);
  const d = await r.json();
  const trades = (Array.isArray(d) ? d : []).map(t => ({
    price: Number(t.p), size: Number(t.q), side: t.m ? 'sell' : 'buy', time: t.T
  })).filter(x => Number.isFinite(x.price) && Number.isFinite(x.size) && Number.isFinite(x.time));
  if (!trades.length) throw new Error('no trades');
  return { trades, venue: 'binance-perp' };
}
async function fromBybit(){
  const r = await fetch('https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=BTCUSDT&limit=200', { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('bybit ' + r.status);
  const d = await r.json();
  const list = (d.result && d.result.list) || [];
  const trades = list.map(t => ({
    price: Number(t.price), size: Number(t.size), side: (t.side || '').toLowerCase() === 'buy' ? 'buy' : 'sell', time: Number(t.time)
  })).filter(x => Number.isFinite(x.price) && Number.isFinite(x.size) && Number.isFinite(x.time));
  if (!trades.length) throw new Error('no trades');
  return { trades, venue: 'bybit-perp' };
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=10');
  res.setHeader('Access-Control-Allow-Origin', '*');
  for (const fn of [fromOkx, fromBinance, fromBybit]) {
    try {
      const out = await fn();
      if (out.trades && out.trades.length) return res.status(200).json(out);
    } catch (e) { /* try next */ }
  }
  res.status(502).json({ error: 'all perp sources unavailable', trades: [] });
}
