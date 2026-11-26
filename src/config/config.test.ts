/**
 * 配置契约单测：前端展示的配置必须逐字来自前后端共享的唯一真值 app.config.json（@app-config），
 * 适配层与经营域彩种清单都不许再各存一份硬编码文案。
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import rawAppConfig from '@app-config'
import AppConfig from '@/config/app'
import {
  GAME_DEFINITIONS,
  GAME_KEYS,
  JC_SUBGAME_DEFINITIONS,
  JC_SUBGAME_KEYS,
  gameLabel,
  granularityOf,
  isGameKey,
  isJcSubgameKey,
} from '@/api/business/games'
import { NETWORK_RETRIES, REQUEST_TIMEOUT } from '@/api/client'

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { request: jest.fn() },
}))

/** 经营域大类的提成率口径（冻结的业务定义，JSON 漂移会在这里红） */
const EXPECTED_GAME_RATES: [string, number][] = [
  ['qxc', 900],
  ['pl3', 800],
  ['pl5', 800],
  ['dlt', 900],
  ['sfc', 800],
  ['sfc9', 800],
  ['sfc4', 800],
  ['sfc6', 800],
  ['jczq', 700],
  ['scratch', 800],
]

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf8')
}

/** 断言源码里没有以字符串字面量形式出现的配置文案（注释里提到同名分类不算硬编码） */
function expectLiteralAbsent(source: string, text: string): void {
  expect(source).not.toContain(`'${text}'`)
  expect(source).not.toContain(`"${text}"`)
  expect(source).not.toContain(`\`${text}\``)
}

describe('@app-config 别名', () => {
  it('解析到跨仓库共享的唯一真值文件（JSON，不是本地副本）', () => {
    expect(typeof rawAppConfig).toBe('object')
    expect(rawAppConfig.version).toBe(1)
    expect(Object.keys(rawAppConfig).sort()).toEqual(
      [
        'api',
        'app',
        'auth',
        'common',
        'db',
        'lotteryGames',
        'navigation',
        'ocr',
        'sales',
        'servers',
        'upstream',
        'version',
      ].sort(),
    )
  })
})

describe('经营域清单 sales.games / sales.subgames', () => {
  it('10 个大类 + 13 子玩法', () => {
    expect(rawAppConfig.sales.games).toHaveLength(10)
    expect(rawAppConfig.sales.subgames).toHaveLength(13)
    expect(GAME_DEFINITIONS).toHaveLength(10)
    expect(JC_SUBGAME_DEFINITIONS).toHaveLength(13)
  })

  it('GAME_DEFINITIONS 与 sales.games 逐项一致（顺序 / label / rateBp）', () => {
    expect(GAME_DEFINITIONS).toEqual(
      rawAppConfig.sales.games.map((item) => ({ key: item.key, label: item.label, rateBp: item.rateBp })),
    )
    expect(GAME_KEYS).toEqual(rawAppConfig.sales.games.map((item) => item.key))
  })

  it('JC_SUBGAME_DEFINITIONS 与 sales.subgames 逐项一致（顺序 / label）', () => {
    expect(JC_SUBGAME_DEFINITIONS).toEqual(
      rawAppConfig.sales.subgames.map((item) => ({ key: item.key, label: item.label })),
    )
    expect(JC_SUBGAME_KEYS).toEqual(rawAppConfig.sales.subgames.map((item) => item.key))
  })

  it('大类 rateBp 与经营域既有口径一致', () => {
    expect(GAME_DEFINITIONS.map((item) => [item.key, item.rateBp])).toEqual(EXPECTED_GAME_RATES)
  })

  it('key 谓词与粒度：大类=total，竞彩子玩法=detail', () => {
    GAME_KEYS.forEach((key) => {
      expect(isGameKey(key)).toBe(true)
      expect(isJcSubgameKey(key)).toBe(false)
      expect(granularityOf(key)).toBe('total')
    })
    JC_SUBGAME_KEYS.forEach((key) => {
      expect(isJcSubgameKey(key)).toBe(true)
      expect(isGameKey(key)).toBe(false)
      expect(granularityOf(key)).toBe('detail')
    })
    expect(isGameKey('nope')).toBe(false)
    expect(isJcSubgameKey('nope')).toBe(false)
    expect(gameLabel('nope')).toBe('nope')
  })

  it('gameLabel 取自 JSON 的 label', () => {
    rawAppConfig.sales.games.forEach((item) => {
      expect(gameLabel(item.key)).toBe(item.label)
    })
    rawAppConfig.sales.subgames.forEach((item) => {
      expect(gameLabel(item.key)).toBe(item.label)
    })
  })
})

describe('AppConfig 适配层', () => {
  it('app / navigation / games / common 与真值一致', () => {
    expect(AppConfig.app.name).toBe(rawAppConfig.app.name)
    expect(AppConfig.app.api_base_url).toBe(rawAppConfig.api.businessBaseUrl)
    expect(AppConfig.app.auth_mock).toBe(rawAppConfig.app.authMock)
    expect(AppConfig.navigation).toEqual(rawAppConfig.navigation)
    expect(AppConfig.games).toEqual(rawAppConfig.lotteryGames)
    expect(AppConfig.common).toEqual(rawAppConfig.common)
  })

  it('不再硬编码任何配置文案，只从 @app-config 读取', () => {
    // 适配层实现已迁到三端共享层 @mc/core，Web 侧 src/config/app.ts 只是再导出壳；路径随之指向实现处
    const adapter = readSource('../../../MaterialCreaterApp/packages/core/src/config/app.ts')
    expect(adapter).toContain("from '@app-config'")
    const texts = [
      rawAppConfig.app.name,
      rawAppConfig.navigation.home,
      rawAppConfig.navigation.material,
      rawAppConfig.navigation.profile,
      rawAppConfig.navigation.selector,
      rawAppConfig.common.loading,
      rawAppConfig.common.failed,
      rawAppConfig.lotteryGames.DLT.displayName,
      rawAppConfig.lotteryGames.ThreeD.gameFlag,
    ]
    texts.forEach((text) => {
      expectLiteralAbsent(adapter, text)
    })
  })

  it('彩种清单同样不含硬编码 label', () => {
    // 实现已迁到三端共享层 @mc/core，Web 侧 src/api/business/games.ts 只是再导出壳
    const gamesSource = readSource('../../../MaterialCreaterApp/packages/core/src/api/business/games.ts')
    expect(gamesSource).toContain("from '@app-config'")
    rawAppConfig.sales.games.forEach((item) => {
      expectLiteralAbsent(gamesSource, item.label)
    })
    rawAppConfig.sales.subgames.forEach((item) => {
      expectLiteralAbsent(gamesSource, item.label)
    })
  })
})

describe('请求常量与构建期地址', () => {
  it('REQUEST_TIMEOUT / NETWORK_RETRIES 取自 api 段', () => {
    expect(REQUEST_TIMEOUT).toBe(rawAppConfig.api.timeoutMs)
    expect(NETWORK_RETRIES).toBe(rawAppConfig.api.networkRetries)
  })

  it('config/index.ts 从同一份 JSON 取 API 与 OCR 地址，且不再硬编码 localhost:8081', () => {
    const buildConfig = readSource('../../config/index.ts')
    expect(buildConfig).toContain("'app.config.json'")
    expect(buildConfig).toContain('api.lotteryProxyBaseUrl')
    expect(buildConfig).toContain('ocr.modelUrl')
    expect(buildConfig).not.toContain('http://localhost:8081')
  })
})
