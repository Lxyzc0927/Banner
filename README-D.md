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
- [`docs/12-前后端数据对接.md`](docs/12-前后端数据对接.md)
- [`docs/13-接口文档修正清单.md`](docs/13-接口文档修正清单.md)
- [`docs/11-交付物清单.md`](docs/11-交付物清单.md)

## 和 C 的后端骨架怎么合并

当前 `server/` 是一套可运行的参考骨架（HTTP 装配、SQLite、JWT、自动路由）。如果 C 已经搭了后端骨架：

1. **保留 C 的** `server/src/app.js`、`server/src/db.js`、`server/src/http.js`、`server/package.json`。
2. 把本模块的 `server/src/modules/{auth,users,admins,activities,analytics,track}/`、`server/sql/`、`server/src/scripts/` 接进去。
3. `app.js` 若没有自动路由，加一行注册 `modules/*/routes.js`；这是一次公共文件修改，单独提交并同步 C。
4. 表结构以 C 的数据库为准；把 `schema.sql` 拆成新增表 / 字段迁移，不要 `DROP`。
5. 合并后跑 `npm test` 和主链路：登录 → 活动 → 报名 → 统计 → 看板。

如果 C 还没推骨架，可以直接以当前 `server/` 为初始后端，再让 C 补车型 / 内容 / 收藏 / 客服模块。

## 在现有 `feature/lumenh26` 上修复（不新建分支）

旧分支的问题不是代码内容，而是**缺少主线前端的历史**：它里面没有 `miniprogram/`、`admin/`，直接合 `main` 会被当成删除。修复方式是先把 main 的前端恢复到现有分支，再叠加 D 的后端。

### 方式 A：本机有 Git

```bash
git fetch origin
git switch feature/lumenh26

# 1. 从 main 恢复被删掉的前端目录（只恢复，不覆盖 D 的后端）
git checkout origin/main -- miniprogram admin .impeccable DESIGN.md PRODUCT.md

# 2. 如果旧提交里跟踪了数据库，先移出 Git（保留本地文件可加 --cached 去掉）
git rm --cached server/data/app.db 2>/dev/null || true

# 3. 把最新 D 的 server/、docs/、reports/ 覆盖进来
#    不要动 miniprogram/、admin/、DESIGN.md、PRODUCT.md
git add server docs reports .env.example .gitignore package.json README-D.md

git commit -m "fix(d): 恢复小程序/管理后台并同步 D 后端"
git push origin feature/lumenh26
```

推送前检查没有删除前端：

```bash
git diff --name-status origin/main...HEAD | Select-String '^D\s+(miniprogram|admin)/'
```

没有输出才可以让组长合并 `feature/lumenh26`。

### 方式 B：本机没有 Git，用 GitHub API 重置现有分支

GitHub 已经不支持用账户密码直接 push，必须用 **Personal Access Token（PAT）**。不要把自己的 GitHub 密码发给别人。

```powershell
cd "C:\Users\lh060\Desktop\moto-sales-platform"
$env:GITHUB_TOKEN = "ghp_你的token"

node tools/push_via_api.js --dry-run --reset --base main --branch feature/lumenh26
node tools/push_via_api.js --reset --base main --branch feature/lumenh26
```

`--reset` 会：

- 以 `main` 的 tree 为底，保留 `miniprogram/`、`admin/`、`DESIGN.md`、`PRODUCT.md`、`.impeccable/`；
- 只叠加 D 的 `server/`、`docs/`、`reports/` 等文件；
- 不上传 `.env`、`server/data`、`node_modules`、临时目录，**不会把 `app.db` 带进提交**；
- 强制更新现有 `feature/lumenh26`，不新建分支、不直接动 `main`。

> `--reset` 会重写 D 分支历史；推送前在群里说一声，确认没有别人基于旧 D 分支开发。
> Token 等同于密码，不要提交到 Git、不要发到群里。上传完成后可以在 GitHub 设置里立即撤销。

## 说明

- 大模型调用已实现；当前 `reports/` 里的样例是在没有 `LLM_API_KEY` 的情况下生成的 **规则兜底** 版本（`source=fallback`）。配置 Key 后重新执行 `npm run report` 即为真实大模型版本。
- `npm run db:reset` 前先停掉服务，避免 Windows 数据库文件占用。
