import { configureCore } from '@mc/core/platform'
import type { Transport, TransportRequest } from '@mc/core/platform/transport'
import { getMatchCalculator } from './matchCalculator'

// 共享请求层通过平台适配层发起请求，用可控假 Transport 替换真实宿主能力
const transportRequest = jest.fn<Promise<{ statusCode: number; data: unknown }>, [TransportRequest]>()

function useTransport(): void {
  configureCore({
    transport: { request: transportRequest } as unknown as Transport,
    storage: { get: (_key: string) => null, set: (_key: string, _value: string) => {}, remove: (_key: string) => {} },
    feedback: { toast: (_message: string) => {} },
    apiBaseUrl: '',
  })
}

beforeEach(() => {
  useTransport()
})

/** 代理统一信封：code=0 表示上游成功，data 是上游原始响应体 */
function envelope(data: unknown) {
  return { statusCode: 200, data: { code: 0, data } }
}

describe('getMatchCalculator - 经自建代理获取竞彩计算器数据', () => {
  test('代理 code=0 时把上游响应体原样返回', async () => {
    const upstream = { success: true, value: { totalCount: 2 } }
    transportRequest.mockResolvedValue(envelope(upstream))

    await expect(getMatchCalculator()).resolves.toEqual(upstream)
  })

  test('默认请求竞彩足球代理路由，并以 channel=c 查询', async () => {
    transportRequest.mockResolvedValue(envelope({}))

    await getMatchCalculator()

    expect(transportRequest).toHaveBeenCalledTimes(1)
    expect(transportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: expect.stringContaining('/api/jc/football'),
        data: { channel: 'c' },
      }),
    )
  })

  test('篮球走 /api/jc/basketball，并透传自定义 channel', async () => {
    transportRequest.mockResolvedValue(envelope({}))

    await getMatchCalculator('k', 'basketball')

    expect(transportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/api/jc/basketball'),
        data: { channel: 'k' },
      }),
    )
  })

  test('HTTP 状态非 2xx 时抛出请求失败异常', async () => {
    transportRequest.mockResolvedValue({ statusCode: 500, data: null })

    await expect(getMatchCalculator()).rejects.toThrow('请求失败：HTTP 500')
  })

  test('代理返回 code 非 0 时抛出代理给出的原因', async () => {
    transportRequest.mockResolvedValue({
      statusCode: 200,
      data: { code: 502, message: '上游失败' },
    })

    await expect(getMatchCalculator()).rejects.toThrow('上游失败')
  })
})
