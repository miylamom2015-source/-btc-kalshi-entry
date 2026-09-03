// /api/btc-hourly — Kalshi HOURLY BTC strike ladder near the current price (KXBTC series).
// Hard prerequisite for the dashboard's normal/lotto entry locks.
//
// Kalshi hourly markets come in "above" (-T) and "below" (-B) variants per strike. Near the
// live price almost all listed markets are "below" (B) markets, so to build a coherent
// "P(BTC settles ABOVE strike at hour close)" ladder we take BOTH variants and convert:
//   - T market: P(above) = raw yesProb
//   - B market: P(above) = 1 - raw yesProb   (its yes is P(below))
// The dashboard reads yesProb = (yesBid+yesAsk)/2 as P(above) and derives thesisDir, so
// yes% < 50% => leaning DOWN, yes% > 50% => leaning UP — direction reads true.
//
// We only return strikes within +/-5% of the live BTC price so the ladder tracks the
// price-to-beat (the dashboard picks the strike nearest the 15m round's floor_strike).
//
// Returns { strikes:[{strike,yesBid,yesAsk}], eventTicker, closeTime }.
function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    // Live BTC price to scope which strikes are "near the price-to-beat".
    let refPrice = null;
    try {
      const pr = await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker', { headers: { Accept: 'application/json' } });
      if (pr.ok) { const pd = await pr.json(); refPrice = toNum(pd.price); }
    } catch (_) { /* fall back to returning all strikes */ }

    const r = await fetch('https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&status=open&limit=1000', { headers: { Accept: 'application/json' } });
    if (!r.ok) return res.status(502).json({ error: 'kalshi ' + r.status, strikes: [] });
    const d = await r.json();
    const ms = Array.isArray(d.markets) ? d.markets : [];

    const byStrike = new Map();
    for (const m of ms) {
      const t = m.ticker || '';
      const isT = t.indexOf('-T') !== -1;
      const isB = t.indexOf('-B') !== -1;
      if (!isT && !isB) continue;
      const strike = m.floor_strike != null ? toNum(m.floor_strike) : (m.floor_strike_dollars != null ? parseFloat(m.floor_strike_dollars) : null);
      if (strike == null) continue;
      const yesBidRaw = m.yes_bid_dollars != null ? parseFloat(m.yes_bid_dollars) : (m.yes_bid != null ? m.yes_bid / 100 : null);
      const yesAskRaw = m.yes_ask_dollars != null ? parseFloat(m.yes_ask_dollars) : (m.yes_ask != null ? m.yes_ask / 100 : null);
      if (yesBidRaw == null && yesAskRaw == null) continue;
      const rawYes = (yesBidRaw != null && yesAskRaw != null) ? (yesBidRaw + yesAskRaw) / 2 : (yesBidRaw ?? yesAskRaw);
      if (rawYes == null) continue;
      // Convert to P(above strike): T keeps it, B inverts (yes is P(below)).
      const pAbove = isT ? rawYes : (1 - rawYes);
      // Dedupe by strike (prefer the entry with a real spread); nearest-strike lookup only needs one.
      const prev = byStrike.get(strike);
      if (!prev || (yesBidRaw != null && yesAskRaw != null && prev.yesBid === prev.yesAsk)) {
        byStrike.set(strike, { strike, yesBid: pAbove, yesAsk: pAbove });
      }
    }

    let strikes = [...byStrike.values()];
    if (refPrice != null && refPrice > 0) {
      const lo = refPrice * 0.95, hi = refPrice * 1.05;
      strikes = strikes.filter(s => s.strike >= lo && s.strike <= hi);
    }
    strikes.sort((a, b) => a.strike - b.strike);
    if (!strikes.length) return res.status(502).json({ error: 'no near-price hourly strikes', strikes: [] });

    // eventTicker / closeTime from the soonest-closing market (the current hourly window).
    const byClose = ms.map(m => ({ m, c: Date.parse(m.close_time || m.expiration_time || m.latest_expiration_time || '') })).filter(x => !isNaN(x.c));
    byClose.sort((a, b) => a.c - b.c);
    const ref = byClose.length ? byClose[0].m : (ms[0] || {});
    res.status(200).json({ strikes, eventTicker: ref.event_ticker || null, closeTime: ref.close_time || ref.expiration_time || null });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e), strikes: [] });
  }
}
