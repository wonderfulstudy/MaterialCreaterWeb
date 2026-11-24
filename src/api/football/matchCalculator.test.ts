import Taro from '@tarojs/taro'
import { getMatchCalculator } from './matchCalculator'

// @tarojs/taro 依赖小程序运行时，Node 环境无法真实加载，
// 用 jest.mock 把整个模块替换成可控的假实现。
// jest.mock 会被 babel 提升到文件顶部，因此早于上面的 import 执行。
jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    request: jest.fn(),
  },
}))

// 把 Taro.request 收窄成带 mock 能力的类型，方便断言调用参数
const mockedRequest = Taro.request as jest.MockedFunction<typeof Taro.request>

/** 代理统一信封：code=0 表示上游成功，data 是上游原始响应体 */
function envelope(data: unknown) {
  return { statusCode: 200, data: { code: 0, data } }
}

describe('getMatchCalculator - 经自建代理获取竞彩计算器数据', () => {
  test('代理 code=0 时把上游响应体原样返回', async () => {
    const upstream = { success: true, value: { totalCount: 2 } }
    mockedRequest.mockResolvedValue(envelope(upstream) as any)

    await expect(getMatchCalculator()).resolves.toEqual(upstream)
  })

  test('默认请求竞彩足球代理路由，并以 channel=c 查询', async () => {
    mockedRequest.mockResolvedValue(envelope({}) as any)

    await getMatchCalculator()

    expect(mockedRequest).toHaveBeenCalledTimes(1)
    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: expect.stringContaining('/api/jc/football'),
        data: { channel: 'c' },
      }),
    )
  })

  test('篮球走 /api/jc/basketball，并透传自定义 channel', async () => {
    mockedRequest.mockResolvedValue(envelope({}) as any)

    await getMatchCalculator('k', 'basketball')

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('/api/jc/basketball'),
        data: { channel: 'k' },
      }),
    )
  })

  test('HTTP 状态非 2xx 时抛出请求失败异常', async () => {
    mockedRequest.mockResolvedValue({ statusCode: 500, data: null } as any)

    await expect(getMatchCalculator()).rejects.toThrow('请求失败：HTTP 500')
  })

  test('代理返回 code 非 0 时抛出代理给出的原因', async () => {
    mockedRequest.mockResolvedValue({
      statusCode: 200,
      data: { code: 502, message: '上游失败' },
    } as any)

    await expect(getMatchCalculator()).rejects.toThrow('上游失败')
  })
})
