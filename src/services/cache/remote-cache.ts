import Taro from '@tarojs/taro'

/**
 * 开奖数据的本地缓存。
 * 断网或接口失败时用上次成功的数据兜底，并给出可信的更新时间；
 * 所有 key 统一 mc. 前缀，避免与登录态等其它本地存储混用。
 */
const CACHE_PREFIX = 'mc.'

export interface CacheEntry<T> {
  /** 上次成功写入的时间戳（毫秒） */
  updatedAt: number
  data: T
}

export interface CachedLoad<T> {
  data: T
  updatedAt: number
  /** true 表示本次请求失败，数据来自本地缓存 */
  fromCache: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** 拼出带统一前缀的缓存 key，如 cacheKey('latest', 'dlt') → 'mc.latest.dlt' */
export function cacheKey(...parts: string[]): string {
  return CACHE_PREFIX + parts.join('.')
}

/** 读缓存；没有缓存、结构损坏或存储不可用时返回 null */
export function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    let raw: unknown = Taro.getStorageSync(key)
    if (typeof raw === 'string') {
      if (!raw) {
        return null
      }
      raw = JSON.parse(raw) as unknown
    }
    if (!isRecord(raw)) {
      return null
    }
    const { updatedAt, data } = raw
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || data === undefined) {
      return null
    }
    return { updatedAt, data: data as T }
  } catch {
    return null
  }
}

/** 写缓存；写入失败只影响下次的断网兜底，不影响本次渲染 */
export function writeCache<T>(key: string, data: T, updatedAt: number = Date.now()): void {
  try {
    Taro.setStorageSync(key, { updatedAt, data } as CacheEntry<T>)
  } catch {
    // 存储满或被禁用时静默跳过
  }
}

/**
 * 先请求、成功后落缓存；请求失败回落上次成功的数据。
 * 两者都没有时返回 null，由调用方渲染空态。
 */
export async function loadWithCache<T>(
  key: string,
  load: () => Promise<T>
): Promise<CachedLoad<T> | null> {
  try {
    const data = await load()
    const updatedAt = Date.now()
    writeCache(key, data, updatedAt)
    return { data, updatedAt, fromCache: false }
  } catch (error) {
    console.error('[cache] 请求失败，尝试使用本地缓存:', key, error)
    const cached = readCache<T>(key)
    if (!cached) {
      return null
    }
    return { data: cached.data, updatedAt: cached.updatedAt, fromCache: true }
  }
}

/** 更新时间展示文案：'11-22 21:42' */
export function formatUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
