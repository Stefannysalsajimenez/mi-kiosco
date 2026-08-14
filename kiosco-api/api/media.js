'use strict';

const crypto = require('node:crypto');
const { requireAdmin } = require('./_lib/auth');
const { applyCors, json, readJson, safeError } = require('./_lib/http');

function requiredCloudinaryConfig() {
  const cloudName = String(process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const apiKey = String(process.env.CLOUDINARY_API_KEY || '').trim();
  const apiSecret = String(process.env.CLOUDINARY_API_SECRET || '').trim();

  if (!cloudName || !apiKey || !apiSecret) {
    const error = new Error('Cloudinary no está configurado en el backend');
    error.statusCode = 503;
    throw error;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(cloudName)) {
    const error = new Error('CLOUDINARY_CLOUD_NAME no es válido');
    error.statusCode = 500;
    throw error;
  }

  return { cloudName, apiKey, apiSecret };
}

function cleanSegment(value, fallback = 'item') {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  return cleaned || fallback;
}

function configuredAssetRoot() {
  const configured = String(process.env.CLOUDINARY_ASSET_FOLDER || 'kiosco/productos')
    .split('/')
    .map(segment => cleanSegment(segment, ''))
    .filter(Boolean)
    .join('/');

  return configured || 'kiosco/productos';
}

function filenameStem(filename) {
  const raw = String(filename || 'imagen');
  const withoutExtension = raw.replace(/\.[^.]+$/, '');
  return cleanSegment(withoutExtension, 'imagen').slice(0, 60);
}

function signatureFor(params, apiSecret) {
  const serialized = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');

  return crypto
    .createHash('sha1')
    .update(serialized + apiSecret)
    .digest('hex');
}

function validPublicId(value, assetRoot) {
  const publicId = String(value || '').trim();
  if (!publicId || publicId.length > 255) return false;
  return publicId.startsWith(`${assetRoot}/`);
}

async function destroyAsset({ cloudName, apiKey, apiSecret }, publicId) {
  const timestamp = Math.floor(Date.now() / 1000);
  const params = {
    invalidate: 'true',
    public_id: publicId,
    timestamp
  };

  const signature = signatureFor(params, apiSecret);
  const form = new URLSearchParams({
    ...params,
    api_key: apiKey,
    signature
  });

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: form
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Cloudinary rechazó la eliminación');
    error.statusCode = 502;
    throw error;
  }

  return payload;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST,OPTIONS')) return;

  res.setHeader('Cache-Control', 'no-store, max-age=0');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS');
    return json(res, 405, { error: `Método ${req.method} no permitido` });
  }

  try {
    await requireAdmin(req);
    const body = await readJson(req);
    const action = String(body?.action || '').trim();
    const config = requiredCloudinaryConfig();
    const assetRoot = configuredAssetRoot();

    if (action === 'sign-upload') {
      const productId = cleanSegment(body?.productId, 'sin-id');
      const stem = filenameStem(body?.filename);
      const timestamp = Math.floor(Date.now() / 1000);
      const nonce = crypto.randomBytes(4).toString('hex');
      const assetFolder = `${assetRoot}/${productId}`;
      const publicId = `${assetFolder}/${timestamp}-${nonce}-${stem}`;

      const signedParams = {
        asset_folder: assetFolder,
        public_id: publicId,
        timestamp
      };

      const signature = signatureFor(signedParams, config.apiSecret);

      return json(res, 200, {
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
        apiKey: config.apiKey,
        signature,
        signedParams
      });
    }

    if (action === 'destroy') {
      const publicId = String(body?.publicId || '').trim();
      if (!validPublicId(publicId, assetRoot)) {
        return json(res, 400, { error: 'Identificador de imagen inválido' });
      }

      const result = await destroyAsset(config, publicId);
      return json(res, 200, {
        ok: true,
        result: result?.result || 'ok'
      });
    }

    return json(res, 400, { error: 'Acción de medios no válida' });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: safeError(error) });
  }
};
