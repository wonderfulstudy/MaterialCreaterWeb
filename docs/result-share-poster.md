# 开奖结果分享海报

首页「分享开奖」入口把当期开奖号码绘制成一张 PNG 海报，附微信二维码引流，可直接保存到相册或转发好友。

## 结构

| 路径 | 职责 |
| --- | --- |
| `src/components/ResultPoster/types.ts` | 方案契约：`ResultPosterInput`、`PosterImages`、`PosterScheme` |
| `src/components/ResultPoster/canvas-kit.ts` | 公共画笔（750 逻辑宽度）：圆角矩形、渐变、文本截断、号码球、虚线、二维码卡片 |
| `src/components/ResultPoster/config.ts` | 二维码占位图与默认文案 |
| `src/components/ResultPoster/ResultPoster.tsx` | 弹层：彩种切换、离屏绘制、导出、保存/分享 |
| `src/components/ResultPoster/schemes/red-ticket.ts` | 红金票据方案：纯布局函数 + 绘制函数，可单测 |
| `src/pages/home/index.tsx` | 首页「分享开奖」入口，只把已开奖的彩种传进海报 |

方案层是纯 Canvas 2D：不 import Taro/React，因此可以单独跑布局单测，也能在任意画布环境复用。

## 视觉方案：红金票据

定稿方案（`red-ticket`）：深红渐变底 + 米色票券卡片 + 金色分隔线，票根处有撕线与缺口，开奖仪式感与彩票站气质最强。

布局要点（`red-ticket.ts`）：卡片左右 margin 48、宽 654、圆角 32、水平内边距 56；号码球按号码数量自适应，球径在 76 与 46 之间收缩、每行最多 6 个、超过 12 个号码自动改单行 10 个的小球排布；蓝球单独一行 76 号；二维码卡片 200 见方放在票根下沿；高度 = 卡片底 + 118，随号码行数变化。

弹层不再提供方案切换，改风格只需：在 `schemes/` 下新增文件 → 在 `schemes/index.ts` 的 `POSTER_SCHEMES` 注册 → 在 `types.ts` 的 `PosterSchemeId` 加标识 → 改 `ResultPoster.tsx` 顶部的 `posterScheme`。

## 本地预览

H5 开发模式默认走设计稿数据，首页点右上角「分享开奖」即可看到弹层。若要让首页直接打开弹层（截图、演示用）：

```
http://127.0.0.1:<port>/?demo=1&share=1#/pages/home/index
```

`share=1` 由 `home-data.ts` 的 `OPEN_SHARE_ON_LOAD` 解析，只在 demo 模式下生效，小程序端忽略。

## 换成真实微信二维码

当前二维码是占位图 `src/assets/share/qr-placeholder.png`（420×420，程序生成的示意码）。

1. 微信「我 → 二维码名片 → 保存图片」，或用「联系我」二维码。
2. 覆盖 `src/assets/share/qr-placeholder.png`（建议 420×420 以上、正方形、四边留白的 PNG）。
3. 无需改代码：`config.ts` 通过 `import` 静态引入，构建时会自动带新图。

二维码文案与署名同样在 `config.ts`：`DEFAULT_QR_CAPTION`、`DEFAULT_BRAND_NAME`、`DEFAULT_SLOGAN`。

## 数据流

```
loadLatestGame(code) → LotteryCardView(status: 'drawn')
  → 首页 map 成 ResultPosterInput（期号/日期已格式化）
  → ResultPoster 选中彩种
  → scheme.measure(input) 决定逻辑高度 750×N
  → scheme.draw(ctx, input, { qr })  按像素比 ≤2 放大绘制
  → Taro.canvasToTempFilePath（weapp）/ canvas.toDataURL（H5）
  → 保存到相册 / 分享给好友（H5 为下载）
```

## 边界与已知限制

- 只分享已开奖彩种；加载中或无数据的彩种不出现在弹层里，全部未开奖时点入口只提示。
- 二维码加载失败时不会整张失败，方案会画灰底「二维码」占位（`drawQrCard` 内置降级）。
- 小程序端二维码使用 `canvas.createImage()` 加载本地资源；若某基础库版本不支持，成图会退化为占位块，接真机二维码时需回归一次。
- 画布按 pixelRatio 放大并封顶 2 倍，避免长图在小程序端占用过多内存。

## 验收记录（2026-11-21）

| 检查 | 结果 |
| --- | --- |
| 布局单测 | `npx jest src/components/ResultPoster --runInBand` → 1 套 13 例全绿 |
| 类型 | `npx tsc --noEmit` 在 `src/` 下零报错（node_modules 的 Taro 声明噪音与本功能无关） |
| H5 构建 | `npm run build:h5` → webpack 5.78.0 compiled，2 warnings |
| 真实渲染 | `?demo=1` 首页 → 分享开奖 → 8 个彩种 chip 均能重绘；成图高度随彩种变化 |

实测成图高度（750 宽，逻辑像素）：

| 彩种 | 双色球 | 大乐透 | 3D | 快乐8 |
| --- | --- | --- | --- |
| 高度 | 1037 | 1037 | 935 | 971 |

H5 下载落盘实测：点「下载图片」得到 `<彩种>-开奖海报.png`，750×935 等，号码、二维码与票根完整。

选型过程：另两套（极简白卡、深色高级黑）曾在 `?demo=1` 下与红金票据并列验证，用户选定红金票据后连同各自单测一并删除。
