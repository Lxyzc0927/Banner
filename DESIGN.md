---
name: XX 摩托
description: 越野号码牌式的摩托车经销商小程序：白底黑字，排量档位就是号码牌的颜色。
colors:
  plate-black: "#000000"
  pit-graphite: "#5a5a57"
  dust-grey: "#8c8c88"
  plate-white: "#ffffff"
  paddock-concrete: "#f4f4f2"
  hairline-chalk: "#d9d9d6"
  mid-class-yellow: "#ffd400"
  open-class-red: "#e10600"
typography:
  display:
    fontFamily: "Plate, DIN Alternate, Helvetica Neue, Arial, sans-serif"
    fontSize: "260rpx"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0"
    fontFeature: "tnum"
  numeral:
    fontFamily: "Plate, DIN Alternate, Helvetica Neue, Arial, sans-serif"
    fontSize: "40rpx"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "0"
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, PingFang SC, HarmonyOS Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "48rpx"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "-1rpx"
  title:
    fontFamily: "-apple-system, PingFang SC, HarmonyOS Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "36rpx"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, PingFang SC, HarmonyOS Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "30rpx"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, PingFang SC, HarmonyOS Sans SC, Microsoft YaHei, sans-serif"
    fontSize: "26rpx"
    fontWeight: 600
    lineHeight: 1.5
rounded:
  xs: "8rpx"
  sm: "12rpx"
  md: "16rpx"
  plate: "20rpx"
  board: "32rpx"
  plate-lg: "40rpx"
  pill: "44rpx"
spacing:
  xs: "8rpx"
  sm: "16rpx"
  md: "24rpx"
  gutter: "32rpx"
  lg: "48rpx"
  hit: "88rpx"
components:
  button-primary:
    backgroundColor: "{colors.plate-black}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.md}"
    padding: "0 36rpx"
    height: "96rpx"
  button-ghost:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.plate-black}"
    rounded: "{rounded.md}"
    padding: "0 36rpx"
    height: "96rpx"
  button-ghost-active:
    backgroundColor: "{colors.paddock-concrete}"
  button-small:
    rounded: "{rounded.sm}"
    padding: "0 28rpx"
    height: "88rpx"
  button-disabled:
    backgroundColor: "{colors.paddock-concrete}"
    textColor: "{colors.dust-grey}"
  plate-white:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.plate-black}"
    typography: "{typography.display}"
    rounded: "{rounded.plate}"
    size: "152rpx x 112rpx"
  plate-yellow:
    backgroundColor: "{colors.mid-class-yellow}"
    textColor: "{colors.plate-black}"
    typography: "{typography.display}"
    rounded: "{rounded.plate}"
    size: "152rpx x 112rpx"
  plate-red:
    backgroundColor: "{colors.open-class-red}"
    textColor: "{colors.plate-white}"
    typography: "{typography.display}"
    rounded: "{rounded.plate}"
    size: "152rpx x 112rpx"
  plate-hero:
    rounded: "{rounded.plate-lg}"
    height: "360rpx"
    width: "100%"
  chip-plate:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.plate-black}"
    rounded: "{rounded.md}"
    padding: "0 20rpx"
    height: "88rpx"
  chip-plate-on-yellow:
    backgroundColor: "{colors.mid-class-yellow}"
  chip-all-on:
    backgroundColor: "{colors.plate-black}"
    textColor: "{colors.plate-white}"
  state-open:
    backgroundColor: "{colors.mid-class-yellow}"
    textColor: "{colors.plate-black}"
    rounded: "{rounded.xs}"
    padding: "0 14rpx"
    height: "44rpx"
  state-signed:
    backgroundColor: "{colors.plate-black}"
    textColor: "{colors.plate-white}"
    rounded: "{rounded.xs}"
  state-full:
    textColor: "{colors.open-class-red}"
    rounded: "{rounded.xs}"
  state-ended:
    backgroundColor: "{colors.paddock-concrete}"
    textColor: "{colors.pit-graphite}"
    rounded: "{rounded.xs}"
  search-bar:
    backgroundColor: "{colors.paddock-concrete}"
    textColor: "{colors.pit-graphite}"
    rounded: "{rounded.md}"
    padding: "0 28rpx"
    height: "88rpx"
  input-field:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.plate-black}"
    rounded: "{rounded.md}"
    padding: "0 24rpx"
    height: "96rpx"
  bike-row:
    backgroundColor: "{colors.plate-white}"
    padding: "24rpx 0"
  bike-row-active:
    backgroundColor: "{colors.paddock-concrete}"
  banner-board:
    backgroundColor: "{colors.mid-class-yellow}"
    textColor: "{colors.plate-black}"
    rounded: "{rounded.board}"
    height: "252rpx"
  page-tabs:
    backgroundColor: "{colors.plate-white}"
    textColor: "{colors.pit-graphite}"
    typography: "{typography.body}"
    height: "96rpx"
  page-tabs-active:
    textColor: "{colors.plate-black}"
  sheet:
    backgroundColor: "{colors.plate-white}"
    rounded: "{rounded.board}"
    padding: "40rpx 32rpx"
---

# Design System: XX 摩托

## Overview

**Creative North Star: "The Number Board（车头号码牌）"** <!-- proposed; confirm with the user -->

整个小程序是一面贴满越野号码牌的白墙。每款车用一块号码牌代表：黑色粗描边、大圆角、压窄的超粗数字写着排量，牌子的颜色就是它的排量档位（白牌 150/250 入门、黄牌 300/400 中排、红牌 500 大排）。用户先看颜色和数字认出档位，再读名字和价格。号码牌是界面里唯一的色块，其余一切退回白底、黑字和 1 物理像素细线。

版面是竖向列表而不是商品卡宫格：一行一款车，左牌、中名、右价，行与行之间只有细线。密度偏紧凑但触控目标不小于 88rpx（44px）。深度几乎为零，靠描边粗细、黑白反相和三档明度区分层级；唯一的动作语言是「按下时号码牌下沉」，像牌子被压在车头上。

商城小程序的白底圆角双列商品卡和宫格彩色图标是本系统明确拒绝的形态。

**Key Characteristics:**
- 号码牌即档位：颜色固定映射排量，不做装饰用途。
- 白底黑字，三档明度（黑 / 石墨灰 / 浅灰），色块只来自号码牌与黄色的三种状态。
- 所有数字（排量、价格、参数、日期、名额）用压窄 900 的 Plate 字体，等宽数字。
- 分隔一律 1 物理像素细线；粗黑线（2rpx）只用于参数表和推荐列表的顶边。
- 按压反馈：号码牌与按钮下沉 4rpx（2px），行背景变浅灰，120ms ease-out。

## Colors

一张黑白底子上只有两种饱和色，且都属于号码牌。

### Primary
- **Plate Black（号码牌黑）**（`plate-black`）：正文、号码牌描边、主按钮底色、选中的芯片与分段、用户聊天气泡。它是唯一的操作色。

### Secondary
- **Mid-Class Yellow（中排黄）**（`mid-class-yellow`）：300/400 档号码牌；另外只用于三处：当前选中（活动页签下划线）、「报名中」状态标记、已报名待参加的活动日期牌；首页活动 Banner 为黄牌（车型 Banner 跟随排量档位着色）。

### Tertiary
- **Open-Class Red（大排红）**（`open-class-red`）：500 档号码牌（白字、红描边）；也承担错误与满员语义：名额已满标记（红描边红字）、满员的名额条、输入校验错误、发送失败。

### Neutral
- **Plate White（号码牌白）**（`plate-white`）：页面底色、150/250 档号码牌、幽灵按钮底。
- **Paddock Concrete（围场水泥）**（`paddock-concrete`）：搜索框、骨架屏、按压态行背景、已结束标记、禁用按钮、客服气泡。
- **Hairline Chalk（细线粉笔）**（`hairline-chalk`）：1px 分隔线、输入框默认描边、已结束活动的日期牌描边。
- **Pit Graphite（维修区石墨）**（`pit-graphite`）：次要文字（类别、元信息、单位、未选中页签）。
- **Dust Grey（扬尘灰）**（`dust-grey`）：禁用文字、占位提示、已结束活动的名额条。

### Named Rules
**The Plate Ladder Rule.** 排量档位颜色固定：150/250 白牌、300/400 黄牌、500 红牌白字。同一档位在列表行、详情头、筛选芯片上颜色一致；不得为了好看改色或新增档位色。

**The Only Color Block Rule.** 界面上的实心色块只能是号码牌，以及黄色的三种状态。卡片、区块、标题栏不得填充黄色或红色。

**The Never Color Alone Rule.** 状态标记总带文字（报名中 / 已报名 / 名额已满 / 已结束），颜色从不独自表达状态。

## Typography

**Display Font:** Plate（Archivo 压窄 wdth 62 / wght 900 子集，SIL OFL 1.1，以 base64 内嵌于 `app.wxss`；回退 DIN Alternate, Helvetica Neue, Arial）
**Body Font:** 系统黑体（-apple-system, PingFang SC, HarmonyOS Sans SC, Microsoft YaHei）
**Label/Mono Font:** 同 Body；数字一律用 Plate

**Character:** 压窄超粗的号码牌数字负责「被认出」，系统黑体负责「被读懂」。两者分工明确：数字永远是 Plate，汉字永远是系统字体，Plate 子集不含汉字。

### Hierarchy
- **Display**（Plate 900，260rpx / 130px，行高 1）：详情页头部大号码牌；同族尺寸还有活动详情日期 220rpx、首页 Banner 176rpx（行高 0.78）、登录页品牌牌 120rpx。
- **Numeral**（Plate 900，40rpx / 20px，行高 1，等宽数字）：列表价格；同族尺寸：详情价格 64rpx、参数值 44rpx、小号码牌 64rpx、中号码牌与筛选芯片 34–36rpx、名额与日期 28rpx。¥ 符号用系统字 600、约为数字的 0.5–0.65 倍。
- **Headline**（800，48rpx / 24px，行高 1.3，字距 -1rpx）：车型名、活动名；首页 Banner 标题 44rpx、登录品牌 56rpx 同属此级。
- **Title**（700，36rpx / 18px）：区块标题（热门车型、核心参数）、弹层标题；列表行名称为 600 / 32rpx。
- **Body**（400，30rpx / 15px，行高 1.5）：正文与输入；长段介绍行高 1.8。
- **Label**（600，26rpx / 13px）：元信息、按钮小号、表单标签、「查看更多」；状态标记 24rpx，tab 文字 22rpx。

### Named Rules
**The Plate Numerals Rule.** 凡是用户要比较的数字（排量、价格、参数、日期、时间、名额）都用 Plate 900 等宽数字；单位（cc、kW、¥、人）缩小并降到石墨灰或小字号，数字本身保持纯黑。

## Layout

单列竖向流，屏宽 750rpx，左右页边距 32rpx（16px）。区块之间 48rpx 顶部间距，区块标题与内容 16rpx。列表行左牌 152×112rpx、间距 24rpx、上下内边距 24rpx（活动行 32rpx），行尾右对齐价格。首页四个入口为一行四等分，用竖向细线分隔而非图标宫格卡片。

间距节奏为 8 / 16 / 24 / 32 / 48rpx；所有可点目标最小 88rpx（44px）高。工具栏（搜索 + 芯片 + 排序）与活动页签吸顶，白底加底部细线。详情页主操作放在固定底栏（白底、顶部细线、适配安全区），内容末尾留 150rpx + 安全区的占位。加载用浅灰骨架块按真实尺寸占位，避免版面跳动。

## Elevation & Depth

系统是平的。层级靠黑白反相（选中 = 黑底白字）、描边粗细（2rpx → 6rpx → 10rpx）和三档明度表达，不靠阴影。弹层用 50% 黑色遮罩加白色上圆角面板。


### Named Rules
**The Press-Sink Rule.** 深度只在按下时出现：号码牌、Banner、芯片、按钮下沉 4rpx（按钮 2rpx），120ms ease-out；整行条目则把背景换成围场水泥色。没有悬浮抬升。

## Shapes

号码牌形态：粗黑描边 + 大圆角，描边和圆角随尺寸放大——中号牌 4rpx / 14rpx，小号牌 6rpx / 20rpx，登录品牌牌 8rpx / 32rpx，详情大牌与活动日期牌 10rpx / 40rpx，首页 Banner 6rpx / 32rpx。红牌描边与底色同为红色。

界面控件比号码牌更收敛：按钮、输入框、搜索框、芯片 16rpx，小按钮与分段 12rpx，标签 10rpx，状态标记 8rpx。弹层上圆角 32rpx。圆形只用于发送按钮；全胶囊（44rpx）只用于客服快捷问题与聊天输入框。聊天气泡用一个 8rpx 的「尖角」指向说话方，其余三角 28rpx。

## Components

### Buttons
干脆、实心、像压下去的开关。
- **Shape:** 中等圆角（16rpx），高 96rpx；小号 88rpx 高、12rpx 圆角、26rpx 字。
- **Primary:** 黑底白字，600 / 30rpx，左右内边距 36rpx；按下底色变为近黑并下沉 2rpx。
- **Ghost:** 白底黑字 2rpx 黑描边；按下变围场水泥色并下沉 2rpx。
- **Disabled:** 围场水泥底、扬尘灰字、细线描边。
- 底栏里常见「收藏（图标 + 小字）｜问客服（ghost）｜主操作（primary）」，每页只有一个黑色主按钮。

### Chips
- **Style:** 排量芯片就是小号码牌：高 88rpx、16rpx 圆角、Plate 数字 36rpx；未选时白底 2rpx 黑边。「全部」芯片为 600 系统字。
- **State:** 选中时排量芯片显示档位颜色（白 / 黄 / 红）并把描边加粗到 6rpx；「全部」与价格按钮选中为黑底白字。按下下沉 4rpx。
- **Segmented:** 排序（综合 / 低价优先 / 高价优先）为浅灰槽中的分段，选中段黑底白字 700，与芯片、筛选按钮的选中语言一致，无阴影。
- **Filter buttons:** 「价格」「标签」为 2rpx 黑描边按钮，有条件时变黑底白字；「标签」显示已选数量。
- **Applied pills:** 已选条件排成一行黑底白字胶囊（88rpx 高，带 × 图标），点一下去掉，行尾「全部清除」。
- **Label chips（详情页）:** 类别、档位、特点标签都是 88rpx 高的黑描边可点芯片，尾部小箭头表示可进入筛选；档位芯片前带对应号码牌颜色的小色块。

### Cards / Containers
本系统没有商品卡。内容以行和区块承载。
- **Corner Style:** 行无圆角；唯一的「卡」是首页黑色客服入口块（24rpx 圆角，白色按钮）和黄色 Banner 号码牌。
- **Background:** 白；按压态为围场水泥色。
- **Shadow Strategy:** 无，见 Elevation & Depth。
- **Border:** 行底 1px 细线；参数表与推荐列表以 2rpx 黑线开头。
- **Internal Padding:** 行上下 24–32rpx，左右随页边距 32rpx。

### Inputs / Fields
- **Style:** 白底、2rpx 细线粉笔描边、16rpx 圆角、高 96rpx、内边距 24rpx；只读值用围场水泥底。搜索框为无描边的围场水泥底、高 88rpx，内含石墨灰放大镜与在售数量提示。
- **Focus:** 沿用系统光标，无额外光晕。
- **Error / Disabled:** 描边变大排红，下方 26rpx 红色错误文字。

### Navigation
- 原生 tabBar：白底、黑色细边，四项（首页 / 车型 / 活动 / 我的），未选石墨灰、选中黑色，图标为 Phosphor bold / fill 两态。
- 页内页签：等分、96rpx 高，未选石墨灰，选中黑色 700 + 64×8rpx 的黄色下划线（黄色「当前选中」用途之一）。
- 导航栏白底黑字，标题即品牌或页面名。

### Number Plate（签名组件）
`plate` 组件，三种尺寸：`s`（152×112rpx，64rpx 数字，列表行）、`m`（最小宽 104rpx × 64rpx，34rpx 数字）、`l`（满宽 × 360rpx，260rpx 数字，详情页头部，可带 0.3em 的「cc」单位）。颜色由排量档位决定。同一形态延伸为活动日期牌（128rpx 方牌，日 64rpx + 月份小字；报名中为黄牌，已结束描边与文字降为细线色与石墨灰）和首页 Banner 号码牌（左标题、一行信息、跳转动作，右侧超大数字：活动为日期、黄牌；车型为排量，牌色跟随档位）。

### Status Marks & Meter
- 状态标记 44rpx 高、8rpx 圆角、24rpx 600 字：报名中（黄底黑字；在黄色号码牌上改为黑底黄字）、已报名（黑底白字）、名额已满（红描边红字）、已结束（浅灰底石墨灰字）。
- 名额条：12rpx 高的浅灰槽、黑色实心填充、圆头；满员填充为红，已结束为扬尘灰。

## Do's and Don'ts

### Do:
- **Do** 用号码牌表示每款车的排量，按 Plate Ladder 上色：150/250 白、300/400 黄（#ffd400）、500 红（#e10600）白字。
- **Do** 所有比较用数字用 Plate 900 等宽数字，单位缩小。
- **Do** 用 1 物理像素细线（hairline-chalk）分隔行与区块，用黑白反相表示选中。
- **Do** 按压时号码牌与按钮下沉（4rpx / 2rpx，120ms ease-out），整行条目换围场水泥底。
- **Do** 保持所有可点目标至少 88rpx 高，状态标记总带文字。
- **Do** 每页只放一个黑色主按钮。

### Don't:
- **Don't** 用白底圆角双列商品卡或宫格彩色图标做列表与入口。
- **Don't** 把黄色或红色用在号码牌和既定状态以外的地方（区块底色、标题装饰、图标着色）。
- **Don't** 给任何元素加投影；选中状态一律用黑白反相。
- **Don't** 用 Plate 排汉字，或用系统字体排价格与参数数字。
- **Don't** 在三档明度（plate-black / pit-graphite / dust-grey）之外引入新的文字灰。
