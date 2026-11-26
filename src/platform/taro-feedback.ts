import type { PlatformFeedback } from '@mc/core/platform/feedback'

declare function require(id: string): any

interface TaroRuntime {
  showToast(options: { title: string; icon: 'none' }): void
}

/** 懒加载宿主 SDK：方法内取，测试里 jest.mock('@tarojs/taro') 的工厂才能生效 */
function taro(): TaroRuntime {
  const mod: any = require('@tarojs/taro')
  return mod.default ?? mod
}

/** Web 宿主用户反馈：轻提示，不打断操作 */
export const taroFeedback: PlatformFeedback = {
  toast(message: string): void {
    taro().showToast({ title: message, icon: 'none' })
  },
}
