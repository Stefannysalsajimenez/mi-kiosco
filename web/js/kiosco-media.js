'use strict';

(() => {
  const MAX_INPUT_BYTES = 10 * 1024 * 1024;
  const MAX_OUTPUT_BYTES = 800 * 1024;
  const TARGET_OUTPUT_BYTES = 500 * 1024;
  const MAX_DIMENSION = 1600;
  const REPOSITORY_PREFIX = 'repo:';
  const CLOUDINARY_PREFIX = 'cloudinary:'; // compatibilidad histórica
  const IMAGE_EXTENSIONS = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif', 'bmp', 'heic', 'heif',
    'tif', 'tiff', 'ico', 'jxl'
  ]);

  function sanitizeSegment(value, fallback = 'item') {
    const cleaned = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return cleaned || fallback;
  }

  function config() {
    const raw = window.KIOSCO_UPGRADE_CONFIG || {};
    const configured = String(raw.apiBaseUrl || '').trim().replace(/\/+$/, '');
    const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
    return {
      apiBaseUrl: configured || (isLocal ? 'http://localhost:3000' : ''),
      storeUrl: String(raw.storeUrl || location.origin || '').trim().replace(/\/+$/, ''),
      maxInputBytes: Math.max(1024 * 1024, Number(raw.mediaMaxInputBytes || MAX_INPUT_BYTES)),
      maxOutputBytes: Math.max(200 * 1024, Number(raw.mediaMaxOutputBytes || MAX_OUTPUT_BYTES)),
      targetOutputBytes: Math.max(120 * 1024, Number(raw.mediaTargetOutputBytes || TARGET_OUTPUT_BYTES)),
      maxDimension: Math.max(640, Number(raw.mediaMaxDimension || MAX_DIMENSION))
    };
  }

  function assertConfigured() {
    const current = config();
    if (!current.apiBaseUrl) {
      throw new Error('Configura apiBaseUrl en web/js/kiosco-upgrade-config.js para publicar imágenes en producción.');
    }
    return current;
  }

  async function validate(file, maxBytes = config().maxInputBytes) {
    if (!file || file.size === 0) throw new Error('Selecciona una imagen válida.');
    if (file.size > maxBytes) {
      throw new Error(`La imagen original no debe superar ${Math.round(maxBytes / 1024 / 1024)} MB.`);
    }

    const extension = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const mime = String(file.type || '').toLowerCase();
    if (!mime.startsWith('image/') && !IMAGE_EXTENSIONS.has(extension)) {
      throw new Error('El archivo seleccionado no es una imagen compatible.');
    }

    if (extension === 'svg' || mime === 'image/svg+xml') {
      const source = await file.text();
      if (!/<svg[\s>]/i.test(source) || /<script[\s>]/i.test(source) || /\son[a-z]+\s*=/i.test(source)) {
        throw new Error('El SVG contiene código no permitido.');
      }
    }
    return file;
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => resolve({ image, objectUrl });
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Tu navegador no puede procesar este formato. Prueba con JPG, PNG, WEBP o AVIF.'));
      };
      image.src = objectUrl;
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('No se pudo optimizar la imagen en este navegador.'));
          return;
        }
        resolve(blob);
      }, type, quality);
    });
  }

  function dimensions(width, height, maxDimension) {
    const largest = Math.max(width, height);
    if (!largest || largest <= maxDimension) return { width, height };
    const scale = maxDimension / largest;
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale))
    };
  }

  async function optimize(file, options = {}) {
    await validate(file, options.maxInputBytes || config().maxInputBytes);
    const current = config();
    const maxDimension = Number(options.maxDimension || current.maxDimension);
    const targetBytes = Number(options.targetBytes || current.targetOutputBytes);
    const maxOutputBytes = Number(options.maxOutputBytes || current.maxOutputBytes);
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    onProgress(5);
    const decoded = await loadImageFromBlob(file);
    try {
      const sourceWidth = decoded.image.naturalWidth || decoded.image.width;
      const sourceHeight = decoded.image.naturalHeight || decoded.image.height;
      if (!sourceWidth || !sourceHeight) throw new Error('No se pudieron leer las dimensiones de la imagen.');

      let size = dimensions(sourceWidth, sourceHeight, maxDimension);
      let best = null;
      const qualities = [0.84, 0.78, 0.72, 0.66, 0.60, 0.54];

      for (let scaleRound = 0; scaleRound < 4; scaleRound += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('El navegador no puede procesar imágenes con Canvas.');
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(decoded.image, 0, 0, size.width, size.height);

        for (let i = 0; i < qualities.length; i += 1) {
          onProgress(Math.min(38, 10 + scaleRound * 7 + i * 2));
          const candidate = await canvasToBlob(canvas, 'image/webp', qualities[i]);
          if (!best || candidate.size < best.blob.size) {
            best = { blob: candidate, width: size.width, height: size.height, quality: qualities[i] };
          }
          if (candidate.size <= targetBytes) break;
        }

        if (best?.blob.size <= maxOutputBytes) break;
        size = {
          width: Math.max(640, Math.round(size.width * 0.86)),
          height: Math.max(640, Math.round(size.height * 0.86))
        };
      }

      if (!best?.blob) throw new Error('No se pudo generar la imagen optimizada.');
      if (best.blob.size > maxOutputBytes) {
        throw new Error(`La imagen optimizada todavía supera ${Math.round(maxOutputBytes / 1024)} KB. Usa una imagen con menor complejidad.`);
      }

      onProgress(40);
      return {
        blob: best.blob,
        mimeType: 'image/webp',
        extension: 'webp',
        width: best.width,
        height: best.height,
        originalBytes: file.size,
        optimizedBytes: best.blob.size
      };
    } finally {
      URL.revokeObjectURL(decoded.objectUrl);
    }
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || '');
        const separator = value.indexOf(',');
        resolve(separator >= 0 ? value.slice(separator + 1) : value);
      };
      reader.onerror = () => reject(new Error('No se pudo preparar la imagen para enviarla.'));
      reader.readAsDataURL(blob);
    });
  }

  async function requestMedia(payload, options = {}) {
    const current = assertConfigured();
    const user = window.auth?.currentUser;
    if (!user) throw new Error('Debes iniciar sesión como administrador para gestionar imágenes.');
    const token = await user.getIdToken(true);
    const endpoint = `${current.apiBaseUrl}/api/media`;
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.timeout = Number(options.timeoutMs || 90000);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.addEventListener('progress', event => {
        if (!event.lengthComputable) return;
        const percent = 45 + Math.round((event.loaded / event.total) * 35);
        onProgress(Math.min(80, percent));
      });
      xhr.addEventListener('load', () => {
        let body = {};
        try { body = JSON.parse(xhr.responseText || '{}'); } catch { /* respuesta inválida */ }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(body?.error || `No se pudo publicar la imagen (HTTP ${xhr.status || 0}).`));
          return;
        }
        onProgress(100);
        resolve(body);
      });
      xhr.addEventListener('error', () => reject(new Error('No se pudo conectar con el backend de Kiosco.')));
      xhr.addEventListener('timeout', () => reject(new Error('La publicación tardó demasiado. Inténtalo nuevamente.')));
      xhr.addEventListener('abort', () => reject(new Error('La publicación fue cancelada.')));
      xhr.send(JSON.stringify(payload));
    });
  }

  async function upload(file, options = {}) {
    const current = config();
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};
    const optimized = await optimize(file, {
      maxInputBytes: options.maxBytes || current.maxInputBytes,
      maxOutputBytes: options.maxOutputBytes || current.maxOutputBytes,
      targetBytes: options.targetBytes || current.targetOutputBytes,
      maxDimension: options.maxDimension || current.maxDimension,
      onProgress
    });
    const contentBase64 = await blobToBase64(optimized.blob);
    onProgress(44);

    const result = await requestMedia({
      action: 'upload',
      scope: sanitizeSegment(options.scope || 'general', 'general'),
      entityId: sanitizeSegment(options.entityId || 'sin-id', 'sin-id'),
      filename: String(file.name || 'imagen').slice(0, 180),
      mimeType: optimized.mimeType,
      extension: optimized.extension,
      contentBase64,
      width: optimized.width,
      height: optimized.height,
      originalBytes: optimized.originalBytes,
      optimizedBytes: optimized.optimizedBytes
    }, { onProgress, timeoutMs: options.timeoutMs });

    return {
      url: result.url,
      path: result.path,
      commitSha: result.commitSha || null,
      commitUrl: result.commitUrl || null,
      mode: result.mode || 'repository',
      pendingDeploy: Boolean(result.pendingDeploy),
      bytes: optimized.optimizedBytes,
      originalBytes: optimized.originalBytes,
      width: optimized.width,
      height: optimized.height,
      format: optimized.extension
    };
  }

  async function remove(path, options = {}) {
    if (!isRepositoryPath(path)) return { ok: true, skipped: true };
    return requestMedia({ action: 'delete', path: String(path) }, options);
  }

  function repositoryPath(filePath) {
    const clean = String(filePath || '').replace(/^\/+/, '');
    return clean ? `${REPOSITORY_PREFIX}${clean}` : null;
  }

  function isRepositoryPath(path) {
    return String(path || '').startsWith(REPOSITORY_PREFIX);
  }

  function isCloudinaryPath(path) {
    return String(path || '').startsWith(CLOUDINARY_PREFIX);
  }

  function publicUrlForPath(path, version = '') {
    if (!isRepositoryPath(path)) return null;
    const raw = String(path).slice(REPOSITORY_PREFIX.length).replace(/^web\//, '');
    const relative = `/${raw.replace(/^\/+/, '')}`;
    const suffix = version ? `?v=${encodeURIComponent(version)}` : '';
    return `${relative}${suffix}`;
  }

  window.KioscoMedia = Object.freeze({
    MAX_INPUT_BYTES,
    MAX_OUTPUT_BYTES,
    TARGET_OUTPUT_BYTES,
    MAX_DIMENSION,
    validate,
    optimize,
    upload,
    remove,
    repositoryPath,
    isRepositoryPath,
    isCloudinaryPath,
    publicUrlForPath,
    config
  });
})();
