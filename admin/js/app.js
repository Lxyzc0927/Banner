/* 管理后台骨架：所有交互演示版，接口就绪后把 DB 换成后端数据 */
const state = { page: 'home', keyword: '', pageNo: 1, pageSize: 8, editId: null };
const PAGE_META = {
  home: { title: '首页内容管理', desc: '管理 Banner 图与新车资讯，新增/编辑/上下架/排序' },
  bike: { title: '车型管理', desc: '车型主数据与图集：完整 CRUD、参数校验、图片上传、分页搜索' },
  activity: { title: '活动管理', desc: '活动发布与下架、报名人数统计、名单导出' },
  user: { title: '用户管理', desc: '后台账号角色权限（至少两角色）、C 端用户查询与禁用' },
  analysis: { title: '数据分析', desc: '基于模拟数据出图：模块热度、访问趋势、转化漏斗' }
};

function q(sel) { return document.querySelector(sel); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function toast(msg) { alert(msg); }

function setPage(page) {
  state.page = page; state.keyword = ''; state.pageNo = 1;
  document.querySelectorAll('.sidebar nav a').forEach(a => a.classList.toggle('active', a.dataset.page === page));
  q('#page-title').textContent = PAGE_META[page].title;
  q('#page-desc').textContent = PAGE_META[page].desc;
  render();
}

function render() {
  const map = { home: renderHome, bike: renderBike, activity: renderActivity, user: renderUser, analysis: renderAnalysis };
  map[state.page]();
}

function tableHTML(headers, rows) {
  return `<div class="card"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}"><div class="empty">暂无数据<div><button onclick="clearFilter()">清除筛选</button></div></div></td></tr>`}</tbody></table></div>`;
}

function pagerHTML(total) {
  const pages = Math.max(1, Math.ceil(total / state.pageSize));
  let btns = '';
  for (let i = 1; i <= pages; i++) btns += `<button class="small ${i === state.pageNo ? 'primary' : ''}" onclick="goPage(${i})">${i}</button>`;
  return `<div class="pager">共 ${total} 条 · 第 ${state.pageNo}/${pages} 页 ${btns}</div>`;
}

function goPage(n) { state.pageNo = n; render(); }
function clearFilter() { state.keyword = ''; state.pageNo = 1; const i = q('#kw'); if (i) i.value = ''; render(); }
function onSearch(v) { state.keyword = v.trim(); state.pageNo = 1; render(); }
function pageSlice(arr) { return arr.slice((state.pageNo - 1) * state.pageSize, state.pageNo * state.pageSize); }

function searchBar(placeholder, extra = '') {
  return `<div class="toolbar"><input id="kw" placeholder="${placeholder}" value="${esc(state.keyword)}" oninput="onSearch(this.value)">${extra}</div>`;
}

/* 首页内容管理 */
function renderHome() {
  const kw = state.keyword.toLowerCase();
  const list = DB.banners.filter(b => !kw || b.title.toLowerCase().includes(kw));
  const rows = pageSlice(list).map(b => `<tr>
    <td>${b.id}</td><td>${esc(b.title)}</td>
    <td>${b.image ? `<img src="${esc(b.image)}" width="48" height="28" style="object-fit:cover">` : '<span style="color:#aaa">未上传</span>'}</td>
    <td>${esc(b.link) || '-'}</td><td>${b.sort}</td>
    <td><span class="tag ${b.status === '上架' ? 'tag-on' : 'tag-off'}">${b.status}</span></td>
    <td><button class="small" onclick="toggleBanner(${b.id})">${b.status === '上架' ? '下架' : '上架'}</button>
        <button class="small" onclick="openBannerModal(${b.id})">编辑</button>
        <button class="small danger" onclick="confirmDelete('banner',${b.id})">删除</button></td></tr>`);
  q('#content').innerHTML = searchBar('搜索 Banner 标题…', `<button class="primary" onclick="openBannerModal()">+ 新增 Banner</button>`) + tableHTML(['ID', '标题', '图片', '跳转链接', '排序', '状态', '操作'], rows) + pagerHTML(list.length);
}

function toggleBanner(id) {
  const b = DB.banners.find(x => x.id === id); b.status = b.status === '上架' ? '下架' : '上架';
  toast('状态已更新，小程序端刷新即可生效'); render();
}

/* 车型管理 */
function renderBike() {
  const kw = state.keyword.toLowerCase();
  const list = DB.bikes.filter(b => !kw || b.name.toLowerCase().includes(kw));
  const rows = pageSlice(list).map(b => `<tr>
    <td>${b.id}</td><td>${esc(b.name)}</td><td>¥${b.price.toLocaleString()}</td><td>${b.cc}cc</td>
    <td><span class="tag ${b.status === '上架' ? 'tag-on' : 'tag-off'}">${b.status}</span></td>
    <td><button class="small" onclick="openBikeModal(${b.id})">编辑</button>
        <button class="small danger" onclick="confirmDelete('bike',${b.id})">删除</button></td></tr>`);
  q('#content').innerHTML = searchBar('搜索车型名称…', `<button class="primary" onclick="openBikeModal()">+ 新增车型</button>`) + tableHTML(['ID', '车型名称', '价格(元)', '排量', '状态', '操作'], rows) + pagerHTML(list.length);
}

/* 活动管理 */
function renderActivity() {
  const kw = state.keyword.toLowerCase();
  const list = DB.activities.filter(a => !kw || a.name.toLowerCase().includes(kw));
  const rows = list.map(a => `<tr>
    <td>${a.id}</td><td>${esc(a.name)}</td><td>${a.date}</td><td>${a.signup}/${a.quota}</td>
    <td><span class="tag ${a.status === '进行中' ? 'tag-on' : a.status === '已结束' ? 'tag-off' : 'tag-warn'}">${a.status}</span></td>
    <td><button class="small" onclick="toggleActivity(${a.id})">${a.status === '未开始' ? '发布' : '下架'}</button>
        <button class="small" onclick="toast('报名名单已导出（演示）：' + DB.signups.map(s=>s.name).join('、'))">导出名单</button></td></tr>`);
  q('#content').innerHTML = searchBar('搜索活动名称…', `<button class="primary" onclick="toast('活动发布表单：接入 POST /api/activities')">+ 发布活动</button>`) +
    tableHTML(['ID', '活动名称', '日期', '报名人数/名额', '状态', '操作'], rows);
}

function toggleActivity(id) {
  const a = DB.activities.find(x => x.id === id);
  a.status = a.status === '未开始' ? '进行中' : '已结束'; toast('活动状态已更新'); render();
}

/* 用户管理 */
function renderUser() {
  const kw = state.keyword.toLowerCase();
  const list = DB.users.filter(u => !kw || u.name.toLowerCase().includes(kw));
  const rows = pageSlice(list).map(u => `<tr>
    <td>${u.id}</td><td>${esc(u.name)}</td><td>${u.phone}</td>
    <td><span class="tag ${u.status === '正常' ? 'tag-on' : 'tag-off'}">${u.status}</span></td>
    <td><button class="small" onclick="toggleUser(${u.id})">${u.status === '正常' ? '禁用' : '启用'}</button></td></tr>`);
  const adminRows = DB.admins.map(a => `<tr><td>${a.id}</td><td>${esc(a.name)}</td><td>${a.role}</td><td>${a.status}</td>
    <td><button class="small" onclick="toast('角色配置：接入 PUT /api/admins/${a.id}/role')">改角色</button></td></tr>`).join('');
  q('#content').innerHTML = searchBar('搜索 C 端用户…') +
    `<div class="two-col"><div><h3 style="font-size:13px;color:#666;margin-bottom:8px">后台账号（角色权限，至少两角色）</h3>
     ${tableHTML(['ID', '账号', '角色', '状态', '操作'], [adminRows])}</div>
     <div><h3 style="font-size:13px;color:#666;margin-bottom:8px">C 端用户</h3>${tableHTML(['ID', '昵称', '手机号', '状态', '操作'], rows)}${pagerHTML(list.length)}</div></div>`;
}

function toggleUser(id) {
  const u = DB.users.find(x => x.id === id); u.status = u.status === '正常' ? '禁用' : '正常'; toast('用户状态已更新'); render();
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
function openModal(html) { q('#modal-root').innerHTML = `<div class="mask"><div class="modal">${html}</div></div>`; }
function closeModal() { q('#modal-root').innerHTML = ''; }

function openBannerModal(id = null) {
  state.editId = id; const b = id ? DB.banners.find(x => x.id === id) : { title: '', image: '', link: '', sort: DB.banners.length + 1 };
  openModal(`<h3>${id ? '编辑' : '新增'} Banner</h3>
    <div class="form-row"><label>标题 *</label><input id="f-title" value="${esc(b.title)}"><div class="err" id="e-title"></div></div>
    <div class="form-row"><label>图片（本地预览，接入 Upload 接口后持久化）</label><input type="file" id="f-file" accept="image/*"></div>
    <div class="form-row"><label>跳转链接</label><input id="f-link" value="${esc(b.link)}"></div>
    <div class="form-row"><label>排序</label><input type="number" id="f-sort" value="${b.sort}"><div class="err" id="e-sort"></div></div>
    <div class="modal-actions"><button onclick="closeModal()">取消</button><button class="primary" onclick="saveBanner()">保存</button></div>`);
}

function saveBanner() {
  const title = q('#f-title').value.trim(), sort = q('#f-sort').value;
  let ok = true;
  if (!title) { q('#e-title').textContent = '标题不能为空'; ok = false; }
  if (!sort || Number(sort) < 1) { q('#e-sort').textContent = '排序必须为正整数'; ok = false; }
  if (!ok) return;
  const data = { title, link: q('#f-link').value.trim(), sort: Number(sort) };
  if (state.editId) Object.assign(DB.banners.find(x => x.id === state.editId), data);
  else DB.banners.push({ id: DB.banners.length + 1, ...data, image: '', status: '上架' });
  closeModal(); toast('保存成功（演示数据）'); render();
}

function openBikeModal(id = null) {
  state.editId = id; const b = id ? DB.bikes.find(x => x.id === id) : { name: '', price: '', cc: 150 };
  openModal(`<h3>${id ? '编辑' : '新增'}车型</h3>
    <div class="form-row"><label>车型名称 *</label><input id="f-name" value="${esc(b.name)}"><div class="err" id="e-name"></div></div>
    <div class="form-row"><label>价格（元）*</label><input type="number" id="f-price" value="${b.price}"><div class="err" id="e-price"></div></div>
    <div class="form-row"><label>排量</label><select id="f-cc">${[150,250,300,400,500].map(v => `<option ${v == b.cc ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="modal-actions"><button onclick="closeModal()">取消</button><button class="primary" onclick="saveBike()">保存</button></div>`);
}

function saveBike() {
  const name = q('#f-name').value.trim(), price = q('#f-price').value;
  let ok = true;
  if (!name) { q('#e-name').textContent = '车型名称不能为空'; ok = false; }
  if (!price || Number(price) <= 0) { q('#e-price').textContent = '价格必须大于 0'; ok = false; }
  if (!ok) return;
  const data = { name, price: Number(price), cc: Number(q('#f-cc').value) };
  if (state.editId) Object.assign(DB.bikes.find(x => x.id === state.editId), data);
  else DB.bikes.unshift({ id: DB.bikes.length + 1, ...data, status: '上架' });
  closeModal(); toast('保存成功（演示数据）'); render();
}

function confirmDelete(type, id) {
  openModal(`<h3>二次确认</h3><p style="color:#666">确定删除这条记录吗？删除后不可恢复。</p>
    <div class="modal-actions"><button onclick="closeModal()">取消</button><button class="danger" onclick="doDelete('${type}',${id})">确认删除</button></div>`);
}
function doDelete(type, id) {
  const key = { banner: 'banners', bike: 'bikes' }[type];
  const i = DB[key].findIndex(x => x.id === id); if (i > -1) DB[key].splice(i, 1);
  closeModal(); toast('已删除（演示数据）'); render();
}

document.querySelectorAll('.sidebar nav a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); setPage(a.dataset.page); }));
render();
