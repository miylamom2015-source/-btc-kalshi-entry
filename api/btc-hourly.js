// /api/btc-hourly — Kalshi HOURLY BTC strike ladder (KXBTC series), ABOVE markets only.
// Hard prerequisite for the dashboard's normal/lotto entry locks.
//
// IMPORTANT: Kalshi hourly markets come in "above" (-T) and "below" (-B) variants per
// strike. We keep ONLY the "above" (T) markets, so each strike's yes% is always
// P(BTC settles ABOVE that strike at hour close). That makes the direction read
// correctly: yes% < 50% => leaning DOWN, yes% > 50% => leaning UP.
// (A "below" market's yes% is the complement and would invert the signal.)
//
// The dashboard picks the strike nearest the 15m round's price-to-beat and reads
// its % — e.g. price-to-beat 77850, nearest above-strike 77800 at 40% => leaning down.
//
// Returns { strikes:[{strike,yesBid,yesAsk}], eventTicker, closeTime }.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&status=open&limit=200', { headers: { Accept: 'application/json' } });
    if (!r.ok) return res.status(502).json({ error: 'kalshi ' + r.status, strikes: [] });
    const d = await r.json();
    const ms = Array.isArray(d.markets) ? d.markets : [];
    const strikes = [];
    for (const m of ms) {
      // Keep only "above" (T) markets — yes% = P(above strike), direction reads true.
      if (!m.ticker || m.ticker.indexOf('-T') === -1) continue;
      const strike = m.floor_strike != null ? Number(m.floor_strike) : (m.floor_strike_dollars != null ? parseFloat(m.floor_strike_dollars) : null);
      if (strike == null || !Number.isFinite(strike)) continue;
      const yesBid = m.yes_bid_dollars != null ? parseFloat(m.yes_bid_dollars) : (m.yes_bid != null ? m.yes_bid / 100 : null);
      const yesAsk = m.yes_ask_dollars != null ? parseFloat(m.yes_ask_dollars) : (m.yes_ask != null ? m.yes_ask / 100 : null);
      strikes.push({ strike, yesBid, yesAsk });
    }
    strikes.sort((a, b) => a.strike - b.strike);
    // eventTicker / closeTime from the soonest-closing market
    const byClose = ms.map(m => ({ m, c: Date.parse(m.close_time || m.expiration_time || m.latest_expiration_time || '') })).filter(x => !isNaN(x.c));
    byClose.sort((a, b) => a.c - b.c);
    const ref = byClose.length ? byClose[0].m : (ms[0] || {});
    res.status(200).json({ strikes, eventTicker: ref.event_ticker || null, closeTime: ref.close_time || ref.expiration_time || null });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e), strikes: [] });
  }
}
