/**
 * 海报绘制的公共画笔：只依赖 Canvas 2D 标准 API，weapp / H5 通用。
 * 所有坐标基于 750 逻辑宽度，调用方按设备像素比放大画布。
 */
/** 海报逻辑宽度，导出按设备像素比放大 */
export const POSTER_WIDTH = 750

/** 中英文混排的字体栈；各端都有的系统字体，避免成图回退到衬线体 */
export const FONT_STACK = '-apple-system, "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif'

export type Ctx = CanvasRenderingContext2D

export type FontWeight = 400 | 500 | 600 | 700

export function font(size: number, weight: FontWeight = 400): string {
  return `${weight} ${size}px ${FONT_STACK}`
}

export function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.arcTo(x + w, y, x + w, y + radius, radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius)
  ctx.lineTo(x + radius, y + h)
  ctx.arcTo(x, y + h, x, y + h - radius, radius)
  ctx.lineTo(x, y + radius)
  ctx.arcTo(x, y, x + radius, y, radius)
  ctx.closePath()
}

export function fillRoundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, color: string): void {
  roundRectPath(ctx, x, y, w, h, r)
  ctx.fillStyle = color
  ctx.fill()
}

/** 填充线性渐变；direction 决定渐变方向 */
export function fillLinearGradient(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  from: string,
  to: string,
  direction: 'vertical' | 'horizontal' = 'vertical'
): void {
  const gradient =
    direction === 'vertical' ? ctx.createLinearGradient(0, y, 0, y + h) : ctx.createLinearGradient(x, 0, x + w, 0)
  gradient.addColorStop(0, from)
  gradient.addColorStop(1, to)
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, w, h)
}

/** 按最大宽度截断文本，超出加省略号 */
export function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text
  }
  let clipped = text
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1)
  }
  return `${clipped}…`
}

export interface TextOptions {
  size: number
  weight?: FontWeight
  color: string
  align?: CanvasTextAlign
  baseline?: CanvasTextBaseline
  maxWidth?: number
}

export function drawText(ctx: Ctx, text: string, x: number, y: number, options: TextOptions): void {
  ctx.font = font(options.size, options.weight ?? 400)
  ctx.fillStyle = options.color
  ctx.textAlign = options.align ?? 'left'
  ctx.textBaseline = options.baseline ?? 'middle'
  ctx.fillText(options.maxWidth ? ellipsize(ctx, text, options.maxWidth) : text, x, y)
}

export function drawCircle(ctx: Ctx, cx: number, cy: number, radius: number, color: string): void {
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

/** 号码球：圆形底 + 居中号码，字号随直径缩放 */
export function drawBall(
  ctx: Ctx,
  cx: number,
  cy: number,
  diameter: number,
  text: string,
  bg: string,
  textColor = '#FFFFFF'
): void {
  drawCircle(ctx, cx, cy, diameter / 2, bg)
  const size = Math.round(diameter * 0.42)
  drawText(ctx, text, cx, cy + 1, { size, weight: 600, color: textColor, align: 'center' })
}

export function drawDashedLine(
  ctx: Ctx,
  x1: number,
  x2: number,
  y: number,
  color: string,
  lineWidth = 2,
  dash: readonly number[] = [10, 8]
): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.setLineDash(dash as number[])
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.restore()
}

export interface BallPlacement {
  x: number
  y: number
}

export interface QrCardOptions {
  /** 卡片底色，默认白色 */
  background?: string
  /** 卡片内边距，默认 18 */
  padding?: number
  /** 卡片圆角，默认 20 */
  radius?: number
  /** 图片缺失时的降级文案颜色 */
  fallbackColor?: string
}

/**
 * 二维码卡片：白色圆角底 + 内嵌二维码。
 * 图片未加载成功时画一片浅灰底纹与「二维码」占位文案，保证成图不空白。
 */
export function drawQrCard(
  ctx: Ctx,
  image: CanvasImageSource | null,
  x: number,
  y: number,
  size: number,
  options: QrCardOptions = {}
): void {
  const padding = options.padding ?? 18
  const radius = options.radius ?? 20
  fillRoundRect(ctx, x, y, size, size, radius, options.background ?? '#FFFFFF')

  const inner = size - padding * 2
  const innerX = x + padding
  const innerY = y + padding

  if (image) {
    ctx.drawImage(image, innerX, innerY, inner, inner)
    return
  }

  fillRoundRect(ctx, innerX, innerY, inner, inner, 8, '#EDEDF0')
  drawText(ctx, '二维码', x + size / 2, y + size / 2, {
    size: Math.round(size * 0.16),
    weight: 500,
    color: options.fallbackColor ?? '#9A9A9E',
    align: 'center',
  })
}
