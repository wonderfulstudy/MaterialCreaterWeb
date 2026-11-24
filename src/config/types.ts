/**
 * 应用配置类型定义
 */

export interface GameType {
  displayName: string
  gameFlag: string
  describe: string
}

export interface AppConfigType {
  app : {
    name: string
    api_base_url: string
    auth_mock: boolean
  }
  
  navigation: {
    home: string
    material: string
    profile: string
    selector: string
  }

  games: {
    DLT: GameType,
    QXC: GameType,
    PL3: GameType,
    PL5: GameType,
    SSQ: GameType,
    KL8: GameType,
    ThreeD: GameType,
    QLC: GameType
  }

  common: {
    loading: string
    error: string
    retry: string
    noData: string
    confirm: string
    cancel: string
    success: string
    failed: string
  }
}
