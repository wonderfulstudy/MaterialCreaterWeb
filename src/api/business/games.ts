/**
 * 经营域彩种清单（REQUIREMENTS.r6 §3.2 / §3.5）。顺序即录入页与月报的列顺序。
 * 大类 key 只能配 granularity=total，竞彩子玩法 key 只能配 granularity=detail（API.r6 §0.1）。
 *
 * 数据来自前后端唯一真值 config/app.config.json 的 sales.games / sales.subgames：
 * 顺序、label、rateBp 全部就地读取，本文件不再各存一份。
 */
import rawAppConfig from '@app-config'

export type GameKey = 'qxc' | 'pl3' | 'pl5' | 'dlt' | 'sfc' | 'sfc9' | 'sfc4' | 'sfc6' | 'jczq' | 'scratch'

export type JcSubgameKey =
  | 'jczq_bf' | 'jczq_zjq' | 'jczq_rqspf' | 'jczq_bqc' | 'jczq_spf'
  | 'jcbk_sf' | 'jcbk_sfc' | 'jcbk_dxf' | 'jcbk_rqsf'
  | 'jczq_mc' | 'jcbk_mc' | 'jczq_hh' | 'jcbk_hh'

export type SalesGameKey = GameKey | JcSubgameKey

export type Granularity = 'total' | 'detail'

export interface GameDefinition {
  key: GameKey
  label: string
  /** 提成率，千分位 basis point（800 = 8%），仅用于前端展示，口径以服务端为准 */
  rateBp: number
}

export interface JcSubgameDefinition {
  key: JcSubgameKey
  label: string
}

/**
 * JSON 侧 key 只是 string，收窄成联合类型只在这两个映射里发生；
 * 联合与 JSON 是否逐项一致由 src/config/config.test.ts 的运行期断言守住。
 */
function toGameDefinition(item: { key: string; label: string; rateBp: number }): GameDefinition {
  return { key: item.key as GameKey, label: item.label, rateBp: item.rateBp }
}

function toJcSubgameDefinition(item: { key: string; label: string }): JcSubgameDefinition {
  return { key: item.key as JcSubgameKey, label: item.label }
}

export const GAME_DEFINITIONS: GameDefinition[] = rawAppConfig.sales.games.map(toGameDefinition)

export const JC_SUBGAME_DEFINITIONS: JcSubgameDefinition[] = rawAppConfig.sales.subgames.map(
  toJcSubgameDefinition,
)

export const GAME_KEYS: GameKey[] = GAME_DEFINITIONS.map((item) => item.key)

export const JC_SUBGAME_KEYS: JcSubgameKey[] = JC_SUBGAME_DEFINITIONS.map((item) => item.key)

const GAME_LABELS: Record<string, string> = {}
GAME_DEFINITIONS.forEach((item) => {
  GAME_LABELS[item.key] = item.label
})

export function isJcSubgameKey(key: string): key is JcSubgameKey {
  return JC_SUBGAME_KEYS.indexOf(key as JcSubgameKey) >= 0
}

export function isGameKey(key: string): key is GameKey {
  return GAME_KEYS.indexOf(key as GameKey) >= 0
}

export function gameLabel(key: string): string {
  const subgame = JC_SUBGAME_DEFINITIONS.find((item) => item.key === key)
  if (subgame) return subgame.label
  return GAME_LABELS[key] || key
}

export function granularityOf(key: string): Granularity {
  return isJcSubgameKey(key) ? 'detail' : 'total'
}
