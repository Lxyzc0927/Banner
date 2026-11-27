# D · 登录 / 用户 / 活动 / 分析模块

> 这是 @LumenH26 在第十组项目中的模块说明。团队总 README 仍以仓库根目录的 `README.md` 为准，本文件不覆盖它。

本模块对应课程分工 D：

- 登录与手机号授权
- 后台账号与至少两种角色
- C 端用户查询与禁用
- 活动发布、报名防重与名额校验
- 报名统计与名单导出
- 模拟访问数据、模块热度、访问趋势、转化漏斗
- 调用大模型生成分析解读（无 Key 自动规则兜底）

## 启动

```bash
copy .env.example .env          # macOS/Linux: cp
npm run db:reset
npm run mock -- --clear --days 30 --sessions 1800 --seed 42
npm run report
npm start
```

- 后台演示：<http://127.0.0.1:3000/admin/>
- 健康检查：<http://127.0.0.1:3000/api/health>
- 演示账号：`superadmin / Admin@123456`、`operator / Operator@123`

## 目录

```text
server/
│   ├── src/modules/auth|users|admins|activities|analytics/
│   ├── sql/schema.sql
│   ├── src/scripts/{seed,generate-mock,report}.js
│   ├── tests/api.test.js
│   └── public/admin/          # D 的演示控制台，不占用 B 的顶层 admin/
docs/                          # 需求、架构、数据模型、API、分析口径、测试、演示
reports/                       # 统计报告、AI 解读、截图、答辩 PPT 草稿
```

详细文档见：

- [`docs/01-需求与范围.md`](docs/01-需求与范围.md)
- [`docs/04-API.md`](docs/04-API.md)
- [`docs/05-分析口径.md`](docs/05-分析口径.md)
- [`docs/06-AI解读.md`](docs/06-AI解读.md)
- [`docs/07-Git分支与合并.md`](docs/07-Git分支与合并.md)
- [`docs/11-交付物清单.md`](docs/11-交付物清单.md)

## 和 C 的后端骨架怎么合并

当前 `server/` 是一套可运行的参考骨架（HTTP 装配、SQLite、JWT、自动路由）。如果 C 已经搭了后端骨架：

1. **保留 C 的** `server/src/app.js`、`server/src/db.js`、`server/src/http.js`、`server/package.json`。
2. 把本模块的 `server/src/modules/{auth,users,admins,activities,analytics}/`、`server/sql/`、`server/src/scripts/` 接进去。
3. `app.js` 若没有自动路由，加一行注册 `modules/*/routes.js`；这是一次公共文件修改，单独提交并同步 C。
4. 表结构以 C 的数据库为准；把 `schema.sql` 拆成新增表 / 字段迁移，不要 `DROP`。
5. 合并后跑 `npm test` 和主链路：登录 → 活动 → 报名 → 统计 → 看板。

如果 C 还没推骨架，可以直接以当前 `server/` 为初始后端，再让 C 补车型 / 内容 / 收藏 / 客服模块。

## 上传到 `feature/lumenh26`

### 方式 A：本机有 Git

```bash
git fetch origin
git switch feature/lumenh26

# 只复制 D 的目录；不要覆盖团队 README 和 B 的顶层 admin/
# 建议复制：server/、docs/、reports/、.env.example、.gitignore、package.json、README-D.md

git status
git add server docs reports .env.example .gitignore package.json README-D.md
git commit -m "feat(d): 登录、用户、活动、报名、分析与 AI 解读"
git push origin feature/lumenh26

# 合并回 main（或让组长合并）
git switch main
git pull origin main
git merge --no-ff feature/lumenh26 -m "merge: D 模块"
npm test
git push origin main
```

> 如果 `main` 受保护，由组长合并；不要强推。合并前至少让一名组员看 `git diff --stat` 和 `npm test` 结果。

### 方式 B：本机没有 Git，用 GitHub API 上传

GitHub 已经不支持用账户密码直接 push，必须用 **Personal Access Token（PAT）**。不要把自己的 GitHub 密码发给别人。

1. 打开 GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)。
2. Note 填 `dsh-upload`，Expiration 选 7 天，勾选 **repo**。
3. 生成后复制 `ghp_...`，只放在本机环境变量里：

```powershell
cd "D:\文档\deepseek-harness\default-workspace\moto-sales-platform"
$env:GITHUB_TOKEN = "ghp_你的token"
node tools/push_via_api.js --dry-run   # 先看会传哪些文件
node tools/push_via_api.js             # 推送到 feature/lumenh26
```

脚本会：

- 只新增/覆盖本模块文件，保留仓库已有的 `README.md`；
- 不上传 `.env`、`server/data`、`node_modules`、临时目录；
- 使用 GitHub Git Data API 创建 commit，不需要本机安装 Git；
- 可选 `--merge-main` 尝试合并到 `main`（main 受保护时会失败，交给组长）。

> Token 等同于密码，不要提交到 Git、不要发到群里。上传完成后可以在 GitHub 设置里立即撤销。

## 说明

- 大模型调用已实现；当前 `reports/` 里的样例是在没有 `LLM_API_KEY` 的情况下生成的 **规则兜底** 版本（`source=fallback`）。配置 Key 后重新执行 `npm run report` 即为真实大模型版本。
- `npm run db:reset` 前先停掉服务，避免 Windows 数据库文件占用。
