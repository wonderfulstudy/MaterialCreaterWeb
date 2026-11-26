import { configureCore } from '@mc/core/platform'
import Taro from '@tarojs/taro'
import AppConfig from '@/config/app'
import {
  ensureSession,
  maskOpenid,
  updateProfile,
  MOCK_LOGIN_RESPONSE,
  SESSION_STORAGE_KEY,
} from './index'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
    login: jest.fn(),
    getStorageSync: jest.fn(),
    setStorageSync: jest.fn(),
    removeStorageSync: jest.fn(),
  },
}))

interface TaroMock {
  request: jest.Mock
  login: jest.Mock
  getStorageSync: jest.Mock
  setStorageSync: jest.Mock
  removeStorageSync: jest.Mock
}

const taro = Taro as unknown as TaroMock
const store = new Map<string, unknown>()
const API_BASE = 'https://api.example.com'

function cachedSession(token: string, expiresAt: number): string {
  return JSON.stringify({ token, expiresAt, user: MOCK_LOGIN_RESPONSE.user })
}

/** 共享请求层经平台适配层发起请求；测试里把它接回本文件 mock 的 Taro */
function useTaroPlatform(): void {
  configureCore({
    transport: {
      request: (input: any) =>
        taro.request({
          url: input.url,
          method: input.method,
          data: input.data,
          header: input.headers,
          timeout: input.timeoutMs,
        }),
    },
    storage: {
      get: (key: string) => (store.has(key) ? String(store.get(key)) : null),
      set: (key: string, value: string) => {
        store.set(key, value)
      },
      remove: (key: string) => {
        store.delete(key)
      },
    },
    feedback: { toast: () => {} },
    apiBaseUrl: API_BASE,
  })
}

beforeEach(() => {
  store.clear()
  AppConfig.app.auth_mock = true
  AppConfig.app.api_base_url = API_BASE
  taro.getStorageSync.mockImplementation((key: string) => (store.has(key) ? store.get(key) : ''))
  taro.setStorageSync.mockImplementation((key: string, value: unknown) => {
    store.set(key, value)
  })
  taro.removeStorageSync.mockImplementation((key: string) => {
    store.delete(key)
  })
  useTaroPlatform()
})

describe('auth service', () => {
  it('auth_mock 时不发任何网络请求，直接返回 MOCK_LOGIN_RESPONSE 并落存储', async () => {
    const result = await ensureSession()

    expect(result.ok).toBe(true)
    expect(taro.request).not.toHaveBeenCalled()
    expect(taro.login).not.toHaveBeenCalled()
    expect(store.has(SESSION_STORAGE_KEY)).toBe(true)
    if (result.ok) {
      expect(result.session.token).toBe(MOCK_LOGIN_RESPONSE.token)
      expect(result.session.user.openid).toBe(MOCK_LOGIN_RESPONSE.user.openid)
      // 契约 §7 规则「仅展示后 6 位」；文档里的 …jklmn 只到 5 位，按规则实现后 mock 尾号为 1jklmn
      expect(maskOpenid(result.session.user.openid)).toBe('…1jklmn')
      expect(maskOpenid('oX7bH5abcdefghijklmn')).toBe('…ijklmn')
    }
  })

  it('H5 环境下 auth_mock 同样不发网络请求', async () => {
    const previous = process.env.TARO_ENV
    process.env.TARO_ENV = 'h5'
    try {
      const result = await ensureSession()
      expect(result.ok).toBe(true)
      expect(taro.request).not.toHaveBeenCalled()
      expect(taro.login).not.toHaveBeenCalled()
    } finally {
      process.env.TARO_ENV = previous
    }
  })

  it('mock 下 updateProfile 只更新本地会话，不发请求', async () => {
    await ensureSession()
    const result = await updateProfile({ nickname: '老王彩店' })

    expect(taro.request).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.user.nickname).toBe('老王彩店')
      const stored = store.get(SESSION_STORAGE_KEY)
      expect(stored).toBeTruthy()
    }
  })

  it('缓存会话有效时不重新登录', async () => {
    store.set(SESSION_STORAGE_KEY, cachedSession('cached-token', Date.now() + 3600000))

    const result = await ensureSession()

    expect(taro.login).not.toHaveBeenCalled()
    expect(taro.request).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.token).toBe('cached-token')
  })

  it('缓存会话过期时触发重新登录', async () => {
    AppConfig.app.auth_mock = false
    store.set(SESSION_STORAGE_KEY, cachedSession('stale-token', Date.now() - 1000))
    taro.login.mockResolvedValue({ code: 'wx-code-1' })
    taro.request.mockResolvedValue({
      statusCode: 200,
      data: { token: 'fresh-token', expiresAt: Date.now() + 3600000, user: MOCK_LOGIN_RESPONSE.user },
    })

    const result = await ensureSession({ force: true })

    expect(taro.login).toHaveBeenCalledTimes(1)
    expect(taro.request).toHaveBeenCalledTimes(1)
    const options = taro.request.mock.calls[0][0]
    expect(options.url).toBe(API_BASE + '/api/auth/login')
    expect(options.method).toBe('POST')
    expect(options.data.code).toBe('wx-code-1')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.token).toBe('fresh-token')
  })

  it('wx.login 失败时降级为未登录且不写会话', async () => {
    AppConfig.app.auth_mock = false
    taro.login.mockRejectedValue({ errMsg: 'login:fail' })

    const result = await ensureSession({ force: true })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('wx_login_failed')
    expect(taro.request).not.toHaveBeenCalled()
    expect(store.has(SESSION_STORAGE_KEY)).toBe(false)
  })

  it('wx_code_invalid 时静默重试一次 wx.login', async () => {
    AppConfig.app.auth_mock = false
    taro.login.mockResolvedValue({ code: 'wx-code-retry' })
    taro.request
      .mockResolvedValueOnce({ statusCode: 401, data: { code: 'wx_code_invalid', message: 'expired' } })
      .mockResolvedValueOnce({
        statusCode: 200,
        data: { token: 'retry-token', expiresAt: Date.now() + 3600000, user: MOCK_LOGIN_RESPONSE.user },
      })

    const result = await ensureSession({ force: true })

    expect(taro.login).toHaveBeenCalledTimes(2)
    expect(taro.request).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.session.token).toBe('retry-token')
  })
})
