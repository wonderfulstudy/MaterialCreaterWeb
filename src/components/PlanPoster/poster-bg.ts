/**
 * B 卡背景图：storage 读写、选图压缩都收在这里，组件只调成品函数。
 * 值统一是「http(s) 地址」或「data:image base64」，非法值一律当没有，回落到静态占位图。
 */
import Taro from '@tarojs/taro'

/** 背景图存储 key：值为 base64 dataURL 或图片地址 */
export const POSTER_BG_STORAGE_KEY = 'mc.poster.bg.v1'
/** 压缩后的最大宽度：画布 375 逻辑宽 × 导出 2 倍 = 750 成品宽，背景图按 750 存就够 */
export const POSTER_BG_MAX_WIDTH = 750
/** JPEG 质量：750 宽下 0.82 肉眼无损，base64 一般 60~120KB，塞得进 storage */
export const POSTER_BG_QUALITY = 0.82

/** storage 里的值 → 可用地址；非法/空返回空串，由调用方回落到静态占位图 */
export function normalizeBackground(raw: unknown): string {
  if (typeof raw === 'string') {
    const value = raw.trim()
    return /^(https?:\/\/|data:image\/)/.test(value) ? value : ''
  }
  if (raw && typeof raw === 'object') {
    const record = raw as { url?: unknown; src?: unknown }
    const url = typeof record.url === 'string' ? record.url : record.src
    return typeof url === 'string' && normalizeBackground(url) ? url : ''
  }
  return ''
}

/** 读 storage；读不到或值不合法返回空串 */
export function readPosterBackground(): string {
  try {
    return normalizeBackground(Taro.getStorageSync(POSTER_BG_STORAGE_KEY))
  } catch {
    return ''
  }
}

/** 写入 storage，返回规范化后的值供组件当场换图 */
export function savePosterBackground(dataUrl: string): string {
  const value = normalizeBackground(dataUrl)
  if (!value) {
    throw new Error('背景图数据无效')
  }
  Taro.setStorageSync(POSTER_BG_STORAGE_KEY, value)
  return value
}

/** 恢复默认：删掉 key，调用方把 coverImage 置空即回落占位图 */
export function clearPosterBackground(): void {
  try {
    Taro.removeStorageSync(POSTER_BG_STORAGE_KEY)
  } catch {
    // 删不掉就维持现状，不打断海报渲染
  }
}

export interface CompressBackgroundOptions {
  /** 目标最大宽度，默认 POSTER_BG_MAX_WIDTH */
  maxWidth?: number
  /** JPEG 质量 0~1，默认 POSTER_BG_QUALITY */
  quality?: number
}

/**
 * 等比压到 maxWidth 宽并转 JPEG dataURL（原图更窄不放大）。
 * H5 专用：走 canvas，小程序端不会调用。
 */
export function compressPosterBackground(src: string, options: CompressBackgroundOptions = {}): Promise<string> {
  const maxWidth = options.maxWidth && options.maxWidth > 0 ? options.maxWidth : POSTER_BG_MAX_WIDTH
  const quality = options.quality && options.quality > 0 ? options.quality : POSTER_BG_QUALITY
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('当前环境不支持图片压缩'))
      return
    }
    const image = document.createElement('img')
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width
        const height = image.naturalHeight || image.height
        if (!width || !height) {
          reject(new Error('背景图尺寸异常'))
          return
        }
        const targetWidth = Math.min(maxWidth, width)
        const targetHeight = Math.max(1, Math.round((height * targetWidth) / width))
        const canvas = document.createElement('canvas')
        canvas.width = targetWidth
        canvas.height = targetHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('当前环境不支持图片压缩'))
          return
        }
        // 透明 PNG 转 JPEG 会发黑，先铺海报底色
        ctx.fillStyle = '#1d0b04'
        ctx.fillRect(0, 0, targetWidth, targetHeight)
        ctx.drawImage(image, 0, 0, targetWidth, targetHeight)
        resolve(canvas.toDataURL('image/jpeg', quality))
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    }
    image.onerror = () => reject(new Error('背景图读取失败'))
    image.src = src
  })
}

/**
 * H5 选图 → 压缩 → 返回可写入 storage 的 dataURL。
 * 用户取消返回 null（不抛错，调用方静默返回）。
 */
export async function pickPosterBackground(): Promise<string | null> {
  const picked = await Taro.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] })
  const src = picked?.tempFilePaths?.[0]
  if (!src) {
    return null
  }
  return compressPosterBackground(src)
}
