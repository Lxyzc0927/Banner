---
version: 1
slug: "miniprogram"
primary_target: "miniprogram"
related_targets: []
---

# Surface: XX 摩托小程序（全部页面）

Mode: operate。用户在手机上看车、比价、收藏、报名活动、问客服；白天户外和门店里都在用。

Audience: 想买车的普通顾客与摩托车爱好者，同等对待。Constraints: 不改接口和业务逻辑（用户后来要求的车型价格筛选、排序和标签筛选除外，已写入接口约定）；无真实照片，车型图为占位；微信小程序组件与 style v2。

## Direction contract

THESIS: 每款车一块越野号码牌，粗大的排量数字就是它在列表里的名字；拒绝商城小程序的白底圆角双列商品卡和宫格图标。

OWN-WORLD: 白底黑字，号码牌是唯一的色块：白牌（150/250 入门）、黄牌 #ffd400（300/400 中排）、红牌 #e10600 白字（500 大排），黑色粗描边、大圆角。数字用压窄的超粗无衬线（Archivo 压窄 900），中文用系统黑体。分隔用 1 物理像素细线，界面只用三档明度。黄色另外只给三处：当前选中、"报名中"、"已报名待参加"的活动日期牌；首页活动 Banner 为黄牌，车型 Banner 跟随该车排量档位着色。

STORY: 用户先认出排量档位（看牌子颜色和数字），再看名字和价格，点进详情比较参数，收藏或咨询；活动页看名额和日期后报名。

FIRST VIEWPORT: 导航栏是品牌；搜索框里写在售数量（"在 N 款在售车型里搜"）；下面一块黄色号码牌式 Banner，左侧标题、一行信息（活动：标题与剩余名额；车型：车名与起售价）和跳转动作，右侧超大数字（活动为日期，车型为排量）；四个入口一行；"热门车型"列表每行左侧一块小号码牌写排量，中间名称与类别，右侧价格。主操作：点车型行进入详情。

FORM: 我自己候选清单的第 1 位（IMPECCABLE’S PICK，用户在第 2 轮选定）。seed:fdbdaf663d1374a2。签名动作：号码牌——排量档位按固定颜色阶梯显示在每个车型条目、详情页头部和筛选芯片上；按下时号码牌像压在车头上一样下沉 2px。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
