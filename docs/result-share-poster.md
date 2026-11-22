# 开奖结果分享海报

首页右上角「分享开奖」把当期开奖号码绘制成一张 PNG 海报，默认把全部已开奖彩种排进同一张图，附微信二维码引流，可直接保存到相册或转发好友。

弹层组件自己负责取数：任何页面写一行 `<ResultPoster visible={open} onClose={close} />` 就能用，首页不再拼数据。

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/components/ResultPoster/types.ts` | 方案契约：`ResultPosterInput`、`PosterImages`、`PosterScheme` |
| `src/components/ResultPoster/canvas-kit.ts` | 公共画笔（750 逻辑宽度）：圆角矩形、渐变、文本截断、号码球、虚线、二维码卡片 |
| `src/components/ResultPoster/config.ts` | 二维码占位图与默认文案 |
| `src/components/ResultPoster/latest-results.ts` | 自取开奖数据：逐彩种请求、只留已开奖、格式化期号与日期 |
| `src/components/ResultPoster/use-share-results.ts` | 取数 hook：`idle/loading/ready/empty/error` 状态、防竞态、可选外部数据覆盖 |
| `src/components/ResultPoster/poster-inputs.ts` | 纯映射：开奖数据 + 默认文案 → `ResultPosterInput` |
| `src/components/ResultPoster/ResultPoster.tsx` | 弹层：取数、彩种多选、离屏绘制、导出、保存/分享 |
| `src/components/ResultPoster/schemes/red-ticket.ts` | 红金票据方案：纯布局函数 + 绘制函数，可单测 |
| `src/utils/lottery-format.ts` | 期号补「期」、日期转「11-17 周二」 |
| `src/config/demo.ts` | 设计稿数据与 demo 开关（`demo=1`、`share=1`） |
| `src/pages/home/index.tsx` | 首页只放一个「分享开奖」按钮和 `<ResultPoster />` |

方案层是纯 Canvas 2D：不 import Taro/React，因此可以单独跑布局单测，也能在任意画布环境复用。

## 视觉方案：红金票据

定稿方案（`red-ticket`）：深红渐变底 + 米色票券卡片 + 金色分隔线，票根处有撕线与缺口，开奖仪式感与彩票站气质最强。

一张图里可以放多个彩种，卡片采用分节排版：

- 卡片左右 margin 48、宽 654、圆角 32、水平内边距 56，内容区宽 542。
- 每个彩种一段：彩种名（34 号，左）+ 期号（22 号，右）同一行 → 号码球 → 开奖日期（22 号）。
- 相邻两个「号码数 ≤ 3」的彩种（3D、排列 3 这类）自动并成两列，列宽 255、列间距 32；其余情况独占整行。并排时两段共用同一个 top，海报高度按一行算。
- 段与段之间画一条虚线发丝线，接口是 `layout.separators`。
- 红球与蓝球排成同一条号码带（先红后蓝），一个彩种的号码通常一行放完：球径在 76 与 46 之间按号码总数收缩，间距 14 → 8，每行最多 10 个。
- 只有快乐8 的 20 个号码会折成两行、每行 10 个；其余彩种（含 7 个号码的双色球、7 个的七星彩与七乐彩）都在一行里。
- 所有彩种之后是一条撕线与左右缺口，票根里只放一个二维码：左侧「微信扫码」+ 文案 + 店名，右侧二维码卡片 200 见方。
- 高度 = 卡片底 + 118，随彩种数量与号码行数变化；`measure(items)` 与 `draw(ctx, items, …)` 用同一个 `redTicketLayout(items)`，不会与成图错位。

弹层顶部的彩种 chip 是多选开关：默认全部选中，点一下即从海报里去掉，只剩一个时再点会提示「至少保留一个彩种」。

弹层不再提供方案切换，改风格只需：在 `schemes/` 下新增文件 → 在 `schemes/index.ts` 的 `POSTER_SCHEMES` 注册 → 在 `types.ts` 的 `PosterSchemeId` 加标识 → 改 `ResultPoster.tsx` 顶部的 `posterScheme`。

## 本地预览

H5 开发模式默认走设计稿数据，首页点右上角「分享开奖」即可看到弹层。若要让首页直接打开弹层（截图、演示用）：

```
http://127.0.0.1:<port>/?demo=1&share=1#/pages/home/index
```

`share=1` 由 `src/config/demo.ts` 的 `OPEN_SHARE_ON_LOAD` 解析，只在 demo 模式下生效，小程序端忽略。demo 数据同样在 `config/demo.ts`（`DEMO_DRAWS`，8 个彩种）。

## 换成真实微信二维码

当前二维码是占位图 `src/assets/share/qr-placeholder.png`（420×420，程序生成的示意码）。

1. 微信「我 → 二维码名片 → 保存图片」，或用「联系我」二维码。
2. 覆盖 `src/assets/share/qr-placeholder.png`（建议 420×420 以上、正方形、四边留白的 PNG）。
3. 无需改代码：`config.ts` 通过 `import` 静态引入，构建时会自动带新图。

二维码文案与署名同样在 `config.ts`：`DEFAULT_QR_CAPTION`、`DEFAULT_BRAND_NAME`、`DEFAULT_SLOGAN`。

## 数据流

```
<ResultPoster visible /> → useShareResults → loadShareResults()
  → LATEST_LOTTERIES 逐个 loadLatestGame(code)，只保留已开奖的
  → toPosterInputs(draws, DEFAULT_*)：期号/日期已格式化，二维码与落款从 config 补齐
  → ResultPoster 过滤掉被关掉的彩种，得到 items
  → scheme.measure(items) 决定逻辑高度 750×N
  → scheme.draw(ctx, items, { qr })  按像素比 ≤2 放大绘制
  → Taro.canvasToTempFilePath（weapp）/ canvas.toDataURL（H5）
  → 保存到相册 / 分享给好友（H5 为下载）
```

## 边界与已知限制

- 只分享已开奖彩种：加载中显示「正在获取本期开奖…」，无已开奖彩种显示「本期还没有可分享的开奖结果」，请求失败显示「开奖数据获取失败」。
- 默认全部彩种一起出图，彩种越多图越长（8 个彩种实测 750×2417），需要短图就在弹层里关掉几个。
- 单个彩种请求失败不影响其他彩种；`loadShareResults` 用 `Promise.all` 并发拉取。
- 二维码加载失败时不会整张失败，方案会画灰底「二维码」占位（`drawQrCard` 内置降级）。
- 小程序端二维码使用 `canvas.createImage()` 加载本地资源；若某基础库版本不支持，成图会退化为占位块，接真机二维码时需回归一次。
- 画布按 pixelRatio 放大并封顶 2 倍，避免长图在小程序端占用过多内存。

## 验收记录（2026-11-22 第二轮：独立组件 + 单行号码带）

| 检查 | 结果 |
| --- | --- |
| 单测 | `npx jest src/components/ResultPoster src/utils/lottery-format.test.ts --runInBand` → 3 套 44 例全绿；全量 `npx jest --runInBand` → 6 套 63 例全绿 |
| 类型 | `npx tsc --noEmit` 在 `src/` 下零报错（node_modules 的 Taro 声明噪音与本功能无关） |
| H5 构建 | `npm run build:h5` → webpack 5.78.0 compiled，2 warnings |
| 真实渲染 | `?demo=1&share=1`：弹层自动打开并自取 demo 数据，8 个 chip 默认全选中，点掉快乐8 后海报即时变短 |
| 单行号码 | 实测双色球 7 个号码（6 红 + 1 蓝）在同一行、3D 与排列3 仍并成两列；快乐8 为 10 + 10 两行 |

实测成图高度（750 宽，逻辑像素，由 `measure()` 与 H5 导出互证）：

| 内容 | 8 个彩种全选 | 关掉快乐8（7 个） | 双色球 / 大乐透 / 七星彩 | 快乐8 | 3D / 排列5 | 七乐彩 | 3D + 排列3（并两列） |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 高度 | 2417 | 2159 | 870 | 917 | 881 | 860 | 880 |

- 单行号码带让 8 彩种全选从上一轮的 2957 降到 2417，短号码彩种（3D、排列3）高度与独占时几乎相同。
- 并两列时高度比单独画 3D 少 1 像素：并排段球径 75、独占段 76，说明两个短号码彩种确实共用一行。
- H5 下载落盘实测 PNG 750×2417，与 `measure()` 一致；浏览器里图片按 CSS 等比缩放到 303×978，比例核对无误。

H5 下载落盘实测：按钮为「保存图片」，落盘文件名 `双色球等8个彩种-开奖海报.png`（单个彩种为 `3D-开奖海报.png`），PNG 头尺寸与上表一致。

选型过程：另两套（极简白卡、深色高级黑）曾在 `?demo=1` 下与红金票据并列验证，用户选定红金票据后连同各自单测一并删除。
