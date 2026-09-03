// /api/chat — stub. Bot logic runs client-side; chat is not needed for paper trading.
export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({ reply: '[paper mode] Live chat is disabled in this Vercel preview. The bot entry/exit logic runs entirely in your browser against simulated paper positions.' });
}
