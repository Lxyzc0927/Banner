'use strict';

const { errors } = require('../../errors');
const { optionalUser, requireAdmin, requireUser } = require('../../middleware');
const { asObject, enumValue, integer, number, pagination, string } = require('../../validate');
const { nowIso } = require('../../time');
const { transaction } = require('../../db');

const SPEC_FIELDS = ['power', 'torque', 'weight', 'seatHeight', 'tank'];
const LINK_TYPES = ['none', 'bike', 'activity'];
const IMAGE_URL = /^(?:https?:\/\/[^\s]+|\/(?!\/)[^\s\\]+)$/i;
const text = (value, name) => string(value, name, { required: true, min: 1 });
const image = (value, name) => string(value, name, { max: 2048, pattern: IMAGE_URL });
const idValue = (value) => integer(value, 'id', { required: true, min: 1 });

function stringList(value, name, validate) {
  if (!Array.isArray(value) || value.length > 50) throw errors.badRequest(`${name} 必须是最多 50 项的数组`);
  return value.map((item) => validate(item, name));
}

function bikeView(row) {
  return { id: row.id, name: row.name, category: row.category, cc: row.cc, price: row.price,
    cover: row.cover, tags: JSON.parse(row.tags || '[]') };
}

function bannerView(row) {
  return { id: row.id, title: row.title, image: row.image, sort: row.sort,
    link: row.link_url && (row.link_type === 'bike' || row.link_type === 'activity') ? `/${row.link_type}/${row.link_url}` : '' };
}

function adminBannerView(row) {
  return { id: row.id, title: row.title, image: row.image, linkType: row.link_type,
    linkUrl: row.link_url, sort: row.sort, status: row.status };
}

function bikeDetail(db, row, user) {
  const images = db.prepare('SELECT url FROM bike_image WHERE bike_id = ? ORDER BY sort, id').all(row.id);
  const favorite = user && db.prepare('SELECT 1 FROM favorite WHERE user_id = ? AND bike_id = ?').get(user.id, row.id);
  const specs = JSON.parse(row.specs || '{}');
  return { ...bikeView(row), ...Object.fromEntries(SPEC_FIELDS.map((key) => [key, specs[key] ?? null])),
    desc: row.intro, images: images.map(({ url }) => url), favorited: Boolean(favorite) };
}

function find(db, table, id, published = false) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?${published ? ' AND status = 1' : ''}`).get(id);
  if (!row) throw errors.notFound('记录不存在');
  return row;
}

function pageRows(ctx, table, filters, args, order, view, columns = '*') {
  const { page, pageSize, offset } = pagination(ctx.query);
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const total = ctx.db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get(...args).count;
  const list = ctx.db.prepare(`SELECT ${columns} FROM ${table} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, pageSize, offset).map(view);
  ctx.ok({ list, total, page, pageSize });
}

function bikeFilters(ctx, published) {
  const q = ctx.query;
  const filters = published ? ['status = 1'] : [];
  const args = [];
  const add = (clause, ...values) => { filters.push(clause); args.push(...values); };
  if (q.keyword) add('(instr(lower(name), lower(?)) > 0 OR instr(lower(category), lower(?)) > 0)', q.keyword, q.keyword);
  if (q.category) add('category = ?', q.category);
  if (!published) return { filters, args, order: 'sort, id' };
  const cc = integer(q.cc, 'cc', { min: 0 });
  const min = number(q.minPrice, 'minPrice', { min: 0 });
  const max = number(q.maxPrice, 'maxPrice', { min: 0 });
  if (min !== null && max !== null && min > max) throw errors.badRequest('价格区间不正确');
  if (cc) add('cc = ?', cc);
  if (min !== null) add('price >= ?', Math.round(min * 100));
  if (max !== null) add('price <= ?', Math.round(max * 100));
  const tier = enumValue(q.tier, 'tier', ['entry', 'mid', 'big']);
  if (tier) add('tier = ?', tier);
  for (const tag of new Set((q.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean))) {
    add('EXISTS (SELECT 1 FROM json_each(bike.tags) WHERE value = ?)', tag);
  }
  const sort = enumValue(q.sort, 'sort', ['price_asc', 'price_desc']);
  const order = { price_asc: 'price ASC, id', price_desc: 'price DESC, id' }[sort] || 'sort, id';
  return { filters, args, order };
}

function commonFields(body, existing) {
  return {
    status: body.status === undefined ? existing.status ?? 1 : integer(body.status, 'status', { required: true, min: 0, max: 1 }),
    sort: body.sort === undefined ? existing.sort ?? 0 : integer(body.sort, 'sort', { required: true }),
  };
}

function saveBanner(ctx, id) {
  const existing = id ? find(ctx.db, 'banner', id) : {};
  const body = asObject(ctx.body);
  const title = text(body.title === undefined ? existing.title : body.title, 'title');
  const url = image(body.image === undefined ? existing.image : body.image, 'image');
  if (!url) throw errors.badRequest('image 不能为空');
  const linkType = body.linkType === undefined ? existing.link_type ?? 'none' : enumValue(body.linkType, 'linkType', LINK_TYPES, { required: true });
  const linkUrl = linkType === 'none' ? null : String(idValue(body.linkUrl === undefined ? existing.link_url : body.linkUrl));
  if (body.sort !== undefined && typeof body.sort !== 'number') {
    throw errors.badRequest('sort 必须是安全整数');
  }
  const { status, sort } = commonFields(body, existing);
  const values = [title, url, linkType, linkUrl, sort, status];
  if (id) {
    ctx.db.prepare('UPDATE banner SET title=?, image=?, link_type=?, link_url=?, sort=?, status=? WHERE id=?').run(...values, id);
    return ctx.ok({ id });
  }
  const result = ctx.db.prepare('INSERT INTO banner (title, image, link_type, link_url, sort, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(...values, nowIso());
  ctx.ok({ id: Number(result.lastInsertRowid) });
}

function saveBike(ctx, id) {
  const existing = id ? find(ctx.db, 'bike', id) : {};
  const body = asObject(ctx.body);
  const name = text(body.name === undefined ? existing.name : body.name, 'name');
  const category = text(body.category === undefined ? existing.category : body.category, 'category');
  const cc = integer(body.cc === undefined ? existing.cc : body.cc, 'cc', { required: true, min: 1 });
  const price = integer(body.price === undefined ? existing.price : body.price, 'price', { required: true, min: 0 });
  const tier = cc <= 250 ? 'entry' : cc >= 500 ? 'big' : cc >= 300 ? 'mid' : null;
  const tags = body.tags === undefined ? existing.tags ?? '[]' : JSON.stringify(stringList(body.tags, 'tags', text));
  const cover = body.cover === undefined ? existing.cover ?? null : image(body.cover, 'cover');
  const intro = body.desc === undefined ? existing.intro ?? null : string(body.desc, 'desc', { max: 5000 });
  const specs = JSON.parse(existing.specs || '{}');
  for (const key of SPEC_FIELDS) {
    if (body[key] !== undefined) specs[key] = number(body[key], key, { min: 0 });
  }
  const images = body.images === undefined ? null : stringList(body.images, 'images', (value) => {
    const url = image(value, 'images');
    if (!url) throw errors.badRequest('图集地址不能为空');
    return url;
  });
  const { status, sort } = commonFields(body, existing);
  const values = [name, category, cc, tier, tags, price, JSON.stringify(specs), intro, cover, status, sort];
  const savedId = transaction(ctx.db, () => {
    let bikeId = id;
    if (bikeId) {
      ctx.db.prepare('UPDATE bike SET name=?, category=?, cc=?, tier=?, tags=?, price=?, specs=?, intro=?, cover=?, status=?, sort=? WHERE id=?')
        .run(...values, bikeId);
    } else {
      const result = ctx.db.prepare('INSERT INTO bike (name, category, cc, tier, tags, price, specs, intro, cover, status, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(...values, nowIso());
      bikeId = Number(result.lastInsertRowid);
    }
    if (images) {
      ctx.db.prepare('DELETE FROM bike_image WHERE bike_id = ?').run(bikeId);
      const insert = ctx.db.prepare('INSERT INTO bike_image (bike_id, url, sort, created_at) VALUES (?, ?, ?, ?)');
      const now = nowIso();
      images.forEach((url, index) => insert.run(bikeId, url, index, now));
    }
    return bikeId;
  });
  ctx.ok({ id: savedId });
}

function remove(ctx, table) {
  const result = ctx.db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(idValue(ctx.params.id));
  if (!result.changes) throw errors.notFound('记录不存在');
  ctx.ok();
}

function banners(db) {
  return db.prepare('SELECT * FROM banner WHERE status = 1 ORDER BY sort, id').all().map(bannerView);
}

function hotBikes(db, limit) {
  return db.prepare('SELECT * FROM bike WHERE status = 1 ORDER BY sort, id LIMIT ?').all(limit).map(bikeView);
}

function register(router) {
  const admin = requireAdmin();
  router.get('/api/home', (ctx) => ctx.ok({
    banners: banners(ctx.db),
    news: ctx.db.prepare('SELECT id, title, summary, date FROM news WHERE status = 1 ORDER BY sort, id').all(),
    hotBikes: hotBikes(ctx.db, 4),
  }));
  router.get('/api/banners', (ctx) => ctx.ok({ list: banners(ctx.db) }));
  router.get('/api/news', (ctx) => pageRows(ctx, 'news', ['status = 1'], [], 'sort, id',
    ({ id, title, summary, cover, date }) => ({ id, title, summary, cover, date })));
  router.get('/api/news/:id', (ctx) => {
    const { id, title, summary, content, cover, date } = find(ctx.db, 'news', idValue(ctx.params.id), true);
    ctx.ok({ id, title, summary, content, cover, date });
  });
  router.get('/api/admin/news', admin, (ctx) => pageRows(ctx, 'news', [], [], 'sort, id',
    ({ id, title, summary, content, cover, date, status, sort }) => ({ id, title, summary, content, cover, date, status, sort })));
  router.get('/api/bikes', (ctx) => {
    const { filters, args, order } = bikeFilters(ctx, true);
    pageRows(ctx, 'bike', filters, args, order, bikeView);
  });
  router.get('/api/bikes/filters', (ctx) => {
    const rows = ctx.db.prepare('SELECT category, tags FROM bike WHERE status = 1 ORDER BY sort, id').all();
    ctx.ok({ categories: [...new Set(rows.map((row) => row.category))],
      tags: [...new Set(rows.flatMap((row) => JSON.parse(row.tags || '[]')))] });
  });
  router.get('/api/bikes/hot', (ctx) => ctx.ok({ list: hotBikes(ctx.db, integer(ctx.query.limit, 'limit', { min: 1, max: 50, defaultValue: 4 })) }));
  router.get('/api/bikes/:id', optionalUser, (ctx) => ctx.ok(bikeDetail(ctx.db, find(ctx.db, 'bike', idValue(ctx.params.id), true), ctx.user)));
  router.post('/api/bikes/:id/favorite', requireUser, (ctx) => {
    const { id } = find(ctx.db, 'bike', idValue(ctx.params.id), true);
    ctx.db.prepare('INSERT INTO favorite (user_id, bike_id, created_at) VALUES (?, ?, ?) ON CONFLICT (user_id, bike_id) DO NOTHING')
      .run(ctx.user.id, id, nowIso());
    ctx.ok({ favorited: true });
  });
  router.delete('/api/bikes/:id/favorite', requireUser, (ctx) => {
    ctx.db.prepare('DELETE FROM favorite WHERE user_id = ? AND bike_id = ?').run(ctx.user.id, idValue(ctx.params.id));
    ctx.ok({ favorited: false });
  });
  router.get('/api/favorites', requireUser, (ctx) => {
    pageRows(ctx, 'bike JOIN favorite ON favorite.bike_id = bike.id', ['bike.status = 1', 'favorite.user_id = ?'],
      [ctx.user.id], 'favorite.created_at DESC, bike.id DESC', bikeView, 'bike.*');
  });
  router.get('/api/admin/banners', admin, (ctx) => pageRows(ctx, 'banner', [], [], 'sort, id', adminBannerView));
  router.post('/api/admin/banners', admin, (ctx) => saveBanner(ctx));
  router.put('/api/admin/banners/:id', admin, (ctx) => saveBanner(ctx, idValue(ctx.params.id)));
  router.delete('/api/admin/banners/:id', admin, (ctx) => remove(ctx, 'banner'));
  router.get('/api/admin/bikes', admin, (ctx) => {
    const { filters, args, order } = bikeFilters(ctx, false);
    pageRows(ctx, 'bike', filters, args, order, (row) => ({ ...bikeView(row), status: row.status, sort: row.sort }));
  });
  router.post('/api/admin/bikes', admin, (ctx) => saveBike(ctx));
  router.put('/api/admin/bikes/:id', admin, (ctx) => saveBike(ctx, idValue(ctx.params.id)));
  router.delete('/api/admin/bikes/:id', admin, (ctx) => remove(ctx, 'bike'));
}

module.exports = { register };
