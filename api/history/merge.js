// /api/history/merge — pass-through echo so client localStorage sync stays a no-op.
// Returns { roundHistory, lottoHistory, agentHistory } (deduped by t, newest-first, capped 200).
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const body = req.body || {};
  const pick = (x) => {
    if (!Array.isArray(x)) return [];
    const seen = new Set();
    const out = [];
    for (const r of x) {
      if (!r || r.t == null) continue;
      if (seen.has(r.t)) continue;
      seen.add(r.t);
      out.push(r);
    }
    out.sort((a, b) => (b.t || 0) - (a.t || 0));
    return out.slice(0, 200);
  };
  res.status(200).json({
    roundHistory: pick(body.roundHistory),
    lottoHistory: pick(body.lottoHistory),
    agentHistory: pick(body.agentHistory)
  });
}
