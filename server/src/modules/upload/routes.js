'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { errors } = require('../../errors');
const { requireAdmin } = require('../../middleware');

const UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const UPLOAD_BODY_MAX_BYTES = UPLOAD_MAX_BYTES + 64 * 1024;
const UPLOAD_PATH = /^\/uploads\/(\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|png|webp))$/;
const IMAGE_MIME = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const PNG_HEADER = Buffer.from('89504e470d0a1a0a', 'hex');

function imageExtension(data) {
  if (data.subarray(0, 8).equals(PNG_HEADER)) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

function register(router) {
  router.post('/api/upload', requireAdmin(), async (ctx) => {
    const contentType = ctx.req.headers['content-type'] || '';
    if (!/^multipart\/form-data\s*;/i.test(contentType)) {
      throw errors.badRequest('请以 multipart/form-data 上传图片');
    }
    const body = await ctx.readUpload();
    let form;
    try {
      form = await new Request('http://localhost', {
        method: 'POST', headers: { 'Content-Type': contentType }, body,
      }).formData();
    } catch {
      throw errors.badRequest('无法解析图片上传表单');
    }
    const files = form.getAll('file');
    if (files.length !== 1 || !(files[0] instanceof File) || !files[0].size) {
      throw errors.badRequest('请在 file 字段上传一张图片');
    }
    const [file] = files;
    if (file.size > UPLOAD_MAX_BYTES) throw errors.badRequest('单张图片不能超过 5 MB');
    const data = Buffer.from(await file.arrayBuffer());
    const extension = imageExtension(data);
    if (!extension || file.type !== IMAGE_MIME[extension]) {
      throw errors.badRequest('只支持 JPEG、PNG 或 WebP 图片');
    }
    const month = new Date().toISOString().slice(0, 7).replace('-', '/');
    const filename = `${randomUUID()}.${extension}`;
    const directory = path.join(ctx.uploadDir, month);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, filename), data, { flag: 'wx' });
    ctx.ok({ url: `/uploads/${month}/${filename}` });
  });
}

module.exports = { register, UPLOAD_BODY_MAX_BYTES, UPLOAD_PATH, IMAGE_MIME };
