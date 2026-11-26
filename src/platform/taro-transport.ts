import Taro from '@tarojs/taro'
import type { Transport, TransportRequest, TransportResponse } from '@mc/core/platform/transport'

/** Web 宿主传输层：Taro.request 自带 timeout，网络异常按现状抛出，非 2xx 交给调用方判定 */
export const taroTransport: Transport = {
  async request<T>(input: TransportRequest): Promise<TransportResponse<T>> {
    const response = await Taro.request({
      url: input.url,
      method: input.method as never,
      data: input.data,
      header: input.headers,
      timeout: input.timeoutMs,
    })
    return { statusCode: response.statusCode, data: response.data as T }
  },
}
