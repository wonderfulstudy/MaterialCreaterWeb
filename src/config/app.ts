/**
 * 小程序全局配置 - 类型化适配层。
 *
 * 数据全部来自前后端共享的唯一真值 config/app.config.json（tsconfig 别名 "@app-config" 跨仓库引用，
 * 不复制、不生成副本）；本文件只做 JSON 字段 → 旧形状的映射，不再硬编码任何文案。
 * 导出面（AppConfig / AppConfigType）与导出形状保持不变。
 */
import rawAppConfig from '@app-config'
import type { AppConfigType } from './types'

/**
 * 完整的应用配置（所有字段都是必填的）
 * 顶层各段做一层浅拷贝：调用方（如 auth mock 开关）仍可就地赋值，JSON 模块本身不被改写。
 */
const config: AppConfigType = {
  app: {
    name: rawAppConfig.app.name,
    api_base_url: rawAppConfig.api.businessBaseUrl,
    auth_mock: rawAppConfig.app.authMock,
  },

  navigation: { ...rawAppConfig.navigation },

  games: { ...rawAppConfig.lotteryGames },

  common: { ...rawAppConfig.common },
}

/**
 * 导出最终配置
 */
export const AppConfig = config

export default AppConfig

/**
 * 导出类型供引用
 */
export type { AppConfigType }
