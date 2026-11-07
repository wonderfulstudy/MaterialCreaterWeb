/**
 * 空结果重试工具。
 * 福彩/体彩接口偶发返回空数据（反爬/限流），mapper 会将其归一为空数组；
 * 首页只需最新一期，空数组时短暂延迟后重试可显著提高成功率。
 * load 抛出的异常不在此处理，由调用方决定（如标记 unavailable）。
 */
export async function loadWithRetryOnEmpty<T>(
  load: () => Promise<T[]>,
  options: { attempts?: number; delayMs?: number } = {}
): Promise<T[]> {
  const { attempts = 3, delayMs = 300 } = options

  for (let attempt = 1; ; attempt++) {
    const results = await load()

    if (results.length > 0 || attempt >= attempts) {
      return results
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
