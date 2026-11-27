# -*- coding: utf-8 -*-
"""生成审查修复的 unified diff，便于手动对照。"""
import difflib
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
SHA = "7898247eb43fee0343f424b7ed579f0fe2dcab71"
RAW = f"https://raw.githubusercontent.com/Lxyzc0927/Banner/{SHA}/"

FILES = [
    ".env.example",
    "server/src/config.js",
    "server/src/server.js",
    "server/src/security.js",
    "server/src/auth.js",
    "server/src/modules/auth/routes.js",
    "server/src/modules/users/routes.js",
    "server/src/modules/activities/routes.js",
    "server/src/modules/track/routes.js",
    "server/src/modules/analytics/service.js",
    "server/src/modules/analytics/ai.js",
    "server/src/scripts/report.js",
    "server/public/admin/app.js",
    "server/tests/api.test.js",
]

out = [
    "# 审查修复 unified diff",
    "",
    f"# 基线：Lxyzc0927/Banner @ {SHA}",
    "# 说明：+ 为新增行，- 为删除行；security.js 是新增文件。",
    "",
]

for rel in FILES:
    local_path = ROOT / rel
    local = local_path.read_text(encoding="utf-8").splitlines(keepends=True) if local_path.exists() else []
    try:
        remote = urlopen(RAW + rel, timeout=20).read().decode("utf-8").splitlines(keepends=True)
    except Exception:
        remote = []
    diff = list(
        difflib.unified_diff(
            remote,
            local,
            fromfile=f"a/{rel}",
            tofile=f"b/{rel}",
            n=4,
            lineterm="\n",
        )
    )
    if diff:
        out.extend(diff)
        out.append("\n")

target = ROOT / "reports" / "review-fixes.diff"
target.write_text("".join(out), encoding="utf-8")
print(target, len("".join(out)))
