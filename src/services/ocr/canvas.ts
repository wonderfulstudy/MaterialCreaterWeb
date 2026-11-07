import { OCR_MODEL } from './config'
import type { RgbaImage } from './types'

interface ImageInfo {
  width: number
  height: number
}

interface WxOffscreenCanvas {
  getContext(type: '2d'): {
    drawImage(image: unknown, x: number, y: number, width: number, height: number): void
    getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray }
  } | null
  createImage(): {
    src: string
    onload: (() => void) | null
    onerror: (() => void) | null
  }
}

interface WxApi {
  getImageInfo?: (options: {
    src: string
    success: (info: ImageInfo) => void
    fail: (error: unknown) => void
  }) => void
  createOffscreenCanvas?: (options: { type: '2d'; width: number; height: number }) => WxOffscreenCanvas
}

function getWx(): WxApi | undefined {
  return (globalThis as unknown as { wx?: WxApi }).wx
}

/**
 * 读取图片像素。为了让后续处理与平台无关，这里一次性解码成 RGBA 数据，
 * 并在过长时按最长边等比缩小（识别前每行还会再缩放到 48px 高）。
 */
export async function loadRgbaImage(
  sourcePath: string,
  maxSide: number = OCR_MODEL.maxImageSide
): Promise<RgbaImage> {
  const wxApi = getWx()
  if (!wxApi || typeof wxApi.getImageInfo !== 'function') {
    throw new Error('当前环境不支持图片读取，请在小程序中使用')
  }
  if (typeof wxApi.createOffscreenCanvas !== 'function') {
    throw new Error('当前微信基础库过低，不支持离屏 Canvas（需 2.16.1 及以上）')
  }

  const info = await new Promise<ImageInfo>((resolve, reject) => {
    wxApi.getImageInfo!({
      src: sourcePath,
      success: resolve,
      fail: reject,
    })
  })

  const longestSide = Math.max(info.width, info.height)
  const scale = longestSide > maxSide ? maxSide / longestSide : 1
  const width = Math.max(1, Math.round(info.width * scale))
  const height = Math.max(1, Math.round(info.height * scale))

  const canvas = wxApi.createOffscreenCanvas({ type: '2d', width, height })
  const context = canvas.getContext('2d')
  if (!context || typeof context.getImageData !== 'function') {
    throw new Error('创建离屏画布失败，请升级微信版本后重试')
  }

  const image = canvas.createImage()
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('图片解码失败'))
    image.src = sourcePath
  })

  context.drawImage(image, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)

  return { data: imageData.data, width, height }
}
