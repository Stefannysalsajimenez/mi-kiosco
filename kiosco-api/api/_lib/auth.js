'use strict';

const { getAdmin } = require('./firebaseAdmin');

function configuredAdminUids() {
  return new Set(String(process.env.ADMIN_UIDS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean));
}

async function requireAdmin(req) {
  const header = String(req.headers.authorization || '');
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    const error = new Error('Missing Firebase ID token');
    error.statusCode = 401;
    throw error;
  }

  let decoded;
  try {
    decoded = await getAdmin().auth().verifyIdToken(match[1], true);
  } catch {
    const error = new Error('Invalid or revoked Firebase ID token');
    error.statusCode = 401;
    throw error;
  }

  const allowedUids = configuredAdminUids();
  const authorized = decoded.admin === true || allowedUids.has(decoded.uid);
  if (!authorized) {
    const error = new Error('Administrator privileges are required');
    error.statusCode = 403;
    throw error;
  }

  return decoded;
}

module.exports = { requireAdmin };
