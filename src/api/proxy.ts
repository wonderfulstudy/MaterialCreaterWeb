import Taro from '@tarojs/taro'

/**
 * 开奖数据统一走自建代理（契约见 shared/releases/v1.0.0/API.r1.md）。
 * 前端不再直连上游、不再自己设置上游要求的请求头，也不再依赖上游 CORS。
 */

/** 代理超时：上游慢时不拖住页面，尽快回落本地缓存 */
const PROXY_TIMEOUT = 8000

export interface ProxyResult<T> {
  /** 契约 code=0 时的 data，上游 JSON 原样透传 */
  data: T
  /** 这份数据的取得时间（毫秒）；命中代理缓存时是上次成功的时间 */
  cachedAt: number
  /** true 表示本次上游失败、返回的是代理缓存 */
  stale: boolean
}

interface ProxyEnvelope<T> {
  code?: number
  message?: string
  data?: T
  cachedAt?: number
  stale?: boolean
}

/** 构建期常量由 config/index.ts 的 defineConstants 注入；测试环境未注入时退回同源相对路径 */
function apiBase(): string {
  return typeof __API_BASE__ === 'string' ? __API_BASE__ : ''
}

export async function requestProxy<T>(
  path: string,
  query?: Record<string, string | number>
): Promise<ProxyResult<T>> {
  const resp = await Taro.request<ProxyEnvelope<T>>({
    url: `${apiBase()}${path}`,
    method: 'GET',
    timeout: PROXY_TIMEOUT,
    data: query,
  })

  if (resp.statusCode < 200 || resp.statusCode >= 300) {
    throw new Error(`请求失败：HTTP ${resp.statusCode}`)
  }

  const body = resp.data
  if (!body || body.code !== 0) {
    throw new Error(body?.message || `请求失败：code ${body?.code ?? '未知'}`)
  }

  return {
    data: body.data as T,
    cachedAt: typeof body.cachedAt === 'number' ? body.cachedAt : Date.now(),
    stale: body.stale === true,
  }
}
