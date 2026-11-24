import { POOL_DEFS, type SportKey } from '@/components/PlanCalculator/model'

/**
 * 方案判中：把已存记录（PlanLeg[]）与当日官方赛果比对，得出每腿中/未与整单状态。
 * 纯函数：不读写 storage、不发请求、不改入参。
 *
 * 赛果来源的真实字段（实测自 src/api/lottery/results.ts，计算器接口只有赔率没有赛果）：
 * - 足球：winFlag（H/D/A）、sectionsNo1 / sectionsNo999（如 '1:0' / '2:1'）、goalLine（让球）
 * - 篮球：finalScore（如 '125-103'），hdc / hilo / matchResultList / poolList 里的 goalLine（让分与大小分盘口）
 * - 传足：14 场 3/1/0（AC-5 / AC-35），payload 形状自证，不受 sport 影响
 * 所有玩法结果都折算成 PlanLeg.optionKey 的取值，judgeLegs 只做集合比对。
 */

export type LegResult = 'hit' | 'miss' | 'pending'
export type PlanResult = LegResult

/** 单场单玩法：归一化盘口 → 命中选项 key；无盘口玩法的键为 '' */
export type PoolOutcome = Record<string, string[]>

export interface MatchResultEntry {
  /** 'YYYY-MM-DD'；未知为空串（空串不参与日期校验） */
  date: string
  /** 大写 poolCode → 盘口表 */
  pools: Record<string, PoolOutcome>
  /** 传足场序（1 起），非传足为 undefined */
  order?: number
}

/** matchId → 一场赛果 */
export type MatchResults = Record<string, MatchResultEntry>

/** 判定要用到的腿字段，PlanLeg 结构上满足 */
export interface PlanLegLike {
  matchId: number
  matchDate?: string
  poolCode: string
  goalLine?: string
  optionKey: string
}

export interface JudgedLeg<T extends PlanLegLike = PlanLegLike> {
  leg: T
  result: LegResult
}

/** 盘口会改变命中选项的玩法；其余玩法的盘口键固定为 '' */
const LINE_POOLS: ReadonlySet<string> = new Set(['HHAD', 'HDC', 'HILO'])

/** 胜负彩每期固定 14 场（与 src/api/lottery/results.ts 一致） */
const TRADITIONAL_FIELD_COUNT = 14
const TRADITIONAL_CODE_PATTERN = /^[310]$/

type RawRecord = Record<string, unknown>

function asRecord(value: unknown): RawRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as RawRecord) : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' && Number.isFinite(value) ? String(value) : ''
}

/** 'YYYY-MM-DD'（接口可能带时分） */
function dateKey(value: unknown): string {
  return text(value).slice(0, 10)
}

/** 兼容 '2:2' 与 '125-103' */
function parseScore(value: unknown): [number, number] | null {
  const matched = text(value).match(/^(\d+)\s*[-:]\s*(\d+)$/)
  return matched ? [Number(matched[1]), Number(matched[2])] : null
}

function outcomeOf(home: number, away: number): 'h' | 'd' | 'a' {
  if (home > away) return 'h'
  if (home === away) return 'd'
  return 'a'
}

/** 盘口归一化：'+1' / '1' / ' 1.0 ' → '1'，'-1' → '-1'；无法解析时原样 */
function normalizeLine(value: unknown): string {
  const raw = text(value)
  if (!raw) return ''
  const parsed = Number.parseFloat(raw)
  return Number.isFinite(parsed) ? String(parsed) : raw
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** 胜平负：优先用接口给的 winFlag，缺失时按全场比分推 */
function hadKey(match: RawRecord, score: [number, number] | null): string | null {
  const flag = text(match.winFlag).toUpperCase()
  if (flag === 'H' || flag === 'D' || flag === 'A') return flag.toLowerCase()
  return score ? outcomeOf(score[0], score[1]) : null
}

/** 比分选项 key：命中枚举表就用精确 key，否则归到「胜其他 / 平其他 / 负其他」 */
function crsKey(home: number, away: number): string {
  const exact = `s${pad2(home)}s${pad2(away)}`
  if (POOL_DEFS.CRS.options.some((option) => option.key === exact)) return exact
  if (home > away) return 's1sh'
  return home === away ? 's1sd' : 's1sa'
}

/** 总进球选项 key：7 球及以上统一为 s7 */
function ttgKey(total: number): string {
  return `s${total >= 7 ? 7 : total}`
}

/** 胜分差选项 key：主胜 w1-w6 / 客胜 l1-l6（每档 5 分） */
function wnmKey(diff: number): string | null {
  if (!diff) return null
  const size = Math.abs(diff)
  const bucket = size <= 5 ? 1 : size <= 10 ? 2 : size <= 15 ? 3 : size <= 20 ? 4 : size <= 25 ? 5 : 6
  return `${diff > 0 ? 'w' : 'l'}${bucket}`
}

/** 盘口值：先看平铺字段（hdc / hilo 等），再看 matchResultList / poolList 里的同名玩法 */
function poolLine(match: RawRecord, poolCode: string): string {
  const direct = asRecord(match[poolCode.toLowerCase()])
  const directLine = direct ? text(direct.goalLine) : ''
  if (directLine) return directLine

  const lists = [match.matchResultList, match.poolList]
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    const found = list
      .map((item) => asRecord(item))
      .find((item) => item && text(item.poolCode).toUpperCase() === poolCode.toUpperCase())
    const line = found ? text(found.goalLine) : ''
    if (line) return line
  }
  return ''
}

/** 足球：胜平负 / 让球胜平负 / 比分 / 总进球 / 半全场 */
function footballPools(match: RawRecord): Record<string, PoolOutcome> {
  const pools: Record<string, PoolOutcome> = {}
  const full = parseScore(match.sectionsNo999)
  const half = parseScore(match.sectionsNo1)

  const had = hadKey(match, full)
  if (had) pools.HAD = { '': [had] }

  if (full) {
    const line = normalizeLine(text(match.goalLine) || poolLine(match, 'HHAD'))
    if (line) pools.HHAD = { [line]: [outcomeOf(full[0] + Number(line), full[1])] }
    pools.CRS = { '': [crsKey(full[0], full[1])] }
    pools.TTG = { '': [ttgKey(full[0] + full[1])] }
    if (half) pools.HAFU = { '': [`${outcomeOf(half[0], half[1])}${outcomeOf(full[0], full[1])}`] }
  }

  return pools
}

/** 篮球：胜负 / 让分胜负 / 大小分 / 胜分差 */
function basketballPools(match: RawRecord): Record<string, PoolOutcome> {
  // 只认 finalScore：与 results.ts 的 mapBasketballResults 一致，避免把足球比分当篮球赛果
  const score = parseScore(match.finalScore)
  if (!score) return {}

  const pools: Record<string, PoolOutcome> = {}
  const diff = score[0] - score[1]
  if (diff) {
    pools.MNL = { '': [diff > 0 ? 'h' : 'a'] }
    const wnm = wnmKey(diff)
    if (wnm) pools.WNM = { '': [wnm] }
  }

  const hdcLine = normalizeLine(poolLine(match, 'HDC'))
  const hdcHome = score[0] + Number(hdcLine)
  if (hdcLine && hdcHome !== score[1]) pools.HDC = { [hdcLine]: [hdcHome > score[1] ? 'h' : 'a'] }

  const hiloLine = normalizeLine(poolLine(match, 'HILO'))
  const total = score[0] + score[1]
  if (hiloLine && total !== Number(hiloLine)) pools.HILO = { [hiloLine]: [total > Number(hiloLine) ? 'h' : 'l'] }

  return pools
}

/** 把 payload 里可能包着比赛数组的层级都摊平 */
function collectMatches(payload: unknown): RawRecord[] {
  const found: RawRecord[] = []

  const pushList = (value: unknown) => {
    if (!Array.isArray(value)) return
    value.forEach((item) => {
      const record = asRecord(item)
      if (record) found.push(record)
    })
  }

  if (Array.isArray(payload)) {
    pushList(payload)
  } else {
    const root = asRecord(payload)
    if (!root) return []
    pushList(root.matchResult)
    pushList(root.list)
    const value = asRecord(root.value)
    if (value) {
      pushList(value.matchResult)
      pushList(value.list)
      // 计算器接口：按开售日分组，subMatchList 才是单场
      if (Array.isArray(value.matchInfoList)) {
        value.matchInfoList.forEach((group) => {
          const record = asRecord(group)
          if (record) pushList(record.subMatchList)
        })
      }
    }
    if (root.matchId !== undefined) found.push(root)
  }

  // 只留能当赛果用的场次：必须有 matchId
  return found.filter((record) => text(record.matchId) !== '')
}

interface TraditionalDraw {
  results: string[]
  date: string
}

function readTraditionalDraw(value: unknown): TraditionalDraw | null {
  const record = asRecord(value)
  if (!record) return null

  const raw = record.lotteryDrawResult ?? record.results ?? record.result
  const fields = Array.isArray(raw)
    ? raw.map((item) => text(item))
    : text(raw).split(/[\s,]+/)
  const results = fields.filter((field) => TRADITIONAL_CODE_PATTERN.test(field))
  if (results.length !== TRADITIONAL_FIELD_COUNT) return null

  return { results, date: dateKey(record.drawDate ?? record.lotteryDrawTime ?? record.date) }
}

/**
 * 传足：14 场 3/1/0，按场序 1..14 对齐 matchId，选项 key 原样保留 3/1/0（AC-35）。
 * 多期 payload 只取第一期（调用方按日只取当期）。
 */
function extractTraditional(payload: unknown): MatchResults | null {
  const draws: TraditionalDraw[] = []

  if (typeof payload === 'string') {
    const single = readTraditionalDraw({ results: payload })
    if (single) draws.push(single)
  } else if (Array.isArray(payload)) {
    payload.forEach((item) => {
      const draw = readTraditionalDraw(item)
      if (draw) draws.push(draw)
    })
  } else {
    const root = asRecord(payload)
    if (root) {
      const single = readTraditionalDraw(root)
      if (single) draws.push(single)
      const value = asRecord(root.value)
      const list = [value?.list, root.list].find((item) => Array.isArray(item)) as unknown[] | undefined
      ;(list ?? []).forEach((item) => {
        const draw = readTraditionalDraw(item)
        if (draw) draws.push(draw)
      })
    }
  }

  const draw = draws[0]
  if (!draw) return null

  const results: MatchResults = {}
  draw.results.forEach((code, index) => {
    results[String(index + 1)] = { date: draw.date, pools: { HAD: { '': [code] } }, order: index + 1 }
  })
  return results
}

/** 同一 matchId 多次出现时深合并盘口表，日期取先有的非空值 */
function mergeEntry(previous: MatchResultEntry, next: MatchResultEntry): MatchResultEntry {
  const pools: Record<string, PoolOutcome> = { ...previous.pools }
  Object.keys(next.pools).forEach((poolCode) => {
    pools[poolCode] = { ...pools[poolCode], ...next.pools[poolCode] }
  })
  return {
    date: next.date || previous.date,
    pools,
    order: next.order ?? previous.order,
  }
}

/**
 * 赛果 payload → 以 matchId 为键的「每场每玩法」结果表。
 * 赛果缺失（未开奖、字段为空）的比赛不会出现在表里，交由 judgeLegs 回落 pending。
 */
export function extractMatchResults(payload: unknown, sport: SportKey): MatchResults {
  const traditional = extractTraditional(payload)
  if (traditional) return traditional

  const results: MatchResults = {}
  collectMatches(payload).forEach((match) => {
    const matchId = text(match.matchId)
    const pools = sport === 'basketball' ? basketballPools(match) : footballPools(match)
    const entry: MatchResultEntry = { date: dateKey(match.matchDate ?? match.businessDate), pools }
    results[matchId] = results[matchId] ? mergeEntry(results[matchId], entry) : entry
  })
  return results
}

/** 日期只校验到天；任一侧缺失即视为不能否决（避免把未开奖当未中） */
function dateCompatible(resultDate: string, legDate: string): boolean {
  if (!resultDate || !legDate) return true
  return dateKey(resultDate) === dateKey(legDate)
}

function judgeLeg(leg: PlanLegLike, results: MatchResults): LegResult {
  const entry = results ? results[text(leg.matchId)] : undefined
  if (!entry) return 'pending'
  if (!dateCompatible(entry.date, text(leg.matchDate))) return 'pending'

  const poolCode = text(leg.poolCode).toUpperCase()
  const pool = entry.pools[poolCode]
  // 未知玩法：没有判定依据，不抛错也不当未中
  if (!pool) return 'pending'

  const line = LINE_POOLS.has(poolCode) ? normalizeLine(leg.goalLine) : ''
  const keys = pool[line]
  if (!keys || keys.length === 0) return 'pending'

  return keys.includes(text(leg.optionKey)) ? 'hit' : 'miss'
}

/** 每腿判中：返回与入参等长的新数组，leg 原样引用，不做任何就地修改 */
export function judgeLegs<T extends PlanLegLike>(legs: readonly T[], results: MatchResults): JudgedLeg<T>[] {
  if (!Array.isArray(legs) || legs.length === 0) return []
  return legs.map((leg) => ({ leg, result: judgeLeg(leg, results) }))
}

/**
 * 整单状态：先按场聚合再合成整单。
 * 复式口径：同一 matchId 的多条腿，任一条命中即算该场命中（AC-37 的复式语义）。
 * 整单：任一场 miss → miss；全部场 hit → hit；否则 pending。
 */
export function judgePlan(judgedLegs: readonly JudgedLeg[]): PlanResult {
  if (!Array.isArray(judgedLegs) || judgedLegs.length === 0) return 'pending'

  const perMatch = new Map<string, LegResult[]>()
  judgedLegs.forEach((item, index) => {
    const key = text(item.leg?.matchId) || `leg-${index}`
    const list = perMatch.get(key) ?? []
    list.push(item.result)
    perMatch.set(key, list)
  })

  const matchResults: LegResult[] = []
  perMatch.forEach((list) => {
    if (list.includes('hit')) matchResults.push('hit')
    else if (list.includes('pending')) matchResults.push('pending')
    else matchResults.push('miss')
  })

  if (matchResults.includes('miss')) return 'miss'
  return matchResults.every((result) => result === 'hit') ? 'hit' : 'pending'
}
