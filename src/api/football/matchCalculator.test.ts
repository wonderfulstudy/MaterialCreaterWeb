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

describe('getMatchCalculator - 获取体彩足球计算器数据', () => {
  test('statusCode 为 200 时返回 resp.data', async () => {
    const fakeData = { success: true, value: { totalCount: 2 } }
    mockedRequest.mockResolvedValue({ statusCode: 200, data: fakeData } as any)

    const result = await getMatchCalculator()
    
    expect(result).toEqual(fakeData)
  })

  test('默认以 channel=c 发起 GET 请求', async () => {
    mockedRequest.mockResolvedValue({ statusCode: 200, data: {} } as any)

    await getMatchCalculator()

    expect(mockedRequest).toHaveBeenCalledTimes(1)
    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        data: { channel: 'c' },
      }),
    )
  })

  test('可透传自定义 channel 参数', async () => {
    mockedRequest.mockResolvedValue({ statusCode: 200, data: {} } as any)

    await getMatchCalculator('k')

    expect(mockedRequest).toHaveBeenCalledWith(
      expect.objectContaining({ data: { channel: 'k' } }),
    )
  })

  test('statusCode 非 200 时抛出请求失败异常', async () => {
    mockedRequest.mockResolvedValue({ statusCode: 500, data: null } as any)

    await expect(getMatchCalculator()).rejects.toThrow('请求失败：HTTP 500')
  })
})
