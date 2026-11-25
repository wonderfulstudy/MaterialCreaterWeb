import { ApiError, HttpStatusError, requestDetailed } from './client'

/**
 * 开奖数据统一走自建代理（契约见 shared/releases/v1.0.0/API.r1.md）。
 * 前端不再直连上游、不再自己设置上游要求的请求头，也不再依赖上游 CORS。
 * 超时/重试/信封解析统一由 api/client.ts 负责，这里只保留代理语义。
 */

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

/** 代理对外仍抛普通 Error（页面只按失败处理），文案与改造前一致 */
function toProxyError(error: unknown): Error {
  if (error instanceof HttpStatusError) {
    return new Error(`请求失败：HTTP ${error.statusCode}`)
  }
  if (error instanceof ApiError) {
    return new Error(error.message)
  }
  return error instanceof Error ? error : new Error('请求失败')
}

export async function requestProxy<T>(
  path: string,
  query?: Record<string, string | number>
): Promise<ProxyResult<T>> {
  let response
  try {
    response = await requestDetailed<ProxyEnvelope<T>>({
      url: `${apiBase()}${path}`,
      method: 'GET',
      data: query,
    })
  } catch (error) {
    throw toProxyError(error)
  }

  // 代理契约要求响应体是 {code,message,data}；缺信封按失败处理，好让调用方回落缓存
  if (!response.enveloped) {
    throw new Error('请求失败：code 未知')
  }

  const body = response.body as ProxyEnvelope<T>
  return {
    data: body.data as T,
    cachedAt: typeof body.cachedAt === 'number' ? body.cachedAt : Date.now(),
    stale: body.stale === true,
  }
}
