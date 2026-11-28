# 07 · Git 分支上传与合并

> 组长的仓库已经在 `main` 上分好了四条分支。现在不需要 Pull Request：每个人在自己的分支里提交、推送，然后把分支合并回 `main` 即可。
>
> 目标仍然是：**四个人尽量不产生代码冲突，`main` 随时能演示。**
>
> ⚠️ **D 的分支如果曾经删除过 `miniprogram/` / `admin/`，不要直接合入 `main`。** 从最新 `main` 新建 `feature/lumenh26-integration`，只叠加 `server/` / `docs/` / `reports/`。合并前用 `git diff --name-status origin/main...HEAD` 确认没有 `D miniprogram/...` 或 `D admin/...`。

## 1. 先确认分支名

不要凭记忆写分支名，先看远程分支：

```bash
git fetch origin
git branch -a
```

常见命名（以组长实际创建为准）：

```text
main
├── feat/auth-users      登录 / 手机号 / 后台账号 / C 端用户
├── feat/activities      活动发布 / 报名 / 统计 / 导出
├── feat/analytics       模拟数据 / 热度 / 趋势 / 漏斗 / AI
└── feat/admin-ui        后台演示控制台
```

下面命令里的 `<你的分支>` 替换成实际分支名，例如 `feat/activities`。

### 1.1 D 的现有分支修复（不新建分支）

D 的 `feature/lumenh26` 如果曾经删除过 `miniprogram/` 或 `admin/`，先把 main 的前端恢复到现有分支，再合并：

```bash
git fetch origin
git switch feature/lumenh26

# 从 main 恢复被删掉的前端目录
git checkout origin/main -- miniprogram admin .impeccable DESIGN.md PRODUCT.md

# 数据库不要进 Git（如果旧提交跟踪了）
git rm --cached server/data/app.db 2>/dev/null || true

# 再覆盖最新 D 后端与文档
git add server docs reports package.json .env.example .gitignore README-D.md
git commit -m "fix(d): 恢复小程序/管理后台并同步 D 后端"
git push origin feature/lumenh26
```

合并前检查：

```bash
git diff --name-status origin/main...HEAD | Select-String '^D\s+(miniprogram|admin)/'
```

有输出就是危险：说明这次分支仍会删除前端，不要合并。没有输出再让组长合入 `main`。

如果本机没有 Git，可以用 API 脚本重置现有分支（会 force 更新，先和组内确认）：

```powershell
node tools/push_via_api.js --reset --base main --branch feature/lumenh26
```

## 2. 第一次拉代码

```bash
git clone https://github.com/<org>/<repo>.git
cd <repo>

git fetch origin
git switch <你的分支>          # 如果本地没有，会自动跟踪 origin/<你的分支>
```

确认自己在哪里、有没有未提交改动：

```bash
git status
git branch --show-current
```

## 3. 把本模块文件放进分支

只复制自己负责的目录，不要整包覆盖别人的代码。推荐顺序：

### 分支 `feat/auth-users`

```text
server/src/modules/auth/
server/src/modules/users/
server/src/modules/admins/
server/src/modules/system/
server/src/middleware.js
server/src/auth.js
server/src/wechat.js
server/sql/schema.sql（admin_user / c_user 部分）
server/tests/api.test.js（登录 / 用户用例）
docs/01-需求与范围.md
docs/04-API.md（登录 / 用户章节）
```

### 分支 `feat/activities`

```text
server/src/modules/activities/
server/sql/schema.sql（activity / signup 部分）
server/src/csv.js
server/tests/api.test.js（活动 / 报名用例）
docs/04-API.md（活动 / 报名章节）
```

### 分支 `feat/analytics`

```text
server/src/modules/analytics/
server/src/scripts/generate-mock.js
server/src/scripts/report.js
reports/
server/public/admin/
docs/05-分析口径.md
docs/06-AI解读.md
server/tests/api.test.js（分析用例）
```

> 如果组长已经放了 `server/` 骨架，先看他的 `app.js` 怎么注册路由、`db.js` 用什么驱动。能接进现有结构就接，不要为了“我的代码能跑”把别人的目录删掉。

## 4. 每天的工作流

```bash
# 1. 切到自己的分支
git switch <你的分支>

# 2. 先拉 main，减少最后合并的冲突
git fetch origin
git merge origin/main

# 3. 改代码 / 跑测试
npm test
npm run mock -- --clear --days 30 --sessions 1800 --seed 42
npm run report

# 4. 看自己改了什么，只提交自己的文件
git status
git diff --stat
git add server/src/modules/activities server/tests/api.test.js docs/04-API.md
git commit -m "feat(activity): 报名事务内校验名额并防重"

# 5. 推送自己的分支
git push -u origin <你的分支>
```

> 每天开工先 `git merge origin/main`，不要等到最后一天才合。冲突越晚处理越贵。

## 5. 合并回 main

### 方式 A：自己有 main 权限（推荐）

```bash
# 1. 确保分支已推送、测试通过
git switch <你的分支>
npm test
git push

# 2. 切 main，拉最新
git switch main
git pull origin main

# 3. 合并分支（保留分支上的提交，方便看过程）
git merge --no-ff <你的分支> -m "merge: 活动与报名模块"

# 4. 合并后必须再跑一遍
npm test
npm run db:reset
npm run mock -- --clear --days 30 --sessions 1800 --seed 42
npm run report

# 5. 推 main
git push origin main
```

### 方式 B：main 受保护，自己不能 push

让组长或有权限的同学在本地执行上面的合并；或者让他在 GitHub 仓库页面：

1. 切到 `main`；
2. 点分支下拉框，选择你的分支；
3. 点 **Merge into main**（GitHub 会生成一个合并提交，不需要 PR）；
4. 合并后让组长跑一遍 `npm test`。

如果你没有权限，**不要**尝试强推 `main`，也不要把 `main` 的规则改掉。

### 方式 C：分支落后 main 很多

先把 main 合进自己的分支，解决冲突，再合回 main：

```bash
git switch <你的分支>
git merge origin/main
# 解决冲突
git add <解决后的文件>
git commit -m "chore: 合并 main 并解决冲突"
npm test
git push
```

然后再按方式 A 合并。

## 6. 冲突怎么处理

```bash
git status                      # 看哪些文件冲突
git diff --name-only --diff-filter=U
```

处理原则：

1. **先看对方为什么改**：`git log --oneline origin/main -- <文件>`。
2. **两边逻辑都要保留**：不要直接 `--ours` / `--theirs` 整文件覆盖。
3. **公共文件冲突找对应负责人确认**：`app.js`、`schema.sql`、`README.md`、`docs/04-API.md`。
4. 解决后：

```bash
git add <文件>
git commit
npm test
git push
```

5. 如果冲突太多，说明任务拆得不够细。把“活动管理”拆成“活动 CRUD”“报名”“统计导出”三次提交，减少一次性大改。

### 常见冲突与避免

| 冲突来源 | 避免方式 |
| --- | --- |
| 四个人都改 `app.js` 注册路由 | 自动扫描 `modules/*/routes.js`，新增模块不改 `app.js` |
| 四个人都改 `schema.sql` | 按表拆提交；新增字段先改文档，合并时组长统一过一遍 |
| 四个人都改 `README` / `docs/04` | 每人只改自己章节；大改先在群里说一声 |
| 前端把接口写死 | 先按 `docs/04-API.md` 联调，字段变了先改文档 |
| 格式化造成大 diff | 统一 2 空格、LF、UTF-8；提交前看 `git diff --stat` |
| 最后一天一次性上传 | 每天 1—2 次提交；中期检查看提交曲线 |

## 7. 提交规范

```text
type(scope): 做了什么
```

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 文档 |
| `test` | 测试 |
| `refactor` | 重构（不改行为） |
| `chore` | 构建、依赖、脚本 |
| `style` | 格式（不改逻辑） |

示例：

```text
feat(auth): 微信登录与手机号授权
feat(users): 后台账号与两种角色
feat(activity): 活动发布、下架与报名防重
feat(analytics): 模块热度、趋势与漏斗接口
feat(ai): 大模型解读与规则兜底
test(activity): 并发抢名额不超卖
fix(activity): 报名冲突时返回已有报名编号
docs(api): 补充活动统计与导出契约
```

要求：

- 一次提交只做一件事；
- 提交信息写“为什么”，不要只写“改了什么”；
- 不提交 `node_modules/`、`.env`、`server/data/*.db`、日志、临时截图；
- 每天至少 1—2 次有意义提交，不要最后一天一次性上传。

## 8. 合并前自查

```bash
git status                         # 工作区干净
git log --oneline -10              # 提交信息清楚
git diff main...<你的分支> --stat  # 只改了自己的目录
npm test                           # 全绿
```

清单：

- [ ] 只改了自己负责的目录；如果改了公共文件，已经在群里说明
- [ ] 没有提交 `.env`、数据库、`node_modules`
- [ ] 新增接口已同步 `docs/04-API.md`
- [ ] 数据库变更说明了新增表 / 字段 / 索引
- [ ] 报名相关改动在事务内完成“查重 + 数名额 + 插入”
- [ ] 权限接口用 operator 账号验证过 403
- [ ] `npm test` 31 个用例通过
- [ ] 合并后主链路能演示：登录 → 活动 → 报名 → 统计 → 看板

## 9. 如果组内已经有一套后端

不要直接覆盖。按下面顺序合并：

1. 读对方的 `server/` 目录、路由注册方式、数据库访问方式。
2. 保留对方的 `app.js` / 数据库连接，只把自己的 `modules/<domain>/routes.js` 接进去。
3. 如果对方没有自动路由，在 `app.js` 加一行注册；这是一次公共文件修改，单独提交一次，并在群里说清楚。
4. 表结构以对方为准；把本模块的 `schema.sql` 拆成 `ALTER TABLE` / 新表，不要 `DROP`。
5. 接口路径如果被占用，用 `/api/admin/analytics/*` 这类前缀避免冲突。
6. 合并后跑 `npm test` 和完整主链路。

## 10. 验收前

```bash
git switch main
git pull origin main
npm test
npm run db:reset
npm run mock -- --clear --days 30 --sessions 1800 --seed 42
npm run report
npm start
```

把 `reports/screenshots/` 的截图放进答辩 PPT；把 `git log --oneline --graph` 截图放进“协作与过程”页。

> 没有 PR 不等于没有评审：合并前至少让一名组员看一眼 `git diff`，合并后立刻跑一遍主链路。出问题能找到人，才算分工。

