// Vercel Serverless Function: /api/auth
import crypto from 'crypto';

const DEFAULT_AUTH_PIN = process.env.REMOTE_AUTH_PIN || '124580';

export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const { pin } = req.body || {};
    if (typeof pin === 'string' && pin.trim() === DEFAULT_AUTH_PIN) {
      const token = `tok_${crypto.randomBytes(16).toString('hex')}`;
      return res.status(200).json({
        success: true,
        token,
        message: 'Remote control authorization granted',
      });
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid Security PIN. Authorization rejected.',
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload',
    });
  }
}
