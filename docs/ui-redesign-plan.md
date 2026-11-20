# 「彩店管理助手」前端 UI 改版工程计划

> 版本：2026-11-20 · 范围：`MaterialCreaterWeb`（Taro 4.1.9 + React 18 + TypeScript + Sass）
> 设计输入：`docs/design/home.png`（Figma 首页稿，327px 画板宽）
> 本文是工程排期与验收依据；已完成的代码与未完成项都在第 2 节如实列出。

---

## 1. 目标与范围

1. 按新稿统一首页视觉：浅灰底、双白卡、战报统计块、14 场传统彩、8 个彩种最新开奖、悬浮 TabBar。
2. 四个页面共用一套导航与视觉规范：首页 / 素材（recommend）/ 计算器（selector）/ 我的（profile）。
3. 首页战报、传统彩、最新开奖接入真实数据；保留 `?demo=1` 作为设计走查开关。
4. 交付可发布的微信小程序包（`npm run build:weapp`）+ H5 走查包（`npm run build:h5`）。
5. 补齐关键纯函数与数据映射的单元测试，避免"能看不能用"。

不包含：服务端（Go）接口实现、素材生成算法、计算器业务规则改动。

---

## 2. 现状盘点（2026-11-20）

### 2.1 已完成并跑通 H5

| 模块 | 文件 | 状态 |
| --- | --- | --- |
| 首页改版 | `src/pages/home/index.tsx`、`index.module.scss`、`index.config.ts` | 完成，H5 构建通过 |
| 首页数据模型 | `src/pages/home/home-data.ts`、`lottery-view-model.ts` | 完成，demo + 真实开奖接口两条路径 |
| 悬浮 TabBar | `src/components/TabBar/index.tsx`、`index.module.scss` | 完成，三 tab 切换正常 |
| 我的页 | `src/pages/profile/index.tsx`、`index.module.scss`、`index.config.ts` | 新建完成 |
| Tab 图标 | `src/assets/tabbar/{home,material,profile}.png` | **占位**，脚本绘制，非设计稿导出 |
| 下拉刷新 | `src/pages/home/index.config.ts:6`、`index.tsx:84` | 已接 `usePullDownRefresh` |

### 2.2 未完成 / 已知缺口

1. **素材页、计算器页仍是旧红色原生导航**（`app.config.ts` 的 window 配置 `#E53935`），与首页割裂；两页尚未按新稿适配。
2. **首页战报数据是硬编码**：`SPORT_REPORTS`、`TRADITIONAL_REPORT` 直接写死在 `home-data.ts`，没有接口；点"传统"只弹 `传统足彩数据接入中` toast（`index.tsx:99-101`）。
3. **Tab 图标不是设计资产**：`.tmp/gen_tabbar_icons.py` 用 Pillow 绘制的近似图形，首页图标在 22px 下辨识度不足。
4. **无任何测试**：`jest` 在 devDependencies 中，但仓库没有 `*.test.*`。
5. **未验证微信端**：`build:weapp` 尚未执行；自定义导航的安全区、胶囊避让只在 H5 走过。
6. **设计令牌重复**：首页、TabBar、我的页各自在 SCSS 顶部声明一份十六进制变量；`styles/theme.scss` 还是旧红色体系（`$color-primary: #E53935`、`$color-lottery-red: #E53935`、`$color-lottery-blue: #1565C0`、`$color-bg-page: #f5f6f7`），与新稿不符。
7. 首页卡片底部与 TabBar 间距约 23px（设计约 2px），TabBar 高 150rpx（设计折算约 172rpx）；属于收口项，不影响功能。

### 2.3 设计量化基线（327px 画板 → 750rpx）

| 项 | 设计值 | 换算 |
| --- | --- | --- |
| 页面底色 | `#e5e5ea` | — |
| 卡片 | 白底，圆角 28rpx，左右边距 28rpx | — |
| 卡片间距 | 11px | 25rpx（现 24rpx） |
| 统计块 | 28×19px，间距 3px | 64×44rpx，gap 8rpx |
| 统计块底色 | `#d9d9d9` | — |
| 传统彩绿球 | 7×20px，间距 2px，14 个 | 18×44rpx，gap 4rpx |
| 红球 | 12–13px 直径 | 30rpx |
| 蓝球 | `#0088ff` | — |
| 列表行距 | 58px | ≈66px@375 |
| TabBar | 75px 高，`#f2f2f5` | 150rpx（设计稿折算 172rpx） |
| 选中胶囊 | 53×25px，`#ecc97a` | 120×56rpx |

---

## 3. 任务分解

优先级：P0 = 阻塞上线/影响一致性；P1 = 功能完整；P2 = 质量与交付。

### P0-1 设计令牌统一（0.5 天）

- 新增 `src/styles/tokens.scss`，定义：`$c-page-bg #e5e5ea`、`$c-card #ffffff`、`$c-ink #111111`、`$c-muted #8e8e93`、`$c-divider #f0f0f2`、`$c-red #ff383c`、`$c-green #34c759`、`$c-blue #0088ff`、`$c-yellow #ecc97a`、`$c-tabbar #f2f2f5`、`$radius-card 28rpx`、字号阶梯（22/24/26/27/36/38rpx）。
- 由 `src/styles/variables.scss` `@forward` 出去，首页 / TabBar / 我的页改为引用 token，删除文件内重复变量。
- **验收**：三个 SCSS 中不再出现裸十六进制色值（除 token 文件）；H5 截图与改版前逐像素无差异。

### P0-2 Tab 图标资产替换（0.5 天，依赖设计）

- 从 Figma 导出 `home/material/profile` 的普通态与选中态，3x PNG（透明底，81×81 或 96×96），命名 `home.png` / `home-active.png` 等。
- 替换 `src/assets/tabbar/`；`TabBar/index.tsx` 按 `isActive` 切换资源，删除 `.iconMuted` 透明度 hack 与 `.tmp/gen_tabbar_icons.py`。
- **验收**：22px 显示下图标可辨识；选中/未选中对比与设计一致；不再依赖运行时 filter/opacity。

### P0-3 导航体系统一（2 天）

- 抽 `src/components/NavBar/`：自定义导航容器，处理 `statusBarHeight + 44`、右上角胶囊避让、可选返回键、标题居中；首页/我的复用。
- `recommend`、`selector` 的 `index.config.ts` 改 `navigationStyle: 'custom'`，移除 `app.config.ts` 中的红色 window 配置（或改为透明），页面顶部接入 NavBar。
- 首页 `openTraditional` 的 toast 改为跳转传统彩详情/列表（若暂无页面，保留 toast 但记录 TODO）。
- **验收**：四页均无红色原生导航条；微信端胶囊不遮挡标题；返回栈正常。

### P0-4 TabBar 方案定稿（0.5 天 spike）

现状是"每页挂 `<TabBar>` + `Taro.reLaunch`"，没有原生 tabBar。优点是 H5/微信表现一致，缺点是切换丢页面状态、有白闪、微信端无法使用原生 tab 性能优化。

- 方案 A（保留现状）：改动小，继续用 `reLaunch`；在 `TabBar` 内做 150ms 防重复点击。
- 方案 B（微信端原生 custom-tab-bar）：`app.config.ts` 配 `tabBar.custom: true` + `custom-tab-bar/index`，H5 继续用组件；需要处理两套入口与页面栈。
- **产出**：0.5 天 spike 结论写入本文附录；默认按 A 上线，B 作为 v1.1。

### P1-5 首页战报接真实数据（2 天）

- 后端提供：竞足/竞篮当日"完赛/胜/平/负"统计、传统彩期号+日期+14 场结果。
- 新增 `src/api/sport-report.ts`，定义 `SportReport` / `TraditionalReport` 类型；`home-data.ts` 只保留 demo 数据。
- 首页三态：loading（已有骨架）、error（重试按钮）、empty；`useDidShow` 拉取，`usePullDownRefresh` 复用。
- **验收**：断网显示错误态可重试；真实数据与后台一致；demo 开关仍可用。

### P1-6 最新开奖真实链路加固（1 天）

- 现有 `loadLatestGame` 已接通，但需补：单彩种失败不影响其他彩种、加载态与不可用态、开奖号码格式异常兜底。
- `lottery-view-model.ts` 增加单测覆盖（见 P2-11）。
- **验收**：8 个彩种独立加载；某彩种 500 时仅该行显示"暂无数据"。

### P1-7 素材页视觉适配（2 天）

- 顶部改浅灰底 + 自定义导航；筛选区、卡片、按钮的圆角/字号/颜色对齐 token。
- 保留现有交互（`navigateTo` 计算器、`TabBar active='material'`）。
- **验收**：与首页并排走查无风格跳跃；H5/微信端列表滚动正常。

### P1-8 计算器页视觉适配（1.5 天）

- 同上；重点检查表单控件、底部固定操作栏与安全区。
- **验收**：小屏（iPhone SE 375×667）不遮挡、不横向滚动。

### P1-9 通用状态组件（1 天）

- 抽 `Empty` / `ErrorState` / `Skeleton` 到 `src/components/`，首页、素材、计算器共用。
- **验收**：三页状态样式一致；文案可配置。

### P2-10 单元测试（1 天）

- `src/pages/home/lottery-view-model.test.ts`：`toCardView` 正常/缺失字段/期号格式。
- `src/pages/home/home-data.test.ts`：demo 数据与设计稿号码一致。
- `src/components/TabBar` 路由映射测试（纯函数化 `getTabRoute`）。
- **验收**：`npm test` 全绿；覆盖率不作为硬指标，但核心映射必须覆盖。

### P2-11 双端构建与真机验收（1 天）

- `npm run build:weapp`，微信开发者工具导入 `dist/`（appid `wxe8fee37450a414a0`）。
- 检查：自定义导航高度、胶囊避让、TabBar 安全区、下拉刷新、分享/海报。
- **验收**：iOS/Android 各一台真机走通首页→素材→计算器→我的。

### P2-12 性能与包体（0.5 天）

- 当前 H5 入口 313 KiB，webpack 有体积告警；检查 `moment/dayjs`、`lodash` 类大依赖，按需引入。
- 图标资源压缩；首屏图片懒加载。
- **验收**：微信包体 < 2MB；首页可交互 < 2s（中端机）。

---

## 4. 排期建议

| 阶段 | 内容 | 人日 |
| --- | --- | --- |
| M1 视觉收口 | P0-1 ~ P0-4 | 3.5 |
| M2 数据接入 | P1-5、P1-6 | 3 |
| M3 页面适配 | P1-7 ~ P1-9 | 4.5 |
| M4 质量交付 | P2-10 ~ P2-12 | 2.5 |
| 合计 | | **13.5 人日**（1 人约 3 周；2 人并行约 1.5 周） |

依赖关系：P0-2 依赖设计导出；P1-5 依赖后端接口；P1-7/P1-8 依赖 P0-3；P2-11 依赖 M3 完成。

---

## 5. 待确认决策

1. **TabBar 方案**：短期保留自定义组件（A），还是本期直接上微信原生 custom-tab-bar（B）？
2. **战报接口**：竞足/竞篮统计由服务端聚合，还是前端拉比赛列表自行统计？前者稳定，后者灵活。
3. **传统彩详情页**：本期是否新增页面？当前只有首页入口与 toast。
4. **图标交付**：设计能否提供 SVG 源文件（而非 PNG），便于小程序端换色与适配暗色模式。

---

## 6. 验收清单（上线前逐项打勾）

- [ ] 四页统一浅灰底 + 自定义导航，无红色原生导航条
- [ ] 首页三卡与设计稿 375px 宽度下逐项比对（间距/字号/颜色/圆角）
- [ ] 8 个彩种真实开奖数据、加载/错误/空态齐全
- [ ] 战报、传统彩真实数据
- [ ] TabBar 三 tab 切换无白闪、无重复入栈
- [ ] iOS/Android 真机安全区与胶囊正常
- [ ] `npm test` 通过
- [ ] `npm run build:weapp` 产物可上传体验版
- [ ] 无 console error / 未捕获 Promise

---

## 附录 A：本次改版已落地的关键实现

- 首页 `topInset`：H5 固定 20px；微信 `statusBarHeight + 44`（`index.tsx:42-51`）。
- 首页数据：`IS_DEMO_MODE` 时用 `createDemoCards()`，否则逐彩种 `loadLatestGame(code)`；`requestId` 防止旧请求覆盖新状态（`index.tsx:57-78`）。
- 快乐8 通过 `numbers { max-width: 344rpx }` 强制 10+10 换行，与设计一致。
- 传统彩 14 个绿球为 `18×44rpx` 胶囊，`gap 4rpx`。
- TabBar 高 150rpx + `env(safe-area-inset-bottom)`，选中态黄色胶囊 `#ecc97a`。

## 附录 B：H5 走查方式

```bash
cd MaterialCreaterWeb
npm run build:h5
# 静态服务 dist/ 后访问（demo 数据）
# http://127.0.0.1:4173/?demo=1#/pages/home/index
```

`?demo=1` 会启用截图同款号码；不带参数时走真实接口（需后端可用）。
