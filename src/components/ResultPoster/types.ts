/** 开奖海报的视觉方案标识；新增风格时在这里加一项，并在 schemes/index.ts 注册 */
export type PosterSchemeId = 'red-ticket'

/**
 * 一张开奖海报需要的全部内容。
 * 方案层只消费这个结构，不感知页面与接口。
 */
export interface ResultPosterInput {
  /** 彩种名称，如「双色球」 */
  gameName: string
  /** 已格式化的期号，如「2026132 期」 */
  issue: string
  /** 已格式化的开奖日期，如「11-18 周二」 */
  drawDate: string
  /** 主号码（红球/前区/单区号码） */
  redNumbers: readonly string[]
  /** 附加号码（蓝球/后区），无则为空数组 */
  blueNumbers: readonly string[]
  /** 二维码图片地址，当前指向占位图 */
  qrImage: string
  /** 二维码旁的引导文案 */
  qrCaption: string
  /** 店名 / 品牌名 */
  brandName: string
  /** 海报底部署名口号 */
  slogan: string
}

/** 绘制前已加载完成的图片资源 */
export interface PosterImages {
  /** 二维码图片；加载失败时为 null，方案需要画出降级占位 */
  qr: CanvasImageSource | null
}

/**
 * 一个海报方案：纯 Canvas 2D 绘制，不引入 Taro 与 DOM。
 * items 是一张海报里的彩种列表（通常多个），至少一项。
 * measure 返回逻辑高度，draw 必须严格绘制在同一高度内。
 */
export interface PosterScheme {
  id: PosterSchemeId
  /** 弹层里展示的方案名，如「红金票据」 */
  name: string
  /** 弹层里的一行风格说明 */
  tagline: string
  measure(items: readonly ResultPosterInput[]): number
  draw(ctx: CanvasRenderingContext2D, items: readonly ResultPosterInput[], images: PosterImages): void
}
