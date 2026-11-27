# -*- coding: utf-8 -*-
"""生成 8 页答辩 PPT 草稿（骑行运营台模块）。"""
import os
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.oxml.ns import qn
from pptx.oxml.xmlchemy import OxmlElement

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / "reports" / "screenshots"
OUT = ROOT / "reports" / "骑行运营台_答辩草稿.pptx"
TMP = ROOT / "reports" / ".deck_tmp"
TMP.mkdir(parents=True, exist_ok=True)

# 16:9
prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

INK = RGBColor(0x11, 0x18, 0x27)
INK2 = RGBColor(0x37, 0x41, 0x51)
MUTED = RGBColor(0x6B, 0x72, 0x80)
LINE = RGBColor(0xE5, 0xE7, 0xEB)
BG = RGBColor(0xF7, 0xF7, 0xF5)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
RED = RGBColor(0xD9, 0x2D, 0x20)
DARK_RED = RGBColor(0x7F, 0x1D, 0x1D)
ORANGE = RGBColor(0xF9, 0x73, 0x16)
GREEN = RGBColor(0x05, 0x96, 0x69)
BLUE = RGBColor(0x25, 0x63, 0xEB)
SOFT_RED = RGBColor(0xFE, 0xF2, 0xF2)
SOFT_GRAY = RGBColor(0xF3, 0xF4, 0xF6)
FONT = "Microsoft YaHei"
MONO = "Consolas"


def set_font(run, size=14, bold=False, color=INK, font=FONT, italic=False):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = OxmlElement("a:ea")
        rPr.append(ea)
    ea.set("typeface", font)


def text(slide, content, x, y, w, h, size=14, bold=False, color=INK, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, font=FONT, line_spacing=1.12, margin=0):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(margin)
    tf.margin_right = Inches(margin)
    tf.margin_top = Inches(margin)
    tf.margin_bottom = Inches(margin)
    tf.vertical_anchor = anchor
    lines = str(content).split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line_spacing
        r = p.add_run()
        r.text = line
        set_font(r, size=size, bold=bold, color=color, font=font)
    return box


def rich_text(slide, parts, x, y, w, h, size=14, color=INK, align=PP_ALIGN.LEFT,
              anchor=MSO_ANCHOR.TOP, line_spacing=1.15):
    """parts: list of (text, bold, color, size_override)"""
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = 0
    tf.margin_right = 0
    tf.margin_top = 0
    tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line_spacing
    for part in parts:
        content, bold, part_color = part[0], part[1], part[2]
        part_size = part[3] if len(part) > 3 else size
        r = p.add_run()
        r.text = content
        set_font(r, size=part_size, bold=bold, color=part_color)
    return box


def rect(slide, x, y, w, h, fill=WHITE, line=None, radius=0.08, shadow=False):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(0.8)
    if radius is not None:
        try:
            shape.adjustments[0] = radius
        except Exception:
            pass
    if shadow:
        shape.shadow.inherit = False
    return shape


def bg(slide, color=BG):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def page_number(slide, number, total=8):
    text(slide, f"{number:02d} / {total:02d}", 12.0, 7.08, 1.0, 0.25, size=9, color=MUTED, align=PP_ALIGN.RIGHT)


def kicker(slide, label):
    text(slide, label.upper(), 0.72, 0.42, 6.0, 0.28, size=9, bold=True, color=RED)


def title(slide, main, sub=None):
    text(slide, main, 0.72, 0.72, 11.8, 0.62, size=28, bold=True, color=INK)
    if sub:
        text(slide, sub, 0.74, 1.34, 11.3, 0.34, size=12, color=MUTED)


def footer(slide, label="骑行运营台 · 登录 / 用户 / 活动 / 分析"):
    text(slide, label, 0.72, 7.08, 8.0, 0.25, size=9, color=MUTED)


def crop_cover(src, dst, aspect):
    img = Image.open(src).convert("RGB")
    w, h = img.size
    target = aspect
    if w / h > target:
        new_w = int(h * target)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    else:
        new_h = int(w / target)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))
    img.save(dst, quality=92)


def add_image(slide, path, x, y, w, h, border=True, radius=True):
    src = Path(path)
    tmp = TMP / f"{src.stem}_{int(w*100)}_{int(h*100)}.jpg"
    crop_cover(src, tmp, w / h)
    if border:
        rect(slide, x - 0.04, y - 0.04, w + 0.08, h + 0.08, fill=WHITE, line=LINE, radius=0.04)
    slide.shapes.add_picture(str(tmp), Inches(x), Inches(y), Inches(w), Inches(h))


def arrow(slide, x1, y1, x2, y2, color=MUTED, width=1.2):
    conn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    conn.line.color.rgb = color
    conn.line.width = Pt(width)
    try:
        conn.line.end_arrowhead = True
    except Exception:
        pass
    return conn


# ============ Slide 1 封面 ============
s = prs.slides.add_slide(prs.slide_layouts[6])
bg(s, INK)
# 大面积红色装饰
circle = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(9.2), Inches(-1.6), Inches(6.2), Inches(6.2))
circle.fill.solid(); circle.fill.fore_color.rgb = RED
circle.line.fill.background()
circle2 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(10.7), Inches(4.4), Inches(3.4), Inches(3.4))
circle2.fill.solid(); circle2.fill.fore_color.rgb = ORANGE
circle2.line.fill.background()
# 细线装饰
for i in range(3):
    line = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.72), Inches(6.55 - i*0.08), Inches(5.8 - i*0.8), Pt(1))
    line.fill.solid(); line.fill.fore_color.rgb = RGBColor(0x37, 0x41, 0x51); line.line.fill.background()

text(s, "MOTORRAD · OPERATIONS", 0.74, 0.72, 6.0, 0.3, size=10, bold=True, color=RGBColor(0xF9, 0x73, 0x16))
text(s, "骑行运营台", 0.72, 1.12, 7.0, 0.9, size=46, bold=True, color=WHITE)
text(s, "登录 / 用户 / 活动 / 用户行为分析", 0.76, 2.02, 6.8, 0.42, size=20, color=RGBColor(0xE5, 0xE7, 0xEB))
text(s, "一个模块，跑通「谁能进来 → 活动怎么发和报 → 运营怎么判断效果」的完整链路。", 0.76, 2.6, 6.2, 0.9, size=13, color=RGBColor(0x9C, 0xA3, 0xAF), line_spacing=1.5)

# 标签
tags = [("微信登录 / 手机号", 0.76), ("两角色权限", 2.72), ("报名防重 / 名额", 4.62)]
for label, x in tags:
    rect(s, x, 3.72, 1.78, 0.38, fill=RGBColor(0x1F, 0x29, 0x37), line=RGBColor(0x37, 0x41, 0x51), radius=0.5)
    text(s, label, x + 0.12, 3.78, 1.55, 0.24, size=9, color=RGBColor(0xE5, 0xE7, 0xEB))

text(s, "2026 秋季 · 计算机学院生产实习", 0.76, 6.45, 5.2, 0.28, size=10, color=RGBColor(0x9C, 0xA3, 0xAF))
text(s, "4 人小组 · 我的模块", 0.76, 6.82, 5.2, 0.28, size=10, color=RGBColor(0x6B, 0x72, 0x80))

# 右侧截图
shot = SHOTS / "02-dashboard.png"
add_image(s, shot, 7.0, 1.05, 5.4, 5.4, border=True)
# 浮层小卡
rect(s, 6.55, 5.55, 2.5, 0.82, fill=WHITE, line=None, radius=0.12)
text(s, "29", 6.72, 5.66, 0.8, 0.42, size=22, bold=True, color=RED)
text(s, "自动化测试全部通过", 7.42, 5.7, 1.5, 0.24, size=9, bold=True, color=INK)
text(s, "名额 / 防重 / 权限 / 漏斗", 7.42, 5.98, 1.5, 0.22, size=8, color=MUTED)

# ============ Slide 2 目标与范围 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
kicker(s, "01 · 项目与范围")
title(s, "我负责的不是一个页面，而是一条闭环", "登录与权限 → 活动发布 → 报名校验 → 统计导出 → 行为分析")
page_number(s, 2); footer(s)

# 三张问题卡
cards = [
    ("谁能进来", "微信登录、手机号授权、JWT 登录态；后台两角色与权限点；C 端用户查询与禁用。", "01"),
    ("活动怎么发、怎么报", "活动草稿/发布/下架；报名防重、名额校验、时间窗、取消释放；统计与 CSV 导出。", "02"),
    ("运营怎么判断效果", "模拟 30 天访问数据；模块热度、趋势、严格顺序漏斗；大模型生成解读，失败自动兜底。", "03"),
]
for i, (h, body, no) in enumerate(cards):
    x = 0.72 + i * 4.18
    rect(s, x, 1.95, 3.92, 2.25, fill=WHITE, line=LINE, radius=0.06)
    text(s, no, x + 0.22, 2.08, 0.5, 0.28, size=10, bold=True, color=RED)
    text(s, h, x + 0.22, 2.38, 3.45, 0.36, size=16, bold=True, color=INK)
    text(s, body, x + 0.22, 2.85, 3.45, 1.1, size=10.5, color=INK2, line_spacing=1.55)

# 范围两栏
rect(s, 0.72, 4.55, 5.85, 2.05, fill=WHITE, line=LINE, radius=0.06)
text(s, "本模块交付", 0.94, 4.72, 2.5, 0.3, size=12, bold=True, color=GREEN)
left_lines = [
    "登录 / 手机号 / 后台账号 / C 端用户",
    "活动发布、下架、报名、统计、导出",
    "模拟行为数据 + 热度 / 趋势 / 漏斗",
    "AI 解读 + 规则兜底 + 结果落库",
    "29 个接口测试 + 后台演示控制台",
]
for i, line in enumerate(left_lines):
    text(s, "✓  " + line, 0.94, 5.12 + i * 0.27, 5.3, 0.24, size=9.5, color=INK2)

rect(s, 6.78, 4.55, 5.82, 2.05, fill=WHITE, line=LINE, radius=0.06)
text(s, "明确不做", 7.0, 4.72, 2.5, 0.3, size=12, bold=True, color=RED)
right_lines = [
    "车型主数据 / 图集 / Banner / 资讯",
    "智能客服多轮对话",
    "正式后台前端（admin 仅演示）",
    "小程序完整页面（提供对接示例）",
    "支付、短信、生产级风控",
]
for i, line in enumerate(right_lines):
    text(s, "—  " + line, 7.0, 5.12 + i * 0.27, 5.3, 0.24, size=9.5, color=MUTED)

# ============ Slide 3 架构 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
kicker(s, "02 · 方案与架构")
title(s, "契约先行，按领域分目录，四个人尽量不碰同一文件", "Node.js 零依赖 + SQLite；路由自动发现；JWT + 权限点")
page_number(s, 3); footer(s)

# 客户端
rect(s, 0.72, 1.85, 2.2, 0.72, fill=INK, line=None, radius=0.12)
text(s, "微信小程序", 0.86, 1.96, 1.9, 0.24, size=12, bold=True, color=WHITE)
text(s, "登录 / 活动 / 我的", 0.86, 2.2, 1.9, 0.2, size=8, color=RGBColor(0xD1, 0xD5, 0xDB))
rect(s, 0.72, 2.78, 2.2, 0.72, fill=INK, line=None, radius=0.12)
text(s, "运营后台", 0.86, 2.89, 1.9, 0.24, size=12, bold=True, color=WHITE)
text(s, "活动 / 用户 / 看板", 0.86, 3.13, 1.9, 0.2, size=8, color=RGBColor(0xD1, 0xD5, 0xDB))

# API
rect(s, 3.55, 1.85, 3.25, 1.65, fill=WHITE, line=LINE, radius=0.08)
text(s, "HTTP API · Node.js", 3.75, 2.0, 2.9, 0.3, size=13, bold=True, color=INK)
text(s, "统一信封  { code, message, data }", 3.75, 2.38, 2.9, 0.24, size=9, color=MUTED, font=MONO)
text(s, "JWT / 角色权限点 / 参数校验", 3.75, 2.68, 2.9, 0.24, size=9, color=MUTED)
text(s, "requestId + 审计日志", 3.75, 2.98, 2.9, 0.24, size=9, color=MUTED)

# 模块
modules = [("auth / users / admins", 0.72, 4.18, 2.45, "登录、手机号、角色、禁用"),
           ("activities", 3.32, 4.18, 1.95, "发布 / 报名 / 统计 / 导出"),
           ("analytics", 5.42, 4.18, 2.35, "热度 / 趋势 / 漏斗 / AI")]
for name, x, y, w, desc in modules:
    rect(s, x, y, w, 1.02, fill=WHITE, line=LINE, radius=0.08)
    text(s, name, x + 0.16, y + 0.14, w - 0.3, 0.26, size=10.5, bold=True, color=INK, font=MONO)
    text(s, desc, x + 0.16, y + 0.45, w - 0.3, 0.22, size=8, color=MUTED)
    arrow(s, x + w / 2, 3.5, x + w / 2, y - 0.05, color=RGBColor(0x9C, 0xA3, 0xAF))

# 数据层
rect(s, 0.72, 5.55, 7.05, 0.95, fill=SOFT_GRAY, line=LINE, radius=0.08)
text(s, "SQLite", 0.92, 5.68, 1.2, 0.26, size=11, bold=True, color=INK, font=MONO)
text(s, "admin_user · c_user · activity · signup · visit_event · ai_insight · audit_log", 1.95, 5.68, 5.6, 0.24, size=8.5, color=INK2, font=MONO)
text(s, "事务：BEGIN IMMEDIATE  ·  约束：部分唯一索引  ·  时间：UTC 存储 / UTC+8 聚合", 0.92, 6.04, 6.6, 0.24, size=8, color=MUTED)

# 外部
rect(s, 8.65, 4.18, 1.65, 0.95, fill=WHITE, line=LINE, radius=0.08)
text(s, "微信接口", 8.8, 4.32, 1.3, 0.24, size=10, bold=True, color=GREEN)
text(s, "code2Session\n手机号", 8.8, 4.6, 1.3, 0.4, size=8, color=MUTED)

rect(s, 10.55, 4.18, 2.0, 0.95, fill=WHITE, line=LINE, radius=0.08)
text(s, "大模型 API", 10.7, 4.32, 1.7, 0.24, size=10, bold=True, color=ORANGE)
text(s, "OpenAI 兼容\nJSON 输出", 10.7, 4.6, 1.7, 0.4, size=8, color=MUTED)

# 右侧说明
rect(s, 8.65, 1.85, 3.9, 1.9, fill=WHITE, line=LINE, radius=0.08)
text(s, "为什么这样选", 8.82, 2.0, 3.5, 0.3, size=12, bold=True, color=INK)
bullets = ["零依赖：换电脑也能跑，演示不装环境", "SQLite 关系型：事务 / 唯一索引 / 部分索引都支持", "自动路由：新增 modules/*/routes.js 不改公共文件", "换 MySQL：只改 db.js 驱动层，接口契约不变"]
for i, b in enumerate(bullets):
    text(s, "·  " + b, 8.82, 2.38 + i * 0.3, 3.55, 0.24, size=8.5, color=INK2)

# ============ Slide 4 数据与接口 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
kicker(s, "03 · 数据与接口")
title(s, "核心表、30 个接口，先把契约写死", "统一信封 + 错误码 + 分页 + 时间口径，前后端各写各的也不打架")
page_number(s, 4); footer(s)

# 表卡片
groups = [
    ("账号与用户", ["admin_user", "c_user"], "角色 / 状态 / 手机号唯一", 0.72),
    ("活动与报名", ["activity", "signup"], "名额 / 时间窗 / 防重", 4.3),
    ("行为与分析", ["visit_event", "ai_insight"], "session / 模块 / 动作", 7.88),
]
for head, tables, desc, x in groups:
    rect(s, x, 1.95, 4.0, 1.85, fill=WHITE, line=LINE, radius=0.06)
    text(s, head, x + 0.2, 2.1, 3.6, 0.28, size=12, bold=True, color=INK)
    for i, table in enumerate(tables):
        rect(s, x + 0.2, 2.48 + i * 0.46, 1.9, 0.33, fill=SOFT_GRAY, line=None, radius=0.2)
        text(s, table, x + 0.32, 2.52 + i * 0.46, 1.7, 0.22, size=9, color=INK, font=MONO)
    text(s, desc, x + 0.2, 3.36, 3.55, 0.28, size=8.5, color=MUTED, line_spacing=1.2)

# 约束高亮
rect(s, 0.72, 4.05, 5.95, 0.88, fill=SOFT_RED, line=None, radius=0.08)
text(s, "报名防重", 0.92, 4.2, 1.2, 0.26, size=10, bold=True, color=RED)
text(s, "UNIQUE (activity_id, user_id) WHERE status='confirmed'", 2.1, 4.2, 4.3, 0.26, size=8.5, color=INK, font=MONO)
text(s, "同一用户同一活动最多一条有效报名；取消后可重报", 0.92, 4.52, 5.5, 0.24, size=8, color=INK2)

rect(s, 6.85, 4.05, 5.75, 0.88, fill=RGBColor(0xEC, 0xFD, 0xF5), line=None, radius=0.08)
text(s, "统一错误码", 7.05, 4.2, 1.2, 0.26, size=10, bold=True, color=GREEN)
text(s, "0 / 401 / 403 / 404 / 1002 / 1003 / 1004 / 1005 / 1008 / 1010", 8.1, 4.2, 4.2, 0.26, size=8.5, color=INK, font=MONO)
text(s, "名额满、重复报名、未开始、未授权手机号，前端文案分开", 7.05, 4.52, 5.2, 0.24, size=8, color=INK2)

# 接口清单
text(s, "接口清单（节选）", 0.72, 5.2, 2.5, 0.28, size=12, bold=True, color=INK)
api_rows = [
    ("POST", "/api/auth/wechat/login", "微信登录 / mock"),
    ("POST", "/api/activities/:id/signup", "报名（防重 + 名额）"),
    ("GET", "/api/admin/activities/:id/signups/export", "CSV 名单"),
    ("GET", "/api/admin/analytics/summary", "看板聚合"),
    ("POST", "/api/admin/analytics/interpret", "AI 解读"),
]
for i, (method, path, desc) in enumerate(api_rows):
    y = 5.55 + i * 0.27
    text(s, method, 0.74, y, 0.55, 0.22, size=8, bold=True, color=RED if method == "POST" else BLUE, font=MONO)
    text(s, path, 1.3, y, 4.6, 0.22, size=8, color=INK, font=MONO)
    text(s, desc, 5.95, y, 2.1, 0.22, size=8, color=MUTED)
# 接口文档引用放在讲稿中，不占用页脚空间。

# ============ Slide 5 功能演示 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
kicker(s, "04 · 功能演示")
title(s, "从后台配一条活动，到 C 端报名成功，再到名单导出", "按真实用户路径走，不念 PPT")
page_number(s, 5); footer(s)

add_image(s, SHOTS / "03-activities.png", 0.72, 1.75, 6.05, 4.1)
add_image(s, SHOTS / "07-activity-stats.png", 7.0, 1.75, 5.55, 3.85)

# 编号说明
notes = [
    ("1", "发布 / 下架", "草稿 C 端不可见；发布后立即可见；下架后不可报名。"),
    ("2", "名额与时间窗", "报名截止不能晚于活动结束；名额不能小于已报名人数。"),
    ("3", "统计与导出", "已报名 / 剩余 / 报名率 / 每日；CSV 带 BOM，Excel 不乱码。"),
]
for i, (no, head, body) in enumerate(notes):
    y = 6.05 + i * 0.0
    x = 0.72 + i * 4.18
    text(s, no, x, 6.0, 0.3, 0.24, size=12, bold=True, color=RED)
    text(s, head, x + 0.3, 6.0, 1.4, 0.24, size=9.5, bold=True, color=INK)
    text(s, body, x + 0.3, 6.28, 3.55, 0.45, size=8, color=MUTED, line_spacing=1.3)

# 底部三个说明点

# ============ Slide 6 难点与取舍 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
kicker(s, "05 · 难点与取舍")
title(s, "四个真正花时间的问题", "不是“能不能写”，而是“并发、口径、选型、可信”怎么取舍")
page_number(s, 6); footer(s)

items = [
    ("01", "并发抢名额", "BEGIN IMMEDIATE 事务内查重 + 数名额 + 插入；数据库部分唯一索引兜底。", "10 个并发请求抢 1 个名额 → 1 成功，9 个 1003", RED),
    ("02", "漏斗口径", "同一 session 内严格时间顺序，5 段 CTE；各步骤独立去重会被乱序访问污染。", "最大流失：详情 → 点击报名，56.4%", ORANGE),
    ("03", "存储选型", "SQLite 零依赖、单文件、支持事务与部分索引；换 MySQL 只改驱动层，契约不变。", "课程演示优先“跑得起来”，不追新技术", BLUE),
    ("04", "AI 可信", "固定 JSON Schema + 结构校验；无 Key / 超时 / 不合格自动规则兜底，并标注 source。", "不把兜底伪装成大模型；置信度最高 medium", GREEN),
]
for i, (no, head, body, evidence, color) in enumerate(items):
    x = 0.72 + (i % 2) * 6.15
    y = 1.9 + (i // 2) * 2.35
    rect(s, x, y, 5.85, 2.08, fill=WHITE, line=LINE, radius=0.06)
    text(s, no, x + 0.22, y + 0.16, 0.5, 0.26, size=10, bold=True, color=color)
    text(s, head, x + 0.68, y + 0.14, 3.0, 0.32, size=15, bold=True, color=INK)
    text(s, body, x + 0.22, y + 0.62, 5.35, 0.72, size=9.5, color=INK2, line_spacing=1.4)
    rect(s, x + 0.22, y + 1.48, 5.35, 0.4, fill=SOFT_GRAY, line=None, radius=0.2)
    text(s, evidence, x + 0.35, y + 1.55, 5.0, 0.24, size=8.2, bold=True, color=color)

# 结果条
rect(s, 0.72, 6.45, 12.0, 0.42, fill=INK, line=None, radius=0.2)
text(s, "结果：29 个自动化用例全部通过；报名、权限、导出、漏斗、空数据、AI 兜底都有回归。", 0.95, 6.53, 11.6, 0.24, size=9.5, bold=True, color=WHITE)

# ============ Slide 7 AI 解读 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s)
kicker(s, "06 · AI 分析解读")
title(s, "把统计数字翻译成运营能执行的动作", "只发聚合指标；模型输出固定 JSON；失败自动规则兜底")
page_number(s, 7); footer(s)

# 裁剪 dashboard 的 AI 区
ai_crop = TMP / "ai_panel.jpg"
img = Image.open(SHOTS / "06-dashboard-ai.png").convert("RGB")
w, h = img.size
# 截取 AI 面板 + 上方指标，保持竖版
box = (int(w * 0.185), int(h * 0.36), int(w * 0.68), int(h * 0.93))
img.crop(box).save(ai_crop, quality=92)
rect(s, 0.68, 1.72, 6.15, 4.85, fill=WHITE, line=LINE, radius=0.03)
s.shapes.add_picture(str(ai_crop), Inches(0.72), Inches(1.76), Inches(6.07), Inches(4.77))

# 右侧说明
rect(s, 7.2, 1.75, 5.4, 1.1, fill=INK, line=None, radius=0.08)
text(s, "输入：聚合数据，不含手机号 / 昵称", 7.4, 1.9, 4.9, 0.26, size=10, bold=True, color=WHITE)
text(s, "PV / UV / 模块 / 趋势 / 漏斗 / 渠道 / 环比", 7.4, 2.2, 4.9, 0.24, size=8.5, color=RGBColor(0xD1, 0xD5, 0xDB))

steps = [
    ("1", "Prompt 约束", "只依据给定数据；必须引用数字；P0 最多 1 条；置信度不得为 high。"),
    ("2", "JSON 校验", "headline / summary / findings / recommendations / risks / confidence；不合格即兜底。"),
    ("3", "结果落库", "保存区间、模型、Prompt 版本、输入快照与 fallbackReason，可复盘。"),
]
for i, (no, head, body) in enumerate(steps):
    y = 3.05 + i * 0.95
    rect(s, 7.2, y, 5.4, 0.82, fill=WHITE, line=LINE, radius=0.06)
    text(s, no, 7.38, y + 0.16, 0.3, 0.24, size=11, bold=True, color=RED)
    text(s, head, 7.72, y + 0.12, 1.8, 0.26, size=10, bold=True, color=INK)
    text(s, body, 7.72, y + 0.39, 4.65, 0.36, size=8, color=MUTED, line_spacing=1.25)

# 数据条
metrics = [("2,694", "PV"), ("285", "UV"), ("62", "报名"), ("7.05%", "漏斗转化")]
for i, (value, label) in enumerate(metrics):
    x = 7.2 + i * 1.37
    text(s, value, x, 6.15, 1.2, 0.28, size=16, bold=True, color=INK)
    text(s, label, x, 6.45, 1.2, 0.2, size=8, color=MUTED)

# source badge
rect(s, 11.45, 2.05, 0.95, 0.3, fill=SOFT_RED, line=None, radius=0.4)
text(s, "规则兜底", 11.53, 2.1, 0.8, 0.2, size=7.5, bold=True, color=RED)

# ============ Slide 8 复盘 ============
s = prs.slides.add_slide(prs.slide_layouts[6]); bg(s, INK)
kicker(s, "07 · 复盘与下一步")
text(s, "能跑起来，也知道哪里还不够", 0.72, 0.72, 11.5, 0.62, size=28, bold=True, color=WHITE)
text(s, "两周的边界：把主链路做透，把技术债记下来，把下一步说清楚。", 0.74, 1.36, 10.5, 0.34, size=12, color=RGBColor(0x9C, 0xA3, 0xAF))
page_number(s, 8); text(s, "骑行运营台 · 登录 / 用户 / 活动 / 分析", 0.72, 7.08, 8.0, 0.25, size=9, color=RGBColor(0x6B, 0x72, 0x80))

cols = [
    ("已完成", GREEN, ["登录 / 手机号 / 两角色", "活动发布 / 下架 / 报名", "防重 + 名额 + 并发测试", "统计 / CSV / 审计", "模拟数据 / 热度 / 趋势 / 漏斗", "AI 解读 + 规则兜底"]),
    ("已知技术债", ORANGE, ["SQLite 单机，无迁移框架", "漏斗按 session，不合并跨会话", "后台登录未做失败锁定", "活动维度漏斗仍用全站列表", "admin 单文件，待组件化"]),
    ("下一步", RGBColor(0x93, 0xC5, 0xFD), ["接真实埋点与 unionid", "MySQL + 迁移脚本", "登录限流 / 风控", "活动曝光与活动维度漏斗", "人工反馈闭环，迭代 Prompt"]),
]
for i, (head, color, items) in enumerate(cols):
    x = 0.72 + i * 4.18
    rect(s, x, 1.95, 3.9, 4.1, fill=RGBColor(0x1F, 0x29, 0x37), line=RGBColor(0x37, 0x41, 0x51), radius=0.06)
    text(s, head, x + 0.22, 2.12, 3.4, 0.32, size=14, bold=True, color=color)
    for j, item in enumerate(items):
        text(s, "·  " + item, x + 0.22, 2.62 + j * 0.45, 3.45, 0.38, size=9.5, color=RGBColor(0xE5, 0xE7, 0xEB), line_spacing=1.25)

# 底部一句话
rect(s, 0.72, 6.35, 12.0, 0.48, fill=RED, line=None, radius=0.2)
text(s, "方法无优劣，匹配场景才是关键；把“先这样”记在账上，下一轮还掉。", 0.95, 6.45, 11.5, 0.26, size=11, bold=True, color=WHITE)

prs.save(OUT)
print("saved", OUT, "slides", len(prs.slides))
