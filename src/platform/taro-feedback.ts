import Taro from '@tarojs/taro'
import type { PlatformFeedback } from '@mc/core/platform/feedback'

/** Web 宿主用户反馈：轻提示，不打断操作 */
export const taroFeedback: PlatformFeedback = {
  toast(message: string): void {
    Taro.showToast({ title: message, icon: 'none' })
  },
}
