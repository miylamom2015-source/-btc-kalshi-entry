// /api/btc-hourly — Kalshi HOURLY BTC strike ladder near the current price (KXBTC series).
// Hard prerequisite for the dashboard's normal/lotto entry locks.
//
// IMPORTANT — KXBTC hourly markets are RANGE markets, not above/below markets:
// Each -B market (e.g. KXBTC-26SEP0307-B77550, subtitle "$77,500 to 77,599.99") resolves YES
// when BTC lands in that $100 range [floor_strike, floor_strike+100) at the hour close. YES is
// NOT "BTC above the strike" and NOT "BTC below the strike" — it is P(BTC in that $100 bucket).
// Verified: a $70,000-strike market prices yes≈1¢ / no≈99¢, which only makes sense if YES means
// "in the $70,000-$70,099 range" (BTC is ~$77,500, so near-certain to be ABOVE $70,000 — a
// "yes=above" reading would be ~99¢, not 1¢).
//
// So a real directional read = P(BTC above a target) = the SUM of bucket probabilities for all
// ranges at or above that target (the $100 buckets are disjoint, so their probabilities add).
// This endpoint returns, per strike, the cumulative P(BTC >= strike) built that way — so the
// frontend's existing `upChance = yesProb*100` becomes a genuine "chance BTC settles above this
// strike" instead of the OLD broken "1 - P(in nearest bucket)" which was structurally biased
// toward UP and could print "UP 85%" while BTC was below the strike and falling.
//
// Returns { strikes:[{strike, yesBid, yesAsk}], eventTicker, closeTime } where yesBid/yesAsk =
// P(BTC >= strike) (same value on both — it's a derived cumulative, not a live spread).
function toNum(x){ const n = Number(x); return Number.isFinite(n) ? n : null; }
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    // Live BTC price to scope which strikes are "near the price-to-beat."
    let refPrice = null;
    try {
      const pr = await fetch('https://api.exchange.coinbase.com/products/BTC-USD/ticker', { headers: { Accept: 'application/json', 'User-Agent': 'btc-kalshi/1.0' } });
      if (pr.ok) { const pd = await pr.json(); refPrice = toNum(pd.price); }
    } catch (_) { /* fall back to returning all strikes */ }

    const r = await fetch('https://external-api.kalshi.com/trade-api/v2/markets?series_ticker=KXBTC&status=open&limit=1000', { headers: { Accept: 'application/json', 'User-Agent': 'btc-kalshi/1.0' } });
    if (!r.ok) return res.status(502).json({ error: 'kalshi ' + r.status, strikes: [] });
    const d = await r.json();
    const ms = Array.isArray(d.markets) ? d.markets : [];

    // 1) Pick the SOONEST-closing hourly event = the current hourly window. Mixing multiple open
    //    KXBTC events (the old behavior) is why bucket probabilities summed to ~1.9, not ~1.0.
    const nowMs = Date.now();
    const eventClose = new Map();
    for (const m of ms){
      const ev = m.event_ticker || '';
      if (!ev) continue;
      const c = Date.parse(m.close_time || m.expiration_time || m.latest_expiration_time || '');
      if (!isNaN(c) && c > nowMs){
        if (!eventClose.has(ev) || c < eventClose.get(ev)) eventClose.set(ev, c);
      }
    }
    let curEvent = null, curClose = Infinity;
    for (const [ev, c] of eventClose){ if (c < curClose){ curClose = c; curEvent = ev; } }
    if (!curEvent) return res.status(502).json({ error: 'no open hourly event', strikes: [] });

    // 2) Collect range buckets for the CURRENT event only. Each -B market is a $100 range
    //    [floor_strike, floor_strike+100); YES = P(BTC in that range at close).
    const buckets = []; // {strike, prob (raw yes midpoint, dust already zeroed)}
    for (const m of ms){
      if (m.event_ticker !== curEvent) continue;
      const t = m.ticker || '';
      if (t.indexOf('-B') === -1) continue; // only -B range markets exist in KXBTC hourly
      const strike = m.floor_strike != null ? toNum(m.floor_strike) : (m.floor_strike_dollars != null ? parseFloat(m.floor_strike_dollars) : null);
      if (strike == null) continue;
      const yb = m.yes_bid_dollars != null ? parseFloat(m.yes_bid_dollars) : (m.yes_bid != null ? m.yes_bid / 100 : null);
      const ya = m.yes_ask_dollars != null ? parseFloat(m.yes_ask_dollars) : (m.yes_ask != null ? m.yes_ask / 100 : null);
      if (yb == null && ya == null) continue;
      const yesMid = (yb != null && ya != null) ? (yb + ya) / 2 : (yb ?? ya);
      if (yesMid == null || yesMid <= 0) continue;
      // Dust cleanup: buckets with NO real bid AND only a one-cent ask are far-tail dust
      // (hundreds of 1¢ asks that inflated total mass to ~1.9). Zero them before normalizing.
      const isDust = (yb == null || yb <= 0) && (ya != null && ya <= 0.01);
      buckets.push({ strike, prob: isDust ? 0 : yesMid });
    }
    if (!buckets.length) return res.status(502).json({ error: 'no range buckets for current event', strikes: [] });

    // 3) Normalize over the non-dust mass so probabilities sum to 1.0.
    let mass = 0;
    for (const b of buckets) mass += b.prob;
    // FAIL CLOSED: if the cleaned mass is way off 1.0, the Kalshi data is partial/overlapping/
    // stale — do NOT fabricate confident above/below odds. Return empty so the frontend shows
    // UNAVAILABLE/WAIT and the entry gates stay closed (real-money-adjacent: better no read
    // than a wrong one). 0.70–1.30 tolerates a few edge buckets; anything beyond is corrupt.
    if (mass < 0.70 || mass > 1.30) return res.status(502).json({ error: 'hourly range data unreliable (mass ' + mass.toFixed(3) + ')', strikes: [] });
    if (mass <= 0) return res.status(502).json({ error: 'hourly range data unreliable (no mass)', strikes: [] });
    for (const b of buckets) b.prob /= mass;

    // 4) Cumulative P(BTC >= strike) per strike = Σ bucket prob for floors >= strike (disjoint
    //    $100 ranges add). Built top-down so each strike carries the mass at/above it.
    buckets.sort((a, b) => a.strike - b.strike);
    let run = 0;
    const aboveByStrike = new Map();
    for (let i = buckets.length - 1; i >= 0; i--){
      run += buckets[i].prob;
      aboveByStrike.set(buckets[i].strike, run); // P(BTC >= this strike)
    }

    let strikes = [...aboveByStrike.entries()].map(([strike, p]) => ({ strike, yesBid: p, yesAsk: p }));
    if (refPrice != null && refPrice > 0) {
      const lo = refPrice * 0.95, hi = refPrice * 1.05;
      strikes = strikes.filter(s => s.strike >= lo && s.strike <= hi);
    }
    strikes.sort((a, b) => a.strike - b.strike);
    if (!strikes.length) return res.status(502).json({ error: 'no near-price hourly strikes', strikes: [] });

    res.status(200).json({ strikes, eventTicker: curEvent, closeTime: new Date(curClose).toISOString() });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e), strikes: [] });
  }
}
