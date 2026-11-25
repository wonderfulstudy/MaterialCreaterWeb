/**
 * 静默登录服务
 * - auth_mock 为 true：不发任何网络请求，直接返回契约里的 MOCK_LOGIN_RESPONSE 并落存储
 * - 真机：Taro.login 取 code -> POST /api/auth/login；wx_code_invalid 静默重试一次
 * - 任何失败都降级为未登录态，绝不让页面白屏
 */
import Taro from '@tarojs/taro'
import AppConfig from '@/config/app'
import { ApiError, HttpStatusError, requestDetailed } from '@/api/client'
import {
  AuthError,
  MOCK_LOGIN_RESPONSE,
  type AuthErrorBody,
  type AuthErrorCode,
  type AuthResult,
  type AuthSession,
  type AuthUser,
  type LoginPayload,
} from './types'
import {
  clearSession,
  isSessionValid,
  parseAuthUser,
  parseSession,
  readSession,
  saveSession,
} from './storage'

const LOGIN_PATH = '/api/auth/login'
const PROFILE_PATH = '/api/user/profile'
const JSON_HEADER = 'application/json; charset=utf-8'

export interface EnsureSessionOptions extends LoginPayload {
  /** true 表示忽略缓存会话，强制重新登录 */
  force?: boolean
}

let pendingLogin: Promise<AuthResult> | null = null

export function isMockEnabled(): boolean {
  return AppConfig.app.auth_mock === true
}

function apiBaseUrl(): string {
  return (AppConfig.app.api_base_url || '').replace(/\/+$/, '')
}

function readErrorField(body: unknown, field: 'code' | 'message'): string {
  if (typeof body !== 'object' || body === null) return ''
  const value = (body as Record<string, unknown>)[field]
  return typeof value === 'string' ? value : ''
}

function toErrorCode(raw: string): AuthErrorCode | null {
  switch (raw) {
    case 'invalid_payload':
    case 'wx_code_invalid':
    case 'session_expired':
    case 'rate_limited':
    case 'wx_upstream_error':
    case 'internal_error':
      return raw
    default:
      return null
  }
}

/** 把契约失败体与 HTTP 状态映射为 AuthError；statusCode 一并带出（gate 靠 403 识别 not_allowed） */
function responseError(statusCode: number, body: unknown): AuthError {
  const code = toErrorCode(readErrorField(body, 'code'))
  if (code) return new AuthError(code, readErrorField(body, 'message') || '登录失败', statusCode)
  if (statusCode === 400) return new AuthError('invalid_payload', '登录失败', statusCode)
  if (statusCode === 401) return new AuthError('session_expired', '登录状态已失效', statusCode)
  // 403 not_allowed 落在最后的兜底分支：AuthErrorCode 联合被 pages/profile 穷举，不新增码，
  // 调用方（gate 页）改读 statusCode === 403 识别这个终态
  if (statusCode === 429) return new AuthError('rate_limited', '操作太频繁', statusCode)
  if (statusCode === 502) return new AuthError('wx_upstream_error', '微信服务异常', statusCode)
  if (statusCode >= 500) return new AuthError('internal_error', '服务异常', statusCode)
  return new AuthError('network_error', '网络异常', statusCode)
}

/** client.ts 的异常投影回 AuthError；已是 AuthError 的原样返回 */
function toAuthError(error: unknown): AuthError {
  if (error instanceof AuthError) return error
  if (error instanceof HttpStatusError) return responseError(error.statusCode, error.body)
  if (error instanceof ApiError) {
    return new AuthError('internal_error', error.message)
  }
  return new AuthError('network_error', '网络异常')
}

async function requestWechatCode(): Promise<string> {
  try {
    const result = await Taro.login()
    if (result && typeof result.code === 'string' && result.code) return result.code
  } catch {
    // 统一在下方抛出 wx_login_failed
  }
  throw new AuthError('wx_login_failed', '微信登录失败')
}

async function postLogin(code: string, payload: LoginPayload): Promise<AuthSession> {
  const data: { code: string; nickname?: string; avatarUrl?: string } = { code }
  if (payload.nickname) data.nickname = payload.nickname
  if (payload.avatarUrl) data.avatarUrl = payload.avatarUrl

  try {
    const response = await requestDetailed<AuthSession | AuthErrorBody>({
      url: apiBaseUrl() + LOGIN_PATH,
      method: 'POST',
      header: { 'content-type': JSON_HEADER },
      data,
    })
    const session = parseSession(response.data)
    if (!session) throw new AuthError('internal_error', '登录响应异常', response.statusCode)
    return session
  } catch (error) {
    throw toAuthError(error)
  }
}

async function loginWithWechat(payload: LoginPayload): Promise<AuthResult> {
  try {
    const code = await requestWechatCode()
    try {
      return { ok: true, session: await postLogin(code, payload) }
    } catch (error) {
      // 契约：wx_code_invalid 静默重试一次 wx.login
      if (error instanceof AuthError && error.code === 'wx_code_invalid') {
        const retryCode = await requestWechatCode()
        return { ok: true, session: await postLogin(retryCode, payload) }
      }
      throw error
    }
  } catch (error) {
    return {
      ok: false,
      error: toAuthError(error),
    }
  }
}

function buildMockSession(payload: LoginPayload): AuthSession {
  const user: AuthUser = { ...MOCK_LOGIN_RESPONSE.user }
  if (payload.nickname) user.nickname = payload.nickname
  if (payload.avatarUrl) user.avatarUrl = payload.avatarUrl
  return { token: MOCK_LOGIN_RESPONSE.token, expiresAt: MOCK_LOGIN_RESPONSE.expiresAt, user }
}

async function runEnsureSession(options: EnsureSessionOptions): Promise<AuthResult> {
  const cached = readSession()
  if (!options.force && cached && isSessionValid(cached)) return { ok: true, session: cached }
  if (cached) clearSession()

  if (isMockEnabled()) {
    const session = buildMockSession({ nickname: options.nickname, avatarUrl: options.avatarUrl })
    saveSession(session)
    return { ok: true, session }
  }
  return loginWithWechat({ nickname: options.nickname, avatarUrl: options.avatarUrl })
}

export function ensureSession(options: EnsureSessionOptions = {}): Promise<AuthResult> {
  if (!options.force && pendingLogin) return pendingLogin
  const task = runEnsureSession(options)
  if (!options.force) {
    pendingLogin = task
    void task.then(() => {
      if (pendingLogin === task) pendingLogin = null
    })
  }
  return task
}

export async function updateProfile(patch: LoginPayload): Promise<AuthResult> {
  const current = readSession()
  if (!current || !isSessionValid(current)) {
    clearSession()
    return { ok: false, error: new AuthError('session_expired', '登录状态已失效') }
  }

  if (isMockEnabled()) {
    const user: AuthUser = {
      ...current.user,
      nickname: patch.nickname !== undefined ? patch.nickname : current.user.nickname,
      avatarUrl: patch.avatarUrl ? patch.avatarUrl : current.user.avatarUrl,
      updatedAt: Date.now(),
    }
    const session: AuthSession = { ...current, user }
    saveSession(session)
    return { ok: true, session }
  }

  try {
    const response = await requestDetailed<AuthUser | AuthErrorBody>({
      url: apiBaseUrl() + PROFILE_PATH,
      method: 'PUT',
      header: { 'content-type': JSON_HEADER, Authorization: 'Bearer ' + current.token },
      data: patch,
    })
    const user = parseAuthUser(response.data)
    if (!user) return { ok: false, error: new AuthError('internal_error', '资料响应异常') }
    const session: AuthSession = { ...current, user }
    saveSession(session)
    return { ok: true, session }
  } catch (error) {
    const authError = toAuthError(error)
    if (authError.statusCode === 401) clearSession()
    return { ok: false, error: authError }
  }
}

/** 契约：openid 只显示后 6 位 */
export function maskOpenid(openid: string): string {
  if (!openid) return ''
  return '…' + openid.slice(-6)
}

export { AuthError, MOCK_LOGIN_RESPONSE, SESSION_STORAGE_KEY } from './types'
export type { AuthErrorBody, AuthErrorCode, AuthResult, AuthSession, AuthUser, LoginPayload } from './types'
