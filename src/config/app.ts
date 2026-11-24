/**
 * 小程序全局配置 - 统一管理所有文字内容
 */

import type { AppConfigType } from './types'

/**
 * 完整的应用配置（所有字段都是必填的）
 * 在这里修改你的配置
 */
const config: AppConfigType = {
  app: {
    name: "彩店管理助手",
    api_base_url: "",
    auth_mock: true,
  },
  
  navigation: {
    home: "首页",
    material: "素材",
    profile: "我的",
    selector: "计算器"
  },

  games: {
    DLT: {
      displayName: "大乐透",
      gameFlag: "85",
      describe: "一三六开奖"
    },
    QXC: {
      displayName: "七星彩",
      gameFlag: "04",
      describe: "一三六开奖"
    },
    PL3: {
      displayName: "排列三",
      gameFlag: "35",
      describe: "一三六开奖"
    },
    PL5: {
      displayName: "排列五",
      gameFlag: "350133",
      describe: "一三六开奖"
    },
    SSQ: {
      displayName: "双色球",
      gameFlag: "ssq",
      describe: "一三六开奖"
    },
    KL8: {
      displayName: "快乐8",
      gameFlag: "kl8",
      describe: "一三六开奖"
    },
    ThreeD: {
      displayName: "3D",
      gameFlag: "3d",
      describe: "一三六开奖"
    },
    QLC: {
      displayName: "七乐彩",
      gameFlag: "qlc",
      describe: "一三六开奖"
    },
  },
  
  common: {
    loading: '加载中...',
    error: '加载失败',
    retry: '重试',
    noData: '暂无数据',
    confirm: '确定',
    cancel: '取消',
    success: '操作成功',
    failed: '操作失败',
  },
}

/**
 * 校验配置完整性
 */
function validateConfig(cfg: AppConfigType): AppConfigType {
  // if (process.env.NODE_ENV === 'development') {
  //   const missingFields: string[] = []

  //   // 校验所有字段
  //   const requiredFields = [
  //     { path: 'app.name', value: cfg.app?.name },
  //     { path: 'navigation.home', value: cfg.navigation?.home },
  //   ]

  //   for (const { path, value } of requiredFields) {
  //     if (!value) {
  //       missingFields.push(path)
  //     }
  //   }

  //   if (missingFields.length > 0) {
  //     console.error(
  //       `[AppConfig] 缺失必填配置字段: ${missingFields.join(', ')}`,
  //       '\n请在 src/config/app.ts 中补全配置'
  //     )
  //   }
  // }

  return cfg
}

/**
 * 导出最终配置
 */
export const AppConfig = validateConfig(config)

export default AppConfig

/**
 * 导出类型供引用
 */
export type { AppConfigType }
