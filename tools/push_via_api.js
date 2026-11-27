'use strict';

/**
 * 通过 GitHub REST API 把本目录推送到指定分支，不需要本机安装 Git。
 *
 * 用法：
 *   $env:GITHUB_TOKEN = "github_pat_xxx"   # 只需 repo 读写权限，建议 1—7 天过期
 *   node tools/push_via_api.js --dry-run
 *   node tools/push_via_api.js --base main --branch feature/lumenh26-integration
 *
 * 可选：
 *   --owner Lxyzc0927
 *   --repo Banner
 *   --base main            以 main 为基线（默认 main，保留 miniprogram/、admin/、DESIGN.md 等主线文件）
 *   --branch feature/lumenh26
 *   --reset                重置已有分支：以 main 的 tree + 本目录文件重建，force 更新该分支
 *   --force                目标分支已存在且与 main 分叉时，强制覆盖目标分支
 *   --merge-main           推送后尝试合并到 main（main 受保护时会失败，交给组长）
 *
 * 说明：
 * - 从 --base 的 tree 开始，只叠加本目录文件；不会删除 base 里的 miniprogram/、admin/。
 * - 不会覆盖根目录 README.md（团队 README 保留），只上传 README-D.md。
 * - 不会上传 .env、server/data、node_modules、临时渲染目录；server/data/app.db 不会进入提交。
 * - 使用 base_tree 只新增/覆盖本模块文件，不删除仓库里已有文件。
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OWNER = arg('owner', process.env.GITHUB_OWNER || 'Lxyzc0927');
const REPO = arg('repo', process.env.GITHUB_REPO || 'Banner');
const BASE_BRANCH = arg('base', process.env.GITHUB_BASE || 'main');
const BASE_EXPLICIT = process.argv.includes('--base');
const BRANCH = arg('branch', process.env.GITHUB_BRANCH || 'feature/lumenh26');
const TOKEN = process.env.GITHUB_TOKEN || '';
const DRY_RUN = process.argv.includes('--dry-run');
const MERGE_MAIN = process.argv.includes('--merge-main');
const FORCE = process.argv.includes('--force');
const RESET = process.argv.includes('--reset');

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : fallback;
}

const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'data', '.deck_tmp', '.tmp-edge-profile']);
const EXCLUDE_DIR_PATTERN = /(^|[\\/])(\.dsh-office-|\.tmp-)/;
const EXCLUDE_FILES = new Set(['.env', 'README.md', 'Thumbs.db', '.DS_Store']);

function collectFiles(dir = ROOT, relative = '') {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      if (EXCLUDE_DIR_PATTERN.test(rel)) continue;
      result.push(...collectFiles(path.join(dir, entry.name), rel));
      continue;
    }
    if (!entry.isFile()) continue;
    if (EXCLUDE_FILES.has(entry.name)) continue;
    if (/\.(db|db-wal|db-shm|log)$/i.test(entry.name)) continue;
    if (rel.startsWith('server/data/')) continue;
    const full = path.join(dir, entry.name);
    result.push({ full, rel: rel.replaceAll('\\', '/'), size: fs.statSync(full).size });
  }
  return result;
}

async function github(method, endpoint, body) {
  const response = await fetch(`https://api.github.com${endpoint}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // ignore
  }
  if (!response.ok) {
    const message = json?.message || text.slice(0, 300);
    throw new Error(`GitHub API ${method} ${endpoint} -> HTTP ${response.status}: ${message}`);
  }
  return json;
}

async function blobFor(file) {
  const content = fs.readFileSync(file.full).toString('base64');
  return github('POST', `/repos/${OWNER}/${REPO}/git/blobs`, {
    content,
    encoding: 'base64',
  });
}

async function main() {
  const files = collectFiles();
  const total = files.reduce((sum, file) => sum + file.size, 0);
  console.log(`目标: ${OWNER}/${REPO} @ ${BRANCH}`);
  console.log(`基线: ${BASE_BRANCH}（保留 miniprogram/、admin/、DESIGN.md 等主线文件）`);
  console.log(`文件: ${files.length} 个，${(total / 1024 / 1024).toFixed(2)} MB`);
  console.log(`排除: 根 README.md / .env / server/data / node_modules / 临时渲染目录`);
  for (const file of files.slice(0, 12)) console.log(`  + ${file.rel}`);
  if (files.length > 12) console.log(`  ... 另有 ${files.length - 12} 个文件`);

  if (DRY_RUN) {
    console.log('\n[dry-run] 只列出文件，不调用 GitHub API。');
    return;
  }
  if (!TOKEN) {
    throw new Error('缺少 GITHUB_TOKEN。请创建 Personal Access Token（repo 读写权限），然后设置环境变量。');
  }

  // 1. 找到目标分支；已存在时默认以它自身为基线做增量提交。
  //    首次创建集成分支时以 main 为基线，从而保留 miniprogram/、admin/。
  let targetRef = null;
  try {
    targetRef = await github('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  } catch (error) {
    if (!/HTTP 404/.test(error.message)) throw error;
  }
  const effectiveBase = RESET ? BASE_BRANCH : (targetRef && !BASE_EXPLICIT ? BRANCH : BASE_BRANCH);
  if (RESET && BRANCH === 'main') throw new Error('--reset 不能用于 main');
  const baseRef = await github('GET', `/repos/${OWNER}/${REPO}/git/ref/heads/${effectiveBase}`);
  const baseSha = baseRef.object.sha;
  const baseCommit = await github('GET', `/repos/${OWNER}/${REPO}/git/commits/${baseSha}`);
  console.log(`\n基线 ${effectiveBase}: ${baseSha.slice(0, 8)}${RESET ? '（reset 模式）' : ''}`);

  // 2. 上传 blob（并发 5，避免触发二级限流）
  const treeEntries = [];
  const queue = [...files];
  const workers = Array.from({ length: Math.min(5, queue.length) }, async () => {
    while (queue.length) {
      const file = queue.shift();
      const blob = await blobFor(file);
      treeEntries.push({ path: file.rel, mode: '100644', type: 'blob', sha: blob.sha });
      process.stdout.write(`  ↑ ${file.rel}\n`);
    }
  });
  await Promise.all(workers);

  // 3. 创建 tree（以 main 的 tree 为底，保留前端）
  const tree = await github('POST', `/repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: baseCommit.tree.sha,
    tree: treeEntries,
  });
  console.log(`\n新 tree: ${tree.sha.slice(0, 8)}，叠加 ${treeEntries.length} 个文件`);

  // 4. 创建 commit（父提交是 main，而不是旧 D 分支）
  const message = 'feat(d): 登录、用户、活动、报名、分析与 AI 解读';
  const commit = await github('POST', `/repos/${OWNER}/${REPO}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [baseSha],
  });
  console.log(`新 commit: ${commit.sha.slice(0, 8)}`);

  // 5. 创建或更新集成分支
  if (!targetRef) {
    await github('POST', `/repos/${OWNER}/${REPO}/git/refs`, {
      ref: `refs/heads/${BRANCH}`,
      sha: commit.sha,
    });
    console.log(`✓ 已创建 ${BRANCH}: ${commit.sha.slice(0, 8)}`);
  } else {
    await github('PATCH', `/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
      sha: commit.sha,
      force: FORCE || RESET,
    });
    console.log(`✓ 已${RESET ? '重置' : '更新'} ${BRANCH}: ${commit.sha.slice(0, 8)}`);
  }
  console.log(`  https://github.com/${OWNER}/${REPO}/tree/${BRANCH}`);

  if (MERGE_MAIN) {
    try {
      const merge = await github('POST', `/repos/${OWNER}/${REPO}/merges`, {
        base: 'main',
        head: BRANCH,
        commit_message: 'merge: D 模块（登录 / 用户 / 活动 / 分析）',
      });
      console.log(`✓ 已合并到 main: ${merge?.sha?.slice(0, 8) || 'ok'}`);
    } catch (error) {
      console.warn(`! 合并 main 失败（可能需要组长操作或 main 受保护）：${error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  process.exit(1);
});
