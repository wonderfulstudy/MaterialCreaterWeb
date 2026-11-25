/**
 * 统一请求封装：超时、重试、统一信封解析与错误类型都收敛在这里。
 * 仓库内所有 Taro.request 调用都必须经过本文件（包一层可测、可替换的最小面）。
 */
import Taro from '@tarojs/taro'

/** 默认超时（毫秒）：上游慢时尽快失败，让调用方回落本地缓存 */
export const REQUEST_TIMEOUT = 8000

/** 网络失败/超时后的重试次数；HTTP 非 2xx 不重试 */
const NETWORK_RETRIES = 1

/** 业务失败：统一信封 code!==0 */
export class ApiError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

/** HTTP 非 2xx：不重试，交给调用方按状态码语义处理 */
export class HttpStatusError extends Error {
  readonly statusCode: number
  readonly body: unknown

  constructor(statusCode: number, body: unknown) {
    super(`请求失败：HTTP ${statusCode}`)
    this.name = 'HttpStatusError'
    this.statusCode = statusCode
    this.body = body
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  url: string
  method?: HttpMethod
  data?: unknown
  header?: Record<string, string>
  /** 超时毫秒数，缺省 REQUEST_TIMEOUT */
  timeout?: number
}

export interface ApiResponse<T> {
  /** 信封里的 data；无信封时即响应体本身 */
  data: T
  /** 原始响应体，供需要信封元信息（如 cachedAt / stale）的调用方使用 */
  body: unknown
  statusCode: number
  /** 响应体是否命中统一信封 {code,message,data} */
  enveloped: boolean
}

interface RawResponse {
  statusCode: number
  data: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 解析统一信封 {code,message,data}：code!==0 抛 ApiError。
 * 没有数值型 code 的响应（如 auth 契约的成功体直接是业务对象）原样返回。
 */
function unwrapEnvelope(body: unknown): { data: unknown; enveloped: boolean } {
  if (!isRecord(body) || typeof body.code !== 'number') {
    return { data: body, enveloped: false }
  }
  if (body.code !== 0) {
    const message =
      typeof body.message === 'string' && body.message
        ? body.message
        : `请求失败：code ${body.code}`
    throw new ApiError(body.code, message)
  }
  return { data: body.data, enveloped: true }
}

async function sendOnce(options: RequestOptions): Promise<RawResponse> {
  // 全仓唯一的裸调用点：grep "Taro.request(" src 只应命中本行
  const response = (await Taro.request({
    url: options.url,
    method: options.method ?? 'GET',
    data: options.data,
    header: options.header,
    timeout: options.timeout ?? REQUEST_TIMEOUT,
  })) as RawResponse
  return { statusCode: response.statusCode, data: response.data }
}

/** 网络失败/超时才重试；响应已到达（含非 2xx）一律不重试 */
async function sendWithRetry(options: RequestOptions, retriesLeft = NETWORK_RETRIES): Promise<RawResponse> {
  try {
    return await sendOnce(options)
  } catch (error) {
    if (retriesLeft <= 0) throw error
    return sendWithRetry(options, retriesLeft - 1)
  }
}

/** 需要信封元信息时用它；一般业务只用 request */
export async function requestDetailed<T = unknown>(options: RequestOptions): Promise<ApiResponse<T>> {
  const response = await sendWithRetry(options)

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new HttpStatusError(response.statusCode, response.data)
  }

  const { data, enveloped } = unwrapEnvelope(response.data)
  return {
    data: data as T,
    body: response.data,
    statusCode: response.statusCode,
    enveloped,
  }
}

/** 统一请求入口：返回信封里的 data（无信封时返回响应体） */
export async function request<T = unknown>(options: RequestOptions): Promise<T> {
  const response = await requestDetailed<T>(options)
  return response.data
}
