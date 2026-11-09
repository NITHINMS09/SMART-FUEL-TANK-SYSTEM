// Vercel Serverless Function: /api/health

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    status: 'ONLINE',
    service: 'SMART_TANK_API',
    platform: 'Vercel_Serverless',
    timestamp: Date.now(),
  });
}
