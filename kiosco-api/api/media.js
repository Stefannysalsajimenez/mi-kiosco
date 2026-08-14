'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { requireAdmin } = require('./_lib/auth');
const { applyCors, json, readJson, safeError } = require('./_lib/http');

const MAX_MEDIA_BYTES = 900 * 1024;
const REPOSITORY_PREFIX = 'repo:';
const ALLOWED_SCOPES = new Set(['productos', 'branding']);
const ALLOWED_FORMATS = new Map([
  ['webp', 'image/webp'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png']
]);

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

function mediaMode() {
  const explicit = String(process.env.KIOSCO_MEDIA_MODE || '').trim().toLowerCase();
  if (explicit === 'local' || explicit === 'github') return explicit;
  return process.env.VERCEL ? 'github' : 'local';
}

function githubConfig() {
  const token = String(process.env.KIOSCO_GITHUB_TOKEN || '').trim();
  const repository = String(process.env.KIOSCO_GITHUB_REPOSITORY || '').trim();
  const branch = String(process.env.KIOSCO_GITHUB_BRANCH || 'main').trim() || 'main';
  if (!token || !repository || !repository.includes('/')) {
    const error = new Error('Configura KIOSCO_GITHUB_TOKEN y KIOSCO_GITHUB_REPOSITORY en el backend');
    error.statusCode = 503;
    throw error;
  }
  const [owner, repo] = repository.split('/', 2);
  if (!owner || !repo) {
    const error = new Error('KIOSCO_GITHUB_REPOSITORY debe tener el formato OWNER/REPO');
    error.statusCode = 500;
    throw error;
  }
  return { token, owner, repo, branch };
}

function publicStoreUrl() {
  return String(process.env.PUBLIC_STORE_URL || '').trim().replace(/\/+$/, '');
}

function pathFor(scope, entityId, extension) {
  if (!ALLOWED_SCOPES.has(scope)) {
    const error = new Error('Tipo de imagen no permitido');
    error.statusCode = 400;
    throw error;
  }
  const safeId = cleanSegment(entityId, 'sin-id');
  if (scope === 'branding') return `web/uploads/branding/logo.${extension}`;
  return `web/uploads/productos/${safeId}/image.${extension}`;
}

function repositoryPath(filePath) {
  return `${REPOSITORY_PREFIX}${filePath}`;
}

function parseRepositoryPath(value) {
  const raw = String(value || '');
  if (!raw.startsWith(REPOSITORY_PREFIX)) {
    const error = new Error('Ruta de imagen inválida');
    error.statusCode = 400;
    throw error;
  }
  const filePath = raw.slice(REPOSITORY_PREFIX.length).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!/^web\/uploads\/(productos\/[a-zA-Z0-9_-]+\/image\.(webp|jpg|jpeg|png)|branding\/logo\.(webp|jpg|jpeg|png))$/.test(filePath)) {
    const error = new Error('La ruta solicitada no pertenece a la carpeta de medios de Kiosco');
    error.statusCode = 400;
    throw error;
  }
  return filePath;
}

function decodeImage(body) {
  const extension = String(body?.extension || 'webp').toLowerCase();
  const expectedMime = ALLOWED_FORMATS.get(extension);
  if (!expectedMime) {
    const error = new Error('Formato optimizado no permitido');
    error.statusCode = 400;
    throw error;
  }
  const mimeType = String(body?.mimeType || '').toLowerCase();
  if (mimeType && mimeType !== expectedMime) {
    const error = new Error('El formato de la imagen no coincide con su tipo MIME');
    error.statusCode = 400;
    throw error;
  }
  const encoded = String(body?.contentBase64 || '');
  if (!encoded || !/^[a-zA-Z0-9+/=\s]+$/.test(encoded)) {
    const error = new Error('Contenido de imagen inválido');
    error.statusCode = 400;
    throw error;
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_MEDIA_BYTES) {
    const error = new Error(`La imagen optimizada debe pesar menos de ${Math.round(MAX_MEDIA_BYTES / 1024)} KB`);
    error.statusCode = 413;
    throw error;
  }
  if (!matchesMagicBytes(buffer, extension)) {
    const error = new Error('El archivo recibido no coincide con una imagen válida');
    error.statusCode = 400;
    throw error;
  }
  return { buffer, extension, mimeType: expectedMime };
}

function matchesMagicBytes(buffer, extension) {
  if (extension === 'webp') {
    return buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  if (extension === 'png') {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === 'jpg' || extension === 'jpeg') {
    return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
  }
  return false;
}

function publicPath(filePath) {
  return `/${filePath.replace(/^web\//, '')}`;
}

function deliveryUrl(filePath, version, mode) {
  const suffix = version ? `?v=${encodeURIComponent(String(version).slice(0, 16))}` : '';
  const relative = `${publicPath(filePath)}${suffix}`;
  if (mode === 'local') return relative;
  const base = publicStoreUrl();
  return base ? `${base}${relative}` : relative;
}

function localRepositoryRoot() {
  const configured = String(process.env.KIOSCO_REPO_ROOT || '').trim();
  const root = configured ? path.resolve(configured) : path.resolve(__dirname, '..', '..');
  const expected = path.join(root, 'web');
  if (!fs.existsSync(expected)) {
    const error = new Error(`No se encontró web/ en el repositorio local: ${root}`);
    error.statusCode = 500;
    throw error;
  }
  return root;
}

function safeLocalTarget(root, filePath) {
  const target = path.resolve(root, filePath);
  const allowedRoot = path.resolve(root, 'web', 'uploads') + path.sep;
  if (!target.startsWith(allowedRoot)) {
    const error = new Error('Ruta local de medios no permitida');
    error.statusCode = 400;
    throw error;
  }
  return target;
}

async function writeLocal(filePath, buffer) {
  const root = localRepositoryRoot();
  const target = safeLocalTarget(root, filePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
  const version = `${Date.now()}`;
  return {
    mode: 'local',
    path: repositoryPath(filePath),
    url: deliveryUrl(filePath, version, 'local'),
    pendingDeploy: false,
    bytes: buffer.length,
    commitSha: null,
    commitUrl: null
  };
}

async function deleteLocal(filePath) {
  const root = localRepositoryRoot();
  const target = safeLocalTarget(root, filePath);
  try { fs.unlinkSync(target); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { ok: true, mode: 'local', pendingDeploy: false };
}

function encodedGitHubPath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

async function githubFetch(config, method, filePath, body, query = '') {
  const url = `https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}/contents/${encodedGitHubPath(filePath)}${query}`;
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'kiosco-repository-media'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

async function githubFileMeta(config, filePath) {
  const result = await githubFetch(config, 'GET', filePath, undefined, `?ref=${encodeURIComponent(config.branch)}`);
  if (result.response.status === 404) return null;
  if (!result.response.ok) {
    const error = new Error(result.payload?.message || `GitHub rechazó la consulta (HTTP ${result.response.status})`);
    error.statusCode = result.response.status === 401 || result.response.status === 403 ? 503 : 502;
    throw error;
  }
  return result.payload;
}

async function putGitHubFile(config, filePath, buffer, message, retry = true) {
  const current = await githubFileMeta(config, filePath);
  const body = {
    message,
    content: buffer.toString('base64'),
    branch: config.branch
  };
  if (current?.sha) body.sha = current.sha;
  const result = await githubFetch(config, 'PUT', filePath, body);
  if (result.response.status === 409 && retry) {
    return putGitHubFile(config, filePath, buffer, message, false);
  }
  if (!result.response.ok) {
    const error = new Error(result.payload?.message || `GitHub rechazó la publicación (HTTP ${result.response.status})`);
    error.statusCode = result.response.status === 401 || result.response.status === 403 ? 503 : 502;
    throw error;
  }
  return result.payload;
}

async function deleteGitHubFile(config, filePath, message, retry = true) {
  const current = await githubFileMeta(config, filePath);
  if (!current?.sha) return { ok: true, notFound: true };
  const result = await githubFetch(config, 'DELETE', filePath, {
    message,
    sha: current.sha,
    branch: config.branch
  });
  if (result.response.status === 409 && retry) {
    return deleteGitHubFile(config, filePath, message, false);
  }
  if (!result.response.ok) {
    const error = new Error(result.payload?.message || `GitHub rechazó la eliminación (HTTP ${result.response.status})`);
    error.statusCode = result.response.status === 401 || result.response.status === 403 ? 503 : 502;
    throw error;
  }
  return { ok: true, payload: result.payload };
}

async function writeGitHub(filePath, buffer, scope, entityId) {
  const config = githubConfig();
  const label = scope === 'branding' ? 'store logo' : `product ${cleanSegment(entityId, 'sin-id')}`;
  const result = await putGitHubFile(config, filePath, buffer, `media: update ${label} image`);
  const commitSha = result?.commit?.sha || '';
  return {
    mode: 'github',
    path: repositoryPath(filePath),
    url: deliveryUrl(filePath, commitSha || Date.now(), 'github'),
    pendingDeploy: true,
    bytes: buffer.length,
    commitSha: commitSha || null,
    commitUrl: result?.commit?.html_url || null
  };
}

async function deleteGitHub(filePath) {
  const config = githubConfig();
  await deleteGitHubFile(config, filePath, `media: remove ${filePath}`);
  return { ok: true, mode: 'github', pendingDeploy: true };
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res, 'POST,OPTIONS')) return;
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST,OPTIONS');
    return json(res, 405, { error: `Método ${req.method} no permitido` });
  }

  try {
    const admin = await requireAdmin(req);
    const body = await readJson(req);
    const action = String(body?.action || '').trim();
    const mode = mediaMode();

    if (action === 'upload') {
      const scope = cleanSegment(body?.scope, 'general');
      const entityId = cleanSegment(body?.entityId, 'sin-id');
      const image = decodeImage(body);
      const filePath = pathFor(scope, entityId, image.extension);
      const result = mode === 'github'
        ? await writeGitHub(filePath, image.buffer, scope, entityId)
        : await writeLocal(filePath, image.buffer);
      return json(res, 200, {
        ok: true,
        ...result,
        width: Math.max(0, Number(body?.width || 0)),
        height: Math.max(0, Number(body?.height || 0)),
        uploadedBy: admin.uid
      });
    }

    if (action === 'delete') {
      const filePath = parseRepositoryPath(body?.path);
      const result = mode === 'github'
        ? await deleteGitHub(filePath)
        : await deleteLocal(filePath);
      return json(res, 200, result);
    }

    if (action === 'health') {
      return json(res, 200, {
        ok: true,
        mode,
        repositoryConfigured: mode === 'local' || Boolean(process.env.KIOSCO_GITHUB_TOKEN && process.env.KIOSCO_GITHUB_REPOSITORY)
      });
    }

    return json(res, 400, { error: 'Acción de medios no válida' });
  } catch (error) {
    return json(res, error.statusCode || 500, { error: safeError(error) });
  }
};
