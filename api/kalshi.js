export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { series_ticker, status = 'open', limit = '10' } = req.query;

  if (!series_ticker) {
    res.status(400).json({ error: 'series_ticker is required' });
    return;
  }

  const bases = [
    'https://api.elections.kalshi.com/trade-api/v2/markets',
    'https://external-api.kalshi.com/trade-api/v2/markets',
  ];

  const params = new URLSearchParams({ series_ticker, status, limit }).toString();

  let lastError = null;
  for (const base of bases) {
    try {
      const upstream = await fetch(base + '?' + params, {
        headers: { 'Accept': 'application/json' },
      });
      if (!upstream.ok) {
        lastError = 'kalshi http ' + upstream.status;
        continue;
      }
      const data = await upstream.json();
      res.setHeader('Cache-Control', 's-maxage=5, stale-while-revalidate=15');
      res.status(200).json(data);
      return;
    } catch (e) {
      lastError = e.message || String(e);
    }
  }

  res.status(502).json({ error: 'kalshi upstream unavailable', detail: lastError });
}
