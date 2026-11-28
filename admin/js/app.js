/* 管理后台骨架：所有交互演示版，接口就绪后把 DB 换成后端数据 */
const state = { page: 'home', keyword: '', pageNo: 1, pageSize: 8, editId: null };
let pendingImage = null;   // 本地预览用的 dataURL（演示模式写回 DB 用）
let pendingFile = null;    // 原始 File：真实模式下先上传到 /api/upload 换 URL 再写入 Banner
/* 弹窗会话号：每次打开弹窗 +1，用于作废旧弹窗未完成的异步读取，防止图片串到另一条记录 */
let modalSession = 0;
/* 当前弹窗是否正在读取图片，读取期间禁用保存，避免丢图 */
let imageReading = false;
/* 读取序号：每次选图自增，只有最新一次读取的回调能更新预览/待保存图/保存状态。
   弹窗会话号只防跨弹窗串图，序号进一步防同一弹窗内"先选A后选B、A后完成覆盖B"。 */
let imageReadSeq = 0;

const PAGE_META = {
  home: { title: '首页内容管理', desc: '管理 Banner 图与新车资讯，新增/编辑/上下架/排序' },
  bike: { title: '车型管理', desc: '车型主数据与图集：完整 CRUD、参数校验、图片上传、分页搜索' },
  activity: { title: '活动管理', desc: '活动发布与下架、报名人数统计、名单导出' },
  user: { title: '用户管理', desc: '后台账号角色权限（至少两角色）、C 端用户查询与禁用' },
  analysis: { title: '数据分析', desc: '基于模拟数据出图：模块热度、访问趋势、转化漏斗' }
};

function q(sel) { return document.querySelector(sel); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* 非阻塞提示，替代 alert（原 alert 会阻塞页面） */
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* 新增记录时用最大 ID + 1，避免删除后新增产生重复 ID */
function nextId(arr) { return arr.length ? Math.max(...arr.map(x => x.id)) + 1 : 1; }
function nextSort(arr) {
  return arr.length ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(...arr.map(x => x.sort || 0)) + 1) : 1;
}
function clearErrors() { document.querySelectorAll('.err').forEach(e => { e.textContent = ''; }); }
function clampPage(total) {
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  if (state.pageNo > pages) state.pageNo = pages;
}

function setPage(page) {
  state.page = page; state.keyword = ''; state.pageNo = 1;
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  q('#page-title').textContent = PAGE_META[page].title;
  q('#page-desc').textContent = PAGE_META[page].desc;
  render();
}

/* 渲染序号：真实模式异步加载期间快速切页时，只让最后一次渲染落地 */
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  // 真实模式：先拉当前页数据写回 DB（演示模式 Bridge.load 直接返回）
  await Bridge.load(state.page);
  if (seq !== renderSeq) return;
  const map = { home: renderHome, bike: renderBike, activity: renderActivity, user: renderUser, analysis: renderAnalysis };
  map[state.page]();
}

/* 把工具栏与列表区分开：搜索/翻页只重绘列表区，输入框不会因 innerHTML 重建而失焦 */
function paint(toolbarHtml, listHtml) {
  q('#content').innerHTML = toolbarHtml + `<div id="list-area">${listHtml}</div>`;
}
function refreshList() {
  const map = { home: homeList, bike: bikeList, activity: activityList, user: userList };
  const fn = map[state.page];
  const area = q('#list-area');
  if (fn && area) area.innerHTML = fn();
}

function tableHTML(headers, rows) {
  const clear = state.keyword ? `<div><button onclick="clearFilter()">清除筛选</button></div>` : '';
  return `<div class="card"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}"><div class="empty">暂无数据${clear}</div></td></tr>`}</tbody></table></div>`;
}

function pagerHTML(total) {
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  let btns = '';
  for (let i = 1; i <= pages; i++) btns += `<button class="small ${i === state.pageNo ? 'primary' : ''}" onclick="goPage(${i})">${i}</button>`;
  return `<div class="pager">共 ${total} 条 · 第 ${state.pageNo}/${pages} 页 ${btns}</div>`;
}

function goPage(n) { state.pageNo = n; refreshList(); }
function clearFilter() {
  state.keyword = ''; state.pageNo = 1;
  const i = q('#kw'); if (i) i.value = '';
  refreshList();
}
function onSearch(v) { state.keyword = v.trim(); state.pageNo = 1; refreshList(); }
function pageSlice(arr) {
  clampPage(arr.length);
  return arr.slice((state.pageNo - 1) * state.pageSize, state.pageNo * state.pageSize);
}
function searchBar(placeholder, extra = '') {
  return `<div class="toolbar"><input id="kw" placeholder="${placeholder}" value="${esc(state.keyword)}" oninput="onSearch(this.value)">${extra}</div>`;
}

/* 首页内容管理 */
function homeList() {
  const kw = state.keyword.toLowerCase();
  const list = DB.banners
    .filter(b => !kw || b.title.toLowerCase().includes(kw))
    .slice()
    .sort((a, b) => a.sort - b.sort || a.id - b.id);   // 先按 sort 升序，同序号按 id 兜底，再分页
  clampPage(list.length);
  const rows = pageSlice(list).map(b => `<tr>
    <td>${b.id}</td><td>${esc(b.title)}</td>
    <td>${b.image ? `<img src="${esc(Bridge.isReal() ? imgUrl(b.image) : b.image)}" width="48" height="28" style="object-fit:cover">` : '<span style="color:#aaa">未上传</span>'}</td>
    <td>${esc(b.link) || '-'}</td><td>${b.sort}</td>
    <td><span class="tag ${b.status === '上架' ? 'tag-on' : 'tag-off'}">${b.status}</span></td>
    <td><button class="small" onclick="toggleBanner(${b.id})">${b.status === '上架' ? '下架' : '上架'}</button>
        <button class="small" onclick="openBannerModal(${b.id})">编辑</button>
        <button class="small danger" onclick="confirmDelete('banner',${b.id})">删除</button></td></tr>`);
  return tableHTML(['ID', '标题', '图片', '跳转链接', '排序', '状态', '操作'], rows) + pagerHTML(list.length);
}
function renderHome() {
  paint(searchBar('搜索 Banner 标题…', `<button class="primary" onclick="openBannerModal()">+ 新增 Banner</button>`), homeList());
}
async function toggleBanner(id) {
  const b = DB.banners.find(x => x.id === id);
  const next = b.status === '上架' ? '下架' : '上架';
  // 真实模式先调接口，失败则不动本地状态
  if (!await Bridge.mutate('banner.toggle', { id, status: next })) return;
  b.status = next;
  toast('状态已更新，小程序端刷新即可生效'); refreshList();
}

/* 车型管理 */
function bikeList() {
  const kw = state.keyword.toLowerCase();
  const list = DB.bikes.filter(b => !kw || b.name.toLowerCase().includes(kw));
  clampPage(list.length);
  const rows = pageSlice(list).map(b => `<tr>
    <td>${b.id}</td><td>${esc(b.name)}</td><td>¥${b.price.toLocaleString()}</td><td>${b.cc}cc</td>
    <td><span class="tag ${b.status === '上架' ? 'tag-on' : 'tag-off'}">${b.status}</span></td>
    <td><button class="small" onclick="openBikeModal(${b.id})">编辑</button>
        <button class="small danger" onclick="confirmDelete('bike',${b.id})">删除</button></td></tr>`);
  return tableHTML(['ID', '车型名称', '价格(元)', '排量', '状态', '操作'], rows) + pagerHTML(list.length);
}
function renderBike() {
  paint(searchBar('搜索车型名称…', `<button class="primary" onclick="openBikeModal()">+ 新增车型</button>`), bikeList());
}

/* 活动管理 */
/* 按钮动作按后端原始 status 判断（draft/published/offline），展示文案仍按 phase 计算。
 * 关键点：phase=upcoming 的已发布活动展示为"未开始"，但它已经是 published，
 * 必须显示"下架"而不是"发布"，否则重复调 publish 会被后端以 1009 拒绝。 */
function activityAction(a) {
  // 已结束由时间决定，任何 raw status 都不提供人工操作
  if (a.phase === 'ended' || a.status === '已结束') return null;
  const raw = a.rawStatus || (a.status === '未开始' ? 'draft' : a.status === '进行中' ? 'published' : a.status === '已下架' ? 'offline' : 'ended');
  if (raw === 'draft')   return { op: 'publish', label: '发布', msg: '活动已发布' };
  if (raw === 'published') return { op: 'offline', label: '下架', msg: '活动已下架' };
  if (raw === 'offline') return { op: 'publish', label: '重新发布', msg: '活动已重新发布' };
  return null;   // ended 由时间决定，不提供人工操作
}
function activityList() {
  const kw = state.keyword.toLowerCase();
  const list = DB.activities.filter(a => !kw || a.name.toLowerCase().includes(kw));
  clampPage(list.length);
  const rows = pageSlice(list).map(a => {
    const tagClass = a.status === '进行中' ? 'tag-on' : (a.status === '未开始' || a.status === '已下架') ? 'tag-warn' : 'tag-off';
    const act = activityAction(a);
    const op = act
      ? `<button class="small" onclick="toggleActivity(${a.id})">${act.label}</button>`
      : `<span style="color:#aaa">—</span>`;
    return `<tr><td>${a.id}</td><td>${esc(a.name)}</td><td>${a.date}</td><td>${a.signup}/${a.quota}</td>
      <td><span class="tag ${tagClass}">${a.status}</span></td>
      <td>${op}<button class="small" onclick="exportSignups(${a.id})">导出名单</button></td></tr>`;
  });
  return tableHTML(['ID', '活动名称', '日期', '报名人数/名额', '状态', '操作'], rows) + pagerHTML(list.length);
}
function renderActivity() {
  paint(searchBar('搜索活动名称…', `<button class="primary" onclick="toast('活动发布表单：接入 POST /api/activities')">+ 发布活动</button>`), activityList());
}
async function toggleActivity(id) {
  const a = DB.activities.find(x => x.id === id);
  const act = activityAction(a);
  if (!act) return;
  const payload = { id, op: act.op };
  if (!await Bridge.mutate('activity.toggle', payload)) return;
  Object.assign(a, payload.activity);
  toast(act.msg); refreshList();
}
async function exportSignups(id) {
  // 真实模式：走 Bearer + Blob 下载 CSV（Bridge.mutate 内部已触发下载，返回 false 跳过演示 toast）
  const done = await Bridge.mutate('export', { id, query: {} });
  if (!done) return;
  const a = DB.activities.find(x => x.id === id);
  const names = DB.signups.filter(s => s.activity === a.name).map(s => s.name);
  toast('已导出名单（演示）：' + (names.length ? names.join('、') : '暂无报名记录'));
}

/* 用户管理 */
function userList() {
  const kw = state.keyword.toLowerCase();
  const list = DB.users.filter(u => !kw || u.name.toLowerCase().includes(kw));
  clampPage(list.length);
  const rows = pageSlice(list).map(u => `<tr>
    <td>${u.id}</td><td>${esc(u.name)}</td><td>${u.phone}</td>
    <td><span class="tag ${u.status === '正常' ? 'tag-on' : 'tag-off'}">${u.status}</span></td>
    <td><button class="small" onclick="toggleUser(${u.id})">${u.status === '正常' ? '禁用' : '启用'}</button></td></tr>`);
  const adminRows = DB.admins.map(a => `<tr><td>${a.id}</td><td>${esc(a.name)}</td><td>${a.role}</td><td>${a.status}</td>
    <td><button class="small" onclick="toast('角色配置：接入 PUT /api/admins/${a.id}/role')">改角色</button></td></tr>`).join('');
  return `<div class="two-col"><div><h3 style="font-size:13px;color:#666;margin-bottom:8px">后台账号（角色权限，至少两角色）</h3>
     ${tableHTML(['ID', '账号', '角色', '状态', '操作'], [adminRows])}</div>
     <div><h3 style="font-size:13px;color:#666;margin-bottom:8px">C 端用户</h3>${tableHTML(['ID', '昵称', '手机号', '状态', '操作'], rows)}${pagerHTML(list.length)}</div></div>`;
}
function renderUser() {
  paint(searchBar('搜索 C 端用户…'), userList());
}
async function toggleUser(id) {
  const u = DB.users.find(x => x.id === id);
  const next = u.status === '正常' ? '禁用' : '正常';
  if (!await Bridge.mutate('user.toggle', { id, status: next === '正常' ? 'active' : 'disabled', reason: '后台管理操作' })) return;
  u.status = next; toast('用户状态已更新'); refreshList();
}

/* 数据分析 */
function renderAnalysis() {
  const maxHeat = Math.max(...DB.analysis.heat.map(x => x.value));
  const heat = DB.analysis.heat.map(x => `<div class="bar-row"><span class="bar-label">${x.name}</span>
    <span class="bar-track"><span class="bar-fill" style="width:${x.value / maxHeat * 100}%"></span></span><span class="bar-value">${x.value}</span></div>`).join('');
  const t = DB.analysis.trend, maxT = Math.max(...t), pts = t.map((v, i) => `${i / (t.length - 1) * 500},${110 - v / maxT * 100}`).join(' ');
  const funnel = DB.analysis.funnel.map(x => `<div class="funnel-step"><div class="funnel-label"><span>${x.name}</span><span>${x.value}</span></div>
    <div class="funnel-bar" style="width:${x.value / DB.analysis.funnel[0].value * 100}%"></div></div>`).join('');
  q('#content').innerHTML = `<div class="charts">
    <div class="chart-card"><h3>模块热度</h3>${heat}</div>
    <div class="chart-card"><h3>访问趋势（近 12 期）</h3><svg viewBox="0 0 500 120" width="100%" height="120">
      <line x1="0" y1="110" x2="500" y2="110" stroke="#e8e9ec"/><polyline points="${pts}" fill="none" stroke="#185fa5" stroke-width="2"/></svg></div>
    <div class="chart-card"><h3>转化漏斗</h3>${funnel}</div></div>`;
}

/* 弹窗表单：校验 + 二次确认 */
function openModal(html) {
  modalSession += 1;
  q('#modal-root').innerHTML = `<div class="mask"><div class="modal">${html}</div></div>`;
}
function closeModal() {
  modalSession += 1;   // 使在途的 FileReader 回调失效
  pendingImage = null;
  pendingFile = null;
  imageReading = false;
  q('#modal-root').innerHTML = '';
}

/* 图片本地预览：
   双层防护——会话号拦截"跨弹窗"串图，读取序号拦截"同一弹窗内连选多张"的竞态。
   只有 session 未变 且 序号是当前最新 的回调，才允许更新预览/待保存图/保存状态。 */
function previewImage(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { toast('请选择 JPEG、PNG 或 WebP 图片'); input.value = ''; return; }
  if (f.size > 5 * 1024 * 1024) { toast('图片不能超过 5 MiB'); input.value = ''; return; }
  pendingFile = f;                       // 真实模式保存时用它上传；取消/关闭会清空
  const session = modalSession;          // 锁定发起读取的弹窗会话
  const seq = ++imageReadSeq;            // 本次读取的唯一序号；后一次选图会让前一次作废
  imageReading = true;
  const saveBtn = q('#btn-save');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '读取中…'; }
  const reader = new FileReader();
  const isValid = () => session === modalSession && seq === imageReadSeq;
  reader.onload = () => {
    if (!isValid()) return;   // 弹窗已关闭 或 又选了新图（本读取已过期），丢弃旧结果
    pendingImage = reader.result;
    const p = q('#f-preview');
    if (p) { p.src = reader.result; p.style.display = 'block'; }
    imageReading = false;
    const btn = q('#btn-save');
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  };
  reader.onerror = () => {
    if (!isValid()) return;
    imageReading = false;
    pendingFile = null;
    pendingImage = null;
    input.value = '';
    const preview = q('#f-preview');
    preview.src = preview.dataset.original || '';
    preview.style.display = preview.dataset.original ? 'block' : 'none';
    toast('图片读取失败，请重试');
    const btn = q('#btn-save');
    if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  };
  reader.readAsDataURL(f);
}

function imageField(label, path) {
  const src = esc(Bridge.isReal() ? imgUrl(path) : path || '');
  return `<div class="form-row"><label>${label}</label>
      <input type="file" id="f-file" accept="image/jpeg,image/png,image/webp" onchange="previewImage(this)">
      <img id="f-preview" src="${src}" data-original="${src}" alt="预览" style="display:${src ? 'block' : 'none'};max-width:100%;max-height:120px;margin-top:8px;border-radius:6px"></div>`;
}

async function submitContent(action, payload) {
  const session = modalSession;
  const save = q('#btn-save');
  if (save.disabled) return false;
  save.disabled = true;
  q('#f-file').disabled = true;
  try {
    return await Bridge.mutate(action, payload);
  } finally {
    if (session === modalSession) {
      save.disabled = false;
      q('#f-file').disabled = false;
    }
  }
}

function openBannerModal(id = null) {
  state.editId = id; pendingImage = null; pendingFile = null; imageReading = false;
  const b = id ? DB.banners.find(x => x.id === id) : { title: '', image: '', link: '', sort: nextSort(DB.banners) };
  openModal(`<h3>${id ? '编辑' : '新增'} Banner</h3>
    <div class="form-row"><label>标题 *</label><input id="f-title" value="${esc(b.title)}"><div class="err" id="e-title"></div></div>
    ${imageField(id ? '图片（不换图时保留原图）' : Bridge.isReal() ? '图片 *' : '图片（选填）', b.image)}
    <div class="form-row"><label>跳转链接</label><input id="f-link" value="${esc(b.link)}"></div>
    <div class="form-row"><label>排序（整数，选填）</label><input type="text" inputmode="numeric" id="f-sort" value="${b.sort}"><div class="err" id="e-sort"></div></div>
    <div class="modal-actions"><button onclick="closeModal()">取消</button><button class="primary" id="btn-save" onclick="saveBanner()">保存</button></div>`);
}
async function saveBanner() {
  if (imageReading) { toast('图片还在读取中，请稍候'); return; }
  clearErrors();
  const title = q('#f-title').value.trim(), sortRaw = q('#f-sort').value.trim(), sortNum = Number(sortRaw);
  let ok = true;
  if (!title) { q('#e-title').textContent = '标题不能为空'; ok = false; }
  if (sortRaw !== '' && (!/^[+-]?\d+$/.test(sortRaw) || !Number.isSafeInteger(sortNum))) { q('#e-sort').textContent = '排序必须为安全整数'; ok = false; }
  if (!ok) return;
  const data = { title, link: q('#f-link').value.trim() };
  const real = Bridge.isReal();
  const editId = state.editId;
  const existing = editId ? DB.banners.find(x => x.id === editId) : null;
  if (real && !editId && !pendingFile) { toast('请上传 Banner 图片'); return; }
  if (real && data.link && !/^\/(bike|activity)\/[1-9]\d*$/.test(data.link)) {
    toast('请输入有效的跳转路径，如 /bike/1'); return;
  }
  const session = modalSession;
  const localImage = pendingImage;
  const payload = { ...data, sort: sortRaw === '' ? undefined : sortNum, editId, imageFile: pendingFile };
  if (!await submitContent('banner.save', payload)) return;
  data.sort = payload.sort ?? existing?.sort ?? 0;
  const image = (real ? payload.savedImageUrl : localImage) || existing?.image || '';
  if (existing) Object.assign(existing, data, { image });
  else DB.banners.push({ id: payload.savedId ?? nextId(DB.banners), ...data, status: '上架', image });
  if (session === modalSession) closeModal();
  toast('保存成功'); refreshList();
}

function openBikeModal(id = null) {
  state.editId = id; pendingImage = null; pendingFile = null; imageReading = false;
  const b = id ? DB.bikes.find(x => x.id === id) : { name: '', price: '', cc: 150, category: '' };
  // 类别为自由文本（契约里是原文，如“巡航”），用 datalist 给出已有类别作提示，不限制输入
  const known = [...new Set(DB.bikes.map(x => x.category).filter(Boolean))];
  openModal(`<h3>${id ? '编辑' : '新增'}车型</h3>
    <div class="form-row"><label>车型名称 *</label><input id="f-name" value="${esc(b.name)}"><div class="err" id="e-name"></div></div>
    <div class="form-row"><label>类别 *（如 巡航）</label><input id="f-category" list="category-list" value="${esc(b.category || '')}" placeholder="巡航/街车/跑车…"><datalist id="category-list">${known.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist><div class="err" id="e-category"></div></div>
    <div class="form-row"><label>价格（元）*</label><input type="number" id="f-price" min="0" step="0.01" value="${b.price}"><div class="err" id="e-price"></div></div>
    <div class="form-row"><label>排量</label><select id="f-cc">${[...new Set([150,250,300,400,500,b.cc])].filter(Boolean).sort((x, y) => x - y).map(v => `<option ${v == b.cc ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${imageField('封面（选填）', b.cover)}
    <div class="modal-actions"><button onclick="closeModal()">取消</button><button class="primary" id="btn-save" onclick="saveBike()">保存</button></div>`);
}
async function saveBike() {
  if (imageReading) { toast('图片还在读取中，请稍候'); return; }
  clearErrors();
  const name = q('#f-name').value.trim(), price = q('#f-price').value;
  const category = q('#f-category').value.trim();
  let ok = true;
  if (!name) { q('#e-name').textContent = '车型名称不能为空'; ok = false; }
  if (!category) { q('#e-category').textContent = '车型类别不能为空'; ok = false; }   // v1.6 必填
  if (!/^\d+(?:\.\d{1,2})?$/.test(price) || !Number.isSafeInteger(Adapt.yuanToFen(Number(price)))) { q('#e-price').textContent = '价格须为非负金额，最多两位小数'; ok = false; }
  if (!ok) return;
  const data = { name, category, price: Number(price), cc: Number(q('#f-cc').value) };
  const session = modalSession;
  const real = Bridge.isReal();
  const localImage = pendingImage;
  const editId = state.editId;
  const existing = editId ? DB.bikes.find(x => x.id === editId) : null;
  const payload = { ...data, editId, imageFile: pendingFile };
  if (!await submitContent('bike.save', payload)) return;
  const cover = (real ? payload.savedImageUrl : localImage) || existing?.cover || '';
  if (existing) Object.assign(existing, data, { cover });
  else DB.bikes.unshift({ id: payload.savedId ?? nextId(DB.bikes), ...data, cover, status: '上架' });
  if (session === modalSession) closeModal();
  toast('保存成功'); refreshList();
}

function confirmDelete(type, id) {
  openModal(`<h3>二次确认</h3><p style="color:#666">确定删除这条记录吗？删除后不可恢复。</p>
    <div class="modal-actions"><button onclick="closeModal()">取消</button><button class="danger" onclick="doDelete('${type}',${id})">确认删除</button></div>`);
}
async function doDelete(type, id) {
  const key = { banner: 'banners', bike: 'bikes' }[type];
  const action = type === 'banner' ? 'banner.delete' : 'bike.delete';
  if (!await Bridge.mutate(action, { id })) return;
  const i = DB[key].findIndex(x => x.id === id); if (i > -1) DB[key].splice(i, 1);
  closeModal(); toast('已删除'); refreshList();
}

document.querySelectorAll('.sidebar nav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setPage(a.dataset.page); }));

/* 启动：应用联调配置；真实模式先登录再渲染 */
async function boot() {
  Bridge.applyConfig();
  updateModeBadge();
  if (Bridge.isReal()) {
    if (typeof Perm === 'undefined' || !Perm.hasSession()) {
      const ok = await Bridge.showLogin();
      if (!ok) { toast('未登录，接口请求可能返回 401'); }
    }
    await Bridge.loadAll();
  }
  render();
}
function updateModeBadge() {
  const el = q('#mode-badge');
  if (!el) return;
  el.textContent = Bridge.isReal() ? '● 联调模式' : '● 演示模式';
  el.style.color = Bridge.isReal() ? '#c0392b' : '#888';
}
async function toggleMode() {
  const real = !Bridge.isReal();
  const base = real ? prompt('输入后端地址（留空用已保存地址），例如 http://192.168.1.10:3000', Bridge.baseURL) : '';
  if (base === null || !Bridge.setReal(real, base.trim() || undefined)) return;
  const url = new URL(location.href);
  url.searchParams.delete('base');
  url.searchParams.set('real', real ? '1' : '0');
  location.replace(url.href);
}
boot();
