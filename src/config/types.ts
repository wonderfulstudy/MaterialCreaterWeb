/**
 * 应用配置类型定义。
 *
 * 形状由 @app-config（Server 仓库的 config/app.config.json，前后端唯一真值）推导，
 * 本层只做字段改名：app.name → name、app.authMock → auth_mock、api.businessBaseUrl → api_base_url、
 * lotteryGames → games。JSON 改字段名时这里先编译报错，而 AppConfig 的导出面保持不变。
 */
import type rawAppConfig from '@app-config'

/** 唯一配置真值的原始形状（JSON 模块的类型） */
export type RawAppConfig = typeof rawAppConfig

export interface GameType {
  displayName: string
  gameFlag: string
  describe: string
}

export interface AppConfigType {
  app : {
    name: RawAppConfig['app']['name']
    api_base_url: RawAppConfig['api']['businessBaseUrl']
    auth_mock: RawAppConfig['app']['authMock']
  }
  
  navigation: RawAppConfig['navigation']

  games: RawAppConfig['lotteryGames']

  common: RawAppConfig['common']
}
