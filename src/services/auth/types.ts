/**
 * 静默登录相关类型与常量（字段名严格对齐 docs/api/auth-contract.md）
 */

export interface AuthUser {
  openid: string
  unionid: string
  nickname: string
  avatarUrl: string
  createdAt: number
  updatedAt: number
}

export interface AuthSession {
  token: string
  /** 毫秒时间戳，来自登录响应 */
  expiresAt: number
  user: AuthUser
}

export interface LoginPayload {
  nickname?: string
  avatarUrl?: string
}

/** 契约错误码 + 两个纯前端降级码（wx_login_failed / network_error） */
export type AuthErrorCode =
  | 'invalid_payload'
  | 'wx_code_invalid'
  | 'session_expired'
  | 'rate_limited'
  | 'wx_upstream_error'
  | 'internal_error'
  | 'wx_login_failed'
  | 'network_error'

/** 契约失败体 { code, message } */
export interface AuthErrorBody {
  code: string
  message: string
}

export class AuthError extends Error {
  readonly code: AuthErrorCode
  /** 失败对应的 HTTP 状态码；纯前端降级（wx_login_failed / network_error）为 0 */
  readonly statusCode: number

  constructor(code: AuthErrorCode, message: string, statusCode: number = 0) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.statusCode = statusCode
  }
}

export type AuthResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: AuthError }

/** 会话存储键（契约） */
export const SESSION_STORAGE_KEY = 'mc.auth.session.v1'

/** 契约给出的 mock 登录响应（auth_mock 为 true 时直接使用） */
export const MOCK_LOGIN_RESPONSE: AuthSession = {
  token: 'mock-token',
  expiresAt: 1893456000000,
  user: {
    openid: 'mock-openid-000001jklmn',
    unionid: '',
    nickname: '',
    avatarUrl: '',
    createdAt: 1763000000000,
    updatedAt: 1763000000000,
  },
}
