const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'pctrack-secret-2025';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch {
    return null;
  }
}

function getTokenFromEvent(event) {
  const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  // also check cookie
  const cookies = event.headers['cookie'] || '';
  const match = cookies.match(/pctrack_token=([^;]+)/);
  return match ? match[1] : null;
}

function requireAuth(event) {
  const token = getTokenFromEvent(event);
  if (!token) return null;
  return verifyToken(token);
}

function cors(body, statusCode = 200, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

module.exports = { signToken, verifyToken, requireAuth, cors, uid };
