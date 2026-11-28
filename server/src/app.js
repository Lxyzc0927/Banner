'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { config } = require('./config');
const { getDb } = require('./db');
const { Router, createContext } = require('./http');
const { ApiError, errors, CODES } = require('./errors');
const { randomId } = require('./auth');
const { UPLOAD_BODY_MAX_BYTES, UPLOAD_PATH, IMAGE_MIME } = require('./modules/upload/routes');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function loadRoutes(router) {
  const modulesDir = path.join(__dirname, 'modules');
  const entries = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of entries) {
    const file = path.join(modulesDir, name, 'routes.js');
    if (!fs.existsSync(file)) continue;
    const mod = require(file);
    if (typeof mod.register !== 'function') {
      throw new Error(`模块 ${name}/routes.js 必须导出 register(router)`);
    }
    mod.register(router);
  }
  return entries;
}

function readBody(req, limit, overflow = new ApiError(CODES.BAD_REQUEST, '请求体过大', 413)) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > limit) {
      reject(overflow);
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      if (size > limit) return;
      size += chunk.length;
      if (size > limit) {
        reject(overflow);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJsonBody(buffer, contentType) {
  if (!buffer.length) return {};
  if (!/application\/json/i.test(contentType || '')) {
    throw new ApiError(CODES.BAD_REQUEST, 'Content-Type 必须是 application/json', 415);
  }
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    throw new ApiError(CODES.BAD_REQUEST, '请求体不是合法 JSON', 400);
  }
}

function staticFile(adminDir, pathname) {
  let relative = pathname.replace(/^\/admin\/?/, '');
  if (!relative || relative === '/') relative = 'index.html';
  const target = path.resolve(adminDir, relative);
  const root = path.resolve(adminDir);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) return null;
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return null;
  return target;
}

function sendStatic(ctx, adminDir) {
  if (ctx.method !== 'GET' && ctx.method !== 'HEAD') return false;
  const file = staticFile(adminDir, ctx.path);
  if (!file) return false;
  const ext = path.extname(file).toLowerCase();
  const stat = fs.statSync(file);
  ctx.res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (ctx.method === 'HEAD') ctx.res.end();
  else fs.createReadStream(file).pipe(ctx.res);
  return true;
}

async function sendUpload(req, res, pathname, uploadDir) {
  const match = UPLOAD_PATH.exec(pathname);
  if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) throw errors.notFound('图片不存在');
  const file = path.join(uploadDir, match[1]);
  let handle;
  try {
    handle = await fs.promises.open(file, 'r');
  } catch (error) {
    if (error.code === 'ENOENT') throw errors.notFound('图片不存在');
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw errors.notFound('图片不存在');
    res.writeHead(200, {
      'Content-Type': IMAGE_MIME[path.extname(file).slice(1)],
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=86400',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(await handle.readFile());
  } finally {
    await handle.close();
  }
}

function createApp({ db = getDb(), adminDir = config.adminDir, uploadDir = config.uploadDir } = {}) {
  const router = new Router();
  const modules = loadRoutes(router);

  async function handle(req, res) {
    const requestId = randomId('req_');
    const startedAt = Date.now();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,Idempotency-Key');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ code: 400, message: '非法 URL', data: null }));
      return;
    }

    if (url.pathname === '/') {
      res.writeHead(302, { Location: '/admin/' });
      res.end();
      return;
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        if (sendStatic({ req, res, method: req.method, path: url.pathname }, adminDir)) return;
        throw errors.notFound('页面不存在');
      }
      if (url.pathname.startsWith('/uploads/')) {
        await sendUpload(req, res, url.pathname, uploadDir);
        return;
      }
      if (!url.pathname.startsWith('/api/')) {
        throw errors.notFound('接口不存在');
      }

      const upload = req.method === 'POST' && /^\/api\/upload\/?$/.test(url.pathname);
      const body = upload ? {} : parseJsonBody(await readBody(req, config.limits.jsonBodyBytes), req.headers['content-type']);
      const ctx = createContext({ req, res, db, url, body, requestId });
      if (upload) {
        ctx.uploadDir = uploadDir;
        ctx.readUpload = () => readBody(req, UPLOAD_BODY_MAX_BYTES, errors.badRequest('上传请求过大'));
      }
      ctx.modules = modules;
      await router.dispatch(ctx);

      if (!ctx.headersSent) {
        console.warn(`[http] 路由未返回响应: ${req.method} ${url.pathname}`);
        ctx.ok(null);
      }
    } catch (error) {
      req.resume();
      sendError(res, error, requestId);
    } finally {
      const ms = Date.now() - startedAt;
      if (config.env !== 'test') {
        console.log(`${req.method} ${url.pathname} ${res.statusCode} ${ms}ms ${requestId}`);
      }
    }
  }

  return { handle, router, db, modules };
}

function sendError(res, error, requestId) {
  if (res.writableEnded) return;
  if (error instanceof ApiError) {
    const payload = {
      code: error.code,
      message: error.message,
      data: null,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    };
    const body = Buffer.from(JSON.stringify(payload));
    res.writeHead(error.httpStatus || 200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(body);
    return;
  }
  console.error(`[error] ${requestId}`, error);
  const body = Buffer.from(
    JSON.stringify({ code: CODES.INTERNAL, message: '服务异常', data: null, requestId }),
  );
  res.writeHead(500, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
  });
  res.end(body);
}

function startServer({ port = config.port, host = config.host, db = getDb(), adminDir = config.adminDir, uploadDir = config.uploadDir } = {}) {
  const app = createApp({ db, adminDir, uploadDir });
  const server = http.createServer((req, res) => {
    app.handle(req, res).catch((error) => {
      console.error('[fatal]', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ code: 500, message: '服务异常', data: null }));
      }
    });
  });
  server.listen(port, host);
  return { server, app, db };
}

module.exports = { createApp, startServer, loadRoutes };
