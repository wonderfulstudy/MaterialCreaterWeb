import { configureCore } from '@mc/core/platform'
import { taroTransport } from './taro-transport'
import { taroStorage } from './taro-storage'
import { taroFeedback } from './taro-feedback'

export { taroTransport, taroStorage, taroFeedback }

/** 构建期常量，由 config/index.ts 的 defineConstants 注入；测试环境未注入时退回同源相对路径 */
function webApiBaseUrl(): string {
  return typeof __API_BASE__ === 'string' ? __API_BASE__ : ''
}

/** 应用入口最早处调用：把 Web 端能力注入共享业务层 @mc/core */
export function setupWebPlatform(): void {
  configureCore({
    transport: taroTransport,
    storage: taroStorage,
    feedback: taroFeedback,
    apiBaseUrl: webApiBaseUrl(),
  })
}
