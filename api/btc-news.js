// /api/btc-news — Bitcoin news headlines (display-only; not a consensus vote).
// Returns { items:[{title,pubDate,link}] }.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const r = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent('https://cointelegraph.com/rss/tag/bitcoin'), { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('rss ' + r.status);
    const d = await r.json();
    const items = (d.items || []).slice(0, 15).map(x => ({ title: x.title, pubDate: x.pubDate, link: x.link })).filter(x => x.title);
    if (!items.length) throw new Error('no items');
    res.status(200).json({ items });
  } catch (e) {
    res.status(502).json({ error: String(e && e.message || e) });
  }
}
