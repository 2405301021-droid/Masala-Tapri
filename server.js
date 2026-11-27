'use strict';
/**
 * Masala Tapri backend.
 * A dependency-free Node.js HTTP server that
 *   1. serves the static frontend from /frontend
 *   2. exposes a small JSON API (menu, contact form, health, admin message list)
 */
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const FRONTEND_DIR = __dirname;
const MAX_BODY_BYTES = 10 * 1024;
const TOPICS = ['General question', 'Office or bulk order', 'Event booking'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function createServer(options = {}) {
  const dataDir = options.dataDir || process.env.DATA_DIR || __dirname;
  const menuFile = path.join(dataDir, 'menu.json');
  const messagesFile = path.join(dataDir, 'messages.json');
  const adminToken = options.adminToken !== undefined ? options.adminToken : process.env.ADMIN_TOKEN;

  // Serialise writes so two simultaneous messages cannot overwrite each other
  let writeChain = Promise.resolve();
  function saveMessage(entry) {
    writeChain = writeChain.then(async () => {
      let list = [];
      try { list = JSON.parse(await fs.readFile(messagesFile, 'utf8')); } catch { list = []; }
      list.push(entry);
      await fs.mkdir(dataDir, { recursive: true });
      const tmp = messagesFile + '.tmp';
      await fs.writeFile(tmp, JSON.stringify(list, null, 2));
      await fs.rename(tmp, messagesFile);
    });
    return writeChain;
  }

  // Very small in-memory rate limit: 5 messages per 10 minutes per IP
  const hits = new Map();
  function rateLimited(ip) {
    const now = Date.now();
    const recent = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
    if (recent.length >= 5) { hits.set(ip, recent); return true; }
    recent.push(now); hits.set(ip, recent); return false;
  }

  function json(res, status, body) {
    const data = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(data),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY_BYTES) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  function validateContact(b) {
    const errors = {};
    const name = typeof b.name === 'string' ? b.name.trim() : '';
    const email = typeof b.email === 'string' ? b.email.trim() : '';
    const message = typeof b.message === 'string' ? b.message.trim() : '';
    const topic = TOPICS.includes(b.topic) ? b.topic : 'General question';
    if (name.length < 2 || name.length > 100) errors.name = 'Name must be 2 to 100 characters.';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
    if (message.length < 10 || message.length > 2000) errors.message = 'Message must be 10 to 2000 characters.';
    return { errors, value: { name, email, topic, message } };
  }

  async function handleApi(req, res, pathname) {
    if (pathname === '/api/health' && req.method === 'GET') {
      return json(res, 200, { status: 'ok', time: new Date().toISOString() });
    }
    if (pathname === '/api/menu' && req.method === 'GET') {
      return json(res, 200, JSON.parse(await fs.readFile(menuFile, 'utf8')));
    }
    if (pathname === '/api/contact') {
      if (req.method !== 'POST') return json(res, 405, { error: 'Use POST for this endpoint.' });
      if (rateLimited(req.socket.remoteAddress || 'unknown')) {
        return json(res, 429, { error: 'Too many messages. Please try again later.' });
      }
      let body;
      try { body = JSON.parse(await readBody(req)); } catch (e) {
        if (e.status === 413) return json(res, 413, { error: 'Message is too large.' });
        return json(res, 400, { error: 'Request body must be valid JSON.' });
      }
      const { errors, value } = validateContact(body && typeof body === 'object' ? body : {});
      if (Object.keys(errors).length) return json(res, 400, { error: 'Validation failed.', errors });
      const entry = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), createdAt: new Date().toISOString(), ...value };
      await saveMessage(entry);
      return json(res, 201, { ok: true, id: entry.id });
    }
    if (pathname === '/api/messages' && req.method === 'GET') {
      // Private: only available when ADMIN_TOKEN is set and supplied as a Bearer token
      if (!adminToken) return json(res, 403, { error: 'Admin access is not configured.' });
      if (req.headers.authorization !== `Bearer ${adminToken}`) return json(res, 401, { error: 'Unauthorized.' });
      let list = [];
      try { list = JSON.parse(await fs.readFile(messagesFile, 'utf8')); } catch { list = []; }
      return json(res, 200, list);
    }
    return json(res, 404, { error: 'API route not found.' });
  }

  async function serveStatic(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end();
    }
    let rel;
    try { rel = decodeURIComponent(pathname); } catch { rel = ''; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(FRONTEND_DIR, rel));
    const inside = file === FRONTEND_DIR || file.startsWith(FRONTEND_DIR + path.sep);
    let target = file;
    let status = 200;
    let data;
    try {
      if (!inside || rel.includes('\0')) throw new Error('outside');
      data = await fs.readFile(file);
    } catch {
      status = 404;
      target = path.join(FRONTEND_DIR, '404.html');
      data = await fs.readFile(target);
    }
    res.writeHead(status, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  }

  return http.createServer(async (req, res) => {
    try {
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      return await serveStatic(req, res, pathname);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'Internal server error.' });
      else res.end();
    }
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => {
    console.log(`Masala Tapri running at http://localhost:${port}`);
  });
}
