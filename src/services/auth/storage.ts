import Taro from '@tarojs/taro'
import { SESSION_STORAGE_KEY, type AuthSession, type AuthUser } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function parseAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value)) return null
  const openid = readString(value.openid)
  if (!openid) return null
  return {
    openid,
    unionid: readString(value.unionid),
    nickname: readString(value.nickname),
    avatarUrl: readString(value.avatarUrl),
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
  }
}

/** 兼容字符串（存储序列化结果）与对象两种输入，脏数据一律返回 null */
export function parseSession(value: unknown): AuthSession | null {
  let raw = value
  if (typeof raw === 'string') {
    if (!raw) return null
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return null
    }
  }
  if (!isRecord(raw)) return null
  const token = readString(raw.token)
  const expiresAt = readTimestamp(raw.expiresAt)
  if (!token || !expiresAt) return null
  const user = parseAuthUser(raw.user)
  if (!user) return null
  return { token, expiresAt, user }
}

export function isSessionValid(session: AuthSession | null, now: number = Date.now()): boolean {
  if (!session) return false
  return Number.isFinite(session.expiresAt) && session.expiresAt > now
}

export function readSession(): AuthSession | null {
  try {
    return parseSession(Taro.getStorageSync(SESSION_STORAGE_KEY))
  } catch {
    return null
  }
}

export function saveSession(session: AuthSession): boolean {
  try {
    Taro.setStorageSync(SESSION_STORAGE_KEY, session)
    return true
  } catch {
    return false
  }
}

export function clearSession(): void {
  try {
    Taro.removeStorageSync(SESSION_STORAGE_KEY)
  } catch {
    // 存储不可用时忽略：会话已不可用，不影响页面降级
  }
}
