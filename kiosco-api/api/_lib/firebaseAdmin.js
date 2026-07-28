'use strict';

const admin = require('firebase-admin');

function readCredential() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    const serviceAccount = JSON.parse(raw);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    return admin.credential.cert(serviceAccount);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Firebase Admin credentials are not configured');
  }

  return admin.credential.cert({ projectId, clientEmail, privateKey });
}

function getAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: readCredential(),
      projectId: process.env.FIREBASE_PROJECT_ID || undefined
    });
  }
  return admin;
}

function getDb() {
  return getAdmin().firestore();
}

module.exports = { getAdmin, getDb };
