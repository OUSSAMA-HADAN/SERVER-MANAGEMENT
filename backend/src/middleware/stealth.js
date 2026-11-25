/**
 * Hide everything behind login from anonymous visitors:
 *  - protected API routes answer 404 (not 401), so their existence is not revealed
 *  - dashboard JS/CSS chunks are only served to logged-in sessions; anonymous
 *    visitors receive just the login bundle (read from Vite's build manifest)
 */
const fs = require('fs');
const path = require('path');

const PUBLIC_API = new Set([
  '/api/auth/config',
  '/api/auth/login',
  '/api/auth/totp',
  '/api/auth/logout',
  '/api/auth/me',
]);

function notFound(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(404).json({ error: 'Not found' });
}

function apiGate(req, res, next) {
  if (req.session?.userId) return next();
  const p = req.path.replace(/\/+$/, '');
  if (PUBLIC_API.has(`/api${p}`)) return next();
  return notFound(res);
}

/** Files reachable from the entry chunk via static imports = the public login bundle. */
function publicAssetsFromManifest(distPath) {
  const manifestPath = path.join(distPath, '.vite', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const pub = new Set();
  const visit = (key) => {
    const chunk = manifest[key];
    if (!chunk || pub.has(`/${chunk.file}`)) return;
    pub.add(`/${chunk.file}`);
    (chunk.css || []).forEach((f) => pub.add(`/${f}`));
    (chunk.assets || []).forEach((f) => pub.add(`/${f}`));
    (chunk.imports || []).forEach(visit); // static imports only — dynamic ones stay private
  };
  Object.keys(manifest).filter((k) => manifest[k].isEntry).forEach(visit);
  return pub;
}

// Tell browsers AND Cloudflare's edge never to store a response.
function noStore(res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
}

function assetGate(distPath) {
  let publicAssets = null;
  let loadedAt = 0;
  return (req, res, next) => {
    if (!req.path.startsWith('/assets/') && !req.path.startsWith('/.vite')) return next();
    if (req.path.startsWith('/.vite')) { noStore(res); return res.status(404).end(); }
    // Reload the manifest after each rebuild.
    try {
      const mtime = fs.statSync(path.join(distPath, '.vite', 'manifest.json')).mtimeMs;
      if (!publicAssets || mtime !== loadedAt) {
        publicAssets = publicAssetsFromManifest(distPath);
        loadedAt = mtime;
      }
    } catch (e) {
      console.error('[stealth] cannot read build manifest — serving no private assets:', e.message);
      publicAssets = publicAssets || new Set();
    }
    if (publicAssets.has(req.path)) {
      // Login bundle: content-hashed file names, safe to cache forever.
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return next();
    }
    noStore(res); // private chunk: never cached anywhere
    if (req.session?.userId) return next();
    return res.status(404).end();
  };
}

module.exports = { apiGate, assetGate };
