/**
 * 微信二维码分享海报：canvas 合成（含二维码 + 「扫码加我微信」）
 * 微信端走 Taro.createOffscreenCanvas + canvasToTempFilePath（同 SharePoster 的导出流程），
 * H5 端走 <canvas> + toDataURL。
 */
import Taro from '@tarojs/taro'

export const WECHAT_QR_POSTER_WIDTH = 750
export const WECHAT_QR_POSTER_HEIGHT = 1000
export const WECHAT_QR_POSTER_CAPTION = '扫码加我微信'

const COLOR_CARD = '#ffffff'
const COLOR_INK = '#1c1c1e'
const COLOR_MUTED = '#8e8e93'
const COLOR_HAIR = '#f0f0f2'
const COLOR_YELLOW = '#ecc97a'
const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", sans-serif'

interface PosterImage {
  src: string
  onload: (() => void) | null
  onerror: (() => void) | null
}

interface PosterCanvas {
  width: number
  height: number
  getContext(type: '2d'): CanvasRenderingContext2D | null
  createImage?: () => PosterImage
}

function isH5(): boolean {
  return process.env.TARO_ENV === 'h5'
}

function loadFromDom(src: string): Promise<PosterImage> {
  if (typeof Image === 'undefined') return Promise.reject(new Error('当前环境不支持海报绘制'))
  return new Promise<PosterImage>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image as unknown as PosterImage)
    image.onerror = () => reject(new Error('二维码图片加载失败'))
    image.src = src
  })
}

function loadFromCanvas(canvas: PosterCanvas, src: string): Promise<PosterImage> {
  const create = canvas.createImage
  if (typeof create !== 'function') return Promise.reject(new Error('当前环境不支持海报绘制'))
  return new Promise<PosterImage>((resolve, reject) => {
    const image = create.call(canvas)
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('二维码图片加载失败'))
    image.src = src
  })
}

function drawPoster(ctx: CanvasRenderingContext2D, image: PosterImage): void {
  const width = WECHAT_QR_POSTER_WIDTH
  const height = WECHAT_QR_POSTER_HEIGHT
  const qrSize = 520
  const qrX = (width - qrSize) / 2
  const qrY = 220

  ctx.fillStyle = COLOR_CARD
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = COLOR_YELLOW
  ctx.fillRect(0, 0, width, 16)

  ctx.fillStyle = COLOR_INK
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = '600 44px ' + FONT_FAMILY
  ctx.fillText('我的微信二维码', width / 2, 120)

  ctx.fillStyle = COLOR_HAIR
  ctx.fillRect(qrX - 24, qrY - 24, qrSize + 48, qrSize + 48)
  ctx.drawImage(image as unknown as CanvasImageSource, qrX, qrY, qrSize, qrSize)

  ctx.fillStyle = COLOR_INK
  ctx.font = '700 48px ' + FONT_FAMILY
  ctx.fillText(WECHAT_QR_POSTER_CAPTION, width / 2, qrY + qrSize + 100)

  ctx.fillStyle = COLOR_MUTED
  ctx.font = '400 28px ' + FONT_FAMILY
  ctx.fillText('彩店管理助手', width / 2, height - 100)
}

/**
 * 合成海报，返回可直接展示/保存的临时路径（微信端）或 dataURL（H5）
 */
export async function generateWechatQrPoster(imagePath: string): Promise<string> {
  if (!imagePath) throw new Error('没有可用的二维码图片')

  if (isH5()) {
    if (typeof document === 'undefined') throw new Error('当前环境不支持海报绘制')
    const canvas = document.createElement('canvas')
    canvas.width = WECHAT_QR_POSTER_WIDTH
    canvas.height = WECHAT_QR_POSTER_HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前环境不支持海报绘制')
    drawPoster(ctx, await loadFromDom(imagePath))
    return canvas.toDataURL('image/png')
  }

  const canvas = Taro.createOffscreenCanvas({
    type: '2d',
    width: WECHAT_QR_POSTER_WIDTH,
    height: WECHAT_QR_POSTER_HEIGHT,
  }) as unknown as PosterCanvas
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前环境不支持海报绘制')
  drawPoster(ctx, await loadFromCanvas(canvas, imagePath))

  const result = await Taro.canvasToTempFilePath({
    canvas: canvas as unknown as Taro.Canvas,
    x: 0,
    y: 0,
    width: WECHAT_QR_POSTER_WIDTH,
    height: WECHAT_QR_POSTER_HEIGHT,
    destWidth: WECHAT_QR_POSTER_WIDTH,
    destHeight: WECHAT_QR_POSTER_HEIGHT,
    fileType: 'png',
  })
  return result.tempFilePath
}
