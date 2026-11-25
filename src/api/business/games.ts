/**
 * 经营域彩种清单（REQUIREMENTS.r6 §3.2 / §3.5）。顺序即录入页与月报的列顺序。
 * 大类 key 只能配 granularity=total，竞彩子玩法 key 只能配 granularity=detail（API.r6 §0.1）。
 */
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

export const GAME_DEFINITIONS: GameDefinition[] = [
  { key: 'qxc', label: '七星彩', rateBp: 900 },
  { key: 'pl3', label: '排列3', rateBp: 800 },
  { key: 'pl5', label: '排列5', rateBp: 800 },
  { key: 'dlt', label: '超级大乐透', rateBp: 900 },
  { key: 'sfc', label: '足球胜平负', rateBp: 800 },
  { key: 'sfc9', label: '任选9场', rateBp: 800 },
  { key: 'sfc4', label: '4场进球', rateBp: 800 },
  { key: 'sfc6', label: '6场半全场', rateBp: 800 },
  { key: 'jczq', label: '竞彩', rateBp: 700 },
  { key: 'scratch', label: '刮刮乐', rateBp: 800 },
]

export interface JcSubgameDefinition {
  key: JcSubgameKey
  label: string
}

export const JC_SUBGAME_DEFINITIONS: JcSubgameDefinition[] = [
  { key: 'jczq_bf', label: '竞彩足球比分' },
  { key: 'jczq_zjq', label: '竞彩足球总进球数' },
  { key: 'jczq_rqspf', label: '竞彩足球让球胜平负' },
  { key: 'jczq_bqc', label: '竞彩足球半全场胜平负' },
  { key: 'jczq_spf', label: '竞彩足球胜平负' },
  { key: 'jcbk_sf', label: '竞彩篮球胜负' },
  { key: 'jcbk_sfc', label: '竞彩篮球胜分差' },
  { key: 'jcbk_dxf', label: '竞彩篮球大小分' },
  { key: 'jcbk_rqsf', label: '竞彩篮球让分胜负' },
  { key: 'jczq_mc', label: '足球竞彩名次' },
  { key: 'jcbk_mc', label: '篮球竞彩名次' },
  { key: 'jczq_hh', label: '竞彩足球混合过关' },
  { key: 'jcbk_hh', label: '竞彩篮球混合过关' },
]

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
