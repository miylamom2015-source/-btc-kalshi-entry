// /api/kalshi-ws-ticker — reliable server-side current 15m Kalshi market (KXBTC15M).
// Replaces the flaky allorigins/codetabs client-side proxy as the fast path.
// Returns { connected, marketTicker, floorStrike, yesBid, yesAsk, ageMs, closeMs }.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=3');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC15M&status=open&limit=10', { headers: { Accept: 'application/json' } });
    if (!r.ok) return res.status(200).json({ connected: false });
    const d = await r.json();
    const ms = (Array.isArray(d.markets) ? d.markets : [])
      .map(m => ({ m, closeMs: Date.parse(m.close_time || m.expiration_time || m.latest_expiration_time || '') }))
      .filter(x => !isNaN(x.closeMs));
    if (!ms.length) return res.status(200).json({ connected: false });
    ms.sort((a, b) => a.closeMs - b.closeMs);
    const m = ms[0].m;
    const floorStrike = m.floor_strike != null ? Number(m.floor_strike) : (m.floor_strike_dollars != null ? parseFloat(m.floor_strike_dollars) : null);
    const yesBid = m.yes_bid_dollars != null ? parseFloat(m.yes_bid_dollars) : (m.yes_bid != null ? m.yes_bid / 100 : null);
    const yesAsk = m.yes_ask_dollars != null ? parseFloat(m.yes_ask_dollars) : (m.yes_ask != null ? m.yes_ask / 100 : null);
    res.status(200).json({ connected: true, marketTicker: m.ticker, floorStrike, yesBid, yesAsk, ageMs: 0, closeMs: ms[0].closeMs });
  } catch (e) {
    res.status(200).json({ connected: false });
  }
}
