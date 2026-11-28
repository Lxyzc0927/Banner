'use strict';

const { CODES, ApiError, errors } = require('./errors');

function compilePattern(pattern) {
  const parts = pattern.split('/').filter(Boolean);
  return parts.map((part) => (part.startsWith(':') ? { param: part.slice(1) } : { literal: part }));
}

class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, ...handlers) {
    this.routes.push({ method, pattern, parts: compilePattern(pattern), handlers });
    return this;
  }

  get(pattern, ...handlers) {
    return this.add('GET', pattern, ...handlers);
  }

  post(pattern, ...handlers) {
    return this.add('POST', pattern, ...handlers);
  }

  put(pattern, ...handlers) {
    return this.add('PUT', pattern, ...handlers);
  }

  patch(pattern, ...handlers) {
    return this.add('PATCH', pattern, ...handlers);
  }

  delete(pattern, ...handlers) {
    return this.add('DELETE', pattern, ...handlers);
  }

  match(method, pathname) {
    const pathParts = pathname.split('/').filter(Boolean);
    const methodMatches = [];
    for (const route of this.routes) {
      if (route.parts.length !== pathParts.length) continue;
      const params = {};
      let matched = true;
      for (let i = 0; i < route.parts.length; i += 1) {
        const part = route.parts[i];
        if (part.literal !== undefined) {
          if (part.literal !== pathParts[i]) {
            matched = false;
            break;
          }
        } else {
          try {
            params[part.param] = decodeURIComponent(pathParts[i]);
          } catch {
            matched = false;
            break;
          }
        }
      }
      if (matched) methodMatches.push({ route, params });
    }
    if (methodMatches.length === 0) return null;
    const exact = methodMatches.find((item) => item.route.method === method);
    if (exact) return { ...exact, methodMismatch: false };
    return { ...methodMatches[0], methodMismatch: true };
  }

  async dispatch(ctx) {
    const found = this.match(ctx.method, ctx.path);
    if (!found) throw errors.notFound(`接口不存在: ${ctx.method} ${ctx.path}`);
    if (found.methodMismatch) throw errors.notFound(`接口不存在: ${ctx.method} ${ctx.path}`);
    ctx.params = found.params;
    let index = -1;
    const run = async (i) => {
      if (i <= index) throw new Error('next() 被重复调用');
      index = i;
      const handler = found.route.handlers[i];
      if (!handler) return;
      await handler(ctx, () => run(i + 1));
    };
    await run(0);
  }
}

function createContext({ req, res, db, url, body, requestId }) {
  const query = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;

  const ctx = {
    req,
    res,
    db,
    url,
    method: req.method,
    path: url.pathname,
    query,
    params: {},
    body,
    requestId,
    user: null,
    admin: null,
    ip: req.socket?.remoteAddress || '',
    headersSent: false,
  };

  ctx.json = (data, status = 200, headers = {}) => {
    if (ctx.headersSent) return;
    ctx.headersSent = true;
    const payload = Buffer.from(JSON.stringify(data));
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': payload.length,
      'Cache-Control': 'no-store',
      ...headers,
    });
    res.end(payload);
  };

  ctx.ok = (data = null, message = 'ok') => ctx.json({ code: CODES.OK, message, data });

  ctx.fail = (code, message, status = 200, details = null) =>
    ctx.json({ code, message, data: null, ...(details ? { details } : {}) }, status);

  ctx.text = (text, status = 200, headers = {}) => {
    if (ctx.headersSent) return;
    ctx.headersSent = true;
    const payload = Buffer.from(text);
    res.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': payload.length,
      ...headers,
    });
    res.end(payload);
  };

  ctx.buffer = (buffer, contentType, filename, status = 200) => {
    if (ctx.headersSent) return;
    ctx.headersSent = true;
    const headers = {
      'Content-Type': contentType,
      'Content-Length': buffer.length,
      'Cache-Control': 'no-store',
    };
    if (filename) {
      headers['Content-Disposition'] = `attachment; filename="${filename.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
    }
    res.writeHead(status, headers);
    res.end(buffer);
  };

  return ctx;
}

module.exports = { Router, createContext, ApiError };
