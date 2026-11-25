import { cacheKey, loadWithCache, type CachedLoad } from '@/services/cache/remote-cache'
import { requestProxy, type ProxyResult } from '../proxy'
import type { LotteryHistory } from './lottery.dto'

/**
 * 竞彩赛果 + 传统足彩开奖的取数与映射。
 * 所有页面只消费本文件导出的视图模型，接口字段变化只改这里。
 */

// ============ 通用日期工具 ============

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Date → 'YYYY-MM-DD' */
export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 'YYYY-MM-DD' 前后翻 n 天，返回新的 'YYYY-MM-DD' */
export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (!year || !month || !day) {
    return dateKey
  }
  return toDateKey(new Date(year, month - 1, day + days))
}

/** 从 endKey 起往前取 count 天（含 endKey），按日期倒序 */
export function recentDateKeys(count: number, endKey: string): string[] {
  return Array.from({ length: count }, (_, index) => shiftDateKey(endKey, -index))
}

// ============ 传统足彩 14 场（gameNo=90） ============

/** 胜负彩每期固定 14 场 */
const TRADITIONAL_FIELD_COUNT = 14
/** 结果串只保留 3 / 1 / 0，顺序即场序 */
const TRADITIONAL_RESULT_PATTERN = /^[310]$/
const TRADITIONAL_CACHE_KEY = cacheKey('traditional')

export interface TraditionalDraw {
  /** 期号，如 '26167' */
  issue: string
  /** 开奖日期，如 '2026-11-22' */
  drawDate: string
  /** 14 场按场序的 3（主胜）/ 1（平）/ 0（客胜） */
  results: string[]
}

/** 代理侧固定 gameNo=90（胜负彩 14 场）与分页参数 */
function requestTraditionalHistory(): Promise<ProxyResult<LotteryHistory>> {
  return requestProxy<LotteryHistory>('/api/lottery/traditional', { pageNo: 1 })
}

/**
 * proxy 的 stale=true 表示上游失败、数据来自代理缓存：
 * 按既有「请求失败回落缓存」的语义处理，页面仍只看到 data / updatedAt / fromCache。
 */
async function loadWithCacheFromProxy<T>(
  key: string,
  request: () => Promise<ProxyResult<T>>
): Promise<CachedLoad<T> | null> {
  const state: { stale: { data: T; cachedAt: number } | null } = { stale: null }

  const loaded = await loadWithCache<T>(key, async () => {
    const result = await request()
    if (!result.stale) {
      return result.data
    }
    // 代理缓存不写成新的本地缓存，交给 loadWithCache 的回落分支，保留真实的更新时间
    state.stale = { data: result.data, cachedAt: result.cachedAt }
    throw new Error('代理返回的是缓存数据')
  })

  if (loaded) {
    return loaded
  }

  const stale = state.stale
  return stale ? { data: stale.data, updatedAt: stale.cachedAt, fromCache: true } : null
}

/** 只保留结果完整的 14 场期次，残缺期次不展示 */
export function parseTraditionalDraws(dto: LotteryHistory): TraditionalDraw[] {
  if (!dto || !dto.value || !Array.isArray(dto.value.list)) {
    return []
  }

  return dto.value.list
    .map((item) => ({
      issue: item.lotteryDrawNum,
      drawDate: item.lotteryDrawTime.split(' ')[0],
      results: (item.lotteryDrawResult || '')
        .trim()
        .split(/[\s,]+/)
        .map((field) => field.trim())
        .filter((field) => TRADITIONAL_RESULT_PATTERN.test(field)),
    }))
    .filter((draw) => draw.results.length === TRADITIONAL_FIELD_COUNT)
}

/** 拉取传足历史期次；失败回落缓存，两者都无返回 null */
export async function loadTraditionalDraws(): Promise<CachedLoad<TraditionalDraw[]> | null> {
  return loadWithCacheFromProxy(TRADITIONAL_CACHE_KEY, async () => {
    const result = await requestTraditionalHistory()
    const draws = parseTraditionalDraws(result.data)
    if (draws.length === 0) {
      throw new Error('传统足彩返回空期次')
    }
    return { ...result, data: draws }
  })
}

// ============ 竞彩赛果（足球 V1 / 篮球 V2） ============

/** 代理路由：分页参数与日期透传由代理侧负责 */
const UNIFORM_BASE_PATH = '/api/uniform'
const FOOTBALL_RESULT_PATH = 'football'
const BASKETBALL_RESULT_PATH = 'basketball'

/** 足球赛果单场字段（实测自上游原样透传的 data） */
export interface FootballResultDto {
  matchId?: number | string
  matchNumStr?: string
  matchDate?: string
  leagueNameAbbr?: string
  homeTeam?: string
  awayTeam?: string
  /** 半场比分，如 '0:0' */
  sectionsNo1?: string
  /** 全场比分，如 '2:2' */
  sectionsNo999?: string
  /** 让球，如 '+1' / '-1' */
  goalLine?: string
  /** 不让球胜平负结果：H / D / A */
  winFlag?: string
  /** '2' 表示已结束 */
  matchResultStatus?: string
}

interface BasketballPoolDto {
  poolCode?: string
  goalLine?: string
}

/** 篮球赛果单场字段（V2：结构化盘口） */
export interface BasketballResultDto {
  matchId?: number | string
  matchNumStr?: string
  matchDate?: string
  leagueNameAbbr?: string
  homeTeam?: string
  awayTeam?: string
  /** 全场比分，V2 形如 '125-103' */
  finalScore?: string
  matchResultStatus?: string
  hdc?: BasketballPoolDto
  hilo?: BasketballPoolDto
  matchResultList?: BasketballPoolDto[]
}

interface UniformResultDto<T> {
  success?: boolean
  errorCode?: string
  errorMessage?: string
  value?: {
    matchResult?: T[]
    total?: number
    pages?: number
  }
}

export type PlayTone = 'win' | 'lose' | 'draw' | 'plain'

/** 一条玩法结果：标签（含盘口）与值一一对齐 */
export interface PlayResult {
  label: string
  value: string
  tone: PlayTone
}

/** 一场赛果的展示模型，足球与篮球共用 */
export interface SportMatchResult {
  id: string
  /** 场次号，如 '周一002' */
  matchNo: string
  league: string
  homeTeam: string
  awayTeam: string
  /** 全场比分，统一成 '2:2'；未结束为空串 */
  score: string
  /** 半场比分，统一成 '0:0'；篮球或未结束为空串 */
  halfScore: string
  finished: boolean
  plays: PlayResult[]
}

const DASH = '—'

type Outcome = 'H' | 'D' | 'A'

const OUTCOME_TEXT: Record<Outcome, string> = { H: '胜', D: '平', A: '负' }
const OUTCOME_TONE: Record<Outcome, PlayTone> = { H: 'win', D: 'draw', A: 'lose' }

/** 兼容 '2:2' 与 '125-103' 两种比分写法 */
export function parseScoreText(raw?: string): [number, number] | null {
  if (!raw) {
    return null
  }
  const matched = raw.trim().match(/^(\d+)\s*[-:]\s*(\d+)$/)
  if (!matched) {
    return null
  }
  return [Number(matched[1]), Number(matched[2])]
}

function outcomeOf(home: number, away: number): Outcome {
  if (home > away) {
    return 'H'
  }
  return home === away ? 'D' : 'A'
}

/** '1' → '+1'，'-1' 原样，保证盘口文案符号齐全 */
function formatLine(raw?: string): string {
  const value = (raw || '').trim()
  if (!value) {
    return ''
  }
  return value.startsWith('-') ? value : `+${value}`
}

function goalLineValue(raw?: string): number {
  const parsed = Number.parseFloat((raw || '').trim())
  return Number.isFinite(parsed) ? parsed : 0
}

function requestUniform<T>(
  path: string,
  dateKey: string
): Promise<ProxyResult<UniformResultDto<T>>> {
  return requestProxy<UniformResultDto<T>>(`${UNIFORM_BASE_PATH}/${path}`, { date: dateKey })
}

/** 接口成功但结构不对（如被 WAF 拦）按失败处理，好让缓存兜底 */
function requireMatchList<T>(dto: UniformResultDto<T>): T[] {
  if (!dto || dto.success === false) {
    throw new Error(dto?.errorMessage || '赛果接口返回失败')
  }
  const list = dto.value?.matchResult
  if (!Array.isArray(list)) {
    throw new Error('赛果接口缺少 value.matchResult')
  }
  return list
}

/** 只留所选日期的场次；接口给了起止日期，这里再兜一层 */
function filterByDate<T extends { matchDate?: string }>(list: T[], dateKey: string): T[] {
  const withDate = list.filter((item) => Boolean(item.matchDate))
  if (withDate.length === 0) {
    return list
  }
  return list.filter((item) => !item.matchDate || item.matchDate.slice(0, 10) === dateKey)
}

/** 足球一场：胜平负 / 让球 / 比分 / 总进球 / 半全场 */
function buildFootballPlays(
  dto: FootballResultDto,
  score: [number, number] | null,
  half: [number, number] | null
): PlayResult[] {
  const flag = (dto.winFlag || '').toUpperCase()
  const outcome: Outcome | null =
    flag === 'H' || flag === 'D' || flag === 'A' ? flag : score ? outcomeOf(score[0], score[1]) : null
  const line = formatLine(dto.goalLine)
  const handicap = score ? outcomeOf(score[0] + goalLineValue(dto.goalLine), score[1]) : null
  const total = score ? score[0] + score[1] : null
  const halfOutcome = half ? outcomeOf(half[0], half[1]) : null

  return [
    {
      label: '胜平负',
      value: outcome ? OUTCOME_TEXT[outcome] : DASH,
      tone: outcome ? OUTCOME_TONE[outcome] : 'plain',
    },
    {
      label: line ? `让球(${line})` : '让球',
      value: handicap ? `让${OUTCOME_TEXT[handicap]}` : DASH,
      tone: handicap ? OUTCOME_TONE[handicap] : 'plain',
    },
    { label: '比分', value: score ? `${score[0]}:${score[1]}` : DASH, tone: 'plain' },
    { label: '总进球', value: total === null ? DASH : `${total}球`, tone: 'plain' },
    {
      label: '半全场',
      value: halfOutcome && outcome ? `${OUTCOME_TEXT[halfOutcome]}${OUTCOME_TEXT[outcome]}` : DASH,
      tone: 'plain',
    },
  ]
}

export function mapFootballResults(list: FootballResultDto[]): SportMatchResult[] {
  return list.map((dto, index) => {
    const score = parseScoreText(dto.sectionsNo999)
    const half = parseScoreText(dto.sectionsNo1)
    // 有全场比分即视为已结束；matchResultStatus='2' 是接口的已结束标记
    const finished = Boolean(score) || dto.matchResultStatus === '2'

    return {
      id: String(dto.matchId ?? `football-${index}`),
      matchNo: dto.matchNumStr || '',
      league: dto.leagueNameAbbr || '',
      homeTeam: dto.homeTeam || '',
      awayTeam: dto.awayTeam || '',
      score: score ? `${score[0]}:${score[1]}` : '',
      halfScore: half ? `${half[0]}:${half[1]}` : '',
      finished,
      plays: buildFootballPlays(dto, score, half),
    }
  })
}

/** 篮球的盘口可能平铺在单场字段上，也可能在 matchResultList 里 */
function poolGoalLine(dto: BasketballResultDto, poolCode: 'hdc' | 'hilo'): string {
  const direct = dto[poolCode]?.goalLine
  if (direct) {
    return direct
  }
  const nested = dto.matchResultList?.find((pool) => pool.poolCode === poolCode)
  return nested?.goalLine || ''
}

/** 篮球一场：胜负 / 让分 / 大小分 */
function buildBasketballPlays(dto: BasketballResultDto, score: [number, number] | null): PlayResult[] {
  const hdcLine = poolGoalLine(dto, 'hdc')
  const hiloLine = poolGoalLine(dto, 'hilo')
  const homeWin = score ? outcomeOf(score[0], score[1]) === 'H' : null
  const handicapWin = score ? outcomeOf(score[0] + goalLineValue(hdcLine), score[1]) === 'H' : null
  const total = score ? score[0] + score[1] : null
  const hiloValue = goalLineValue(hiloLine)

  return [
    {
      label: '胜负',
      value: homeWin === null ? DASH : homeWin ? '主胜' : '客胜',
      tone: homeWin === null ? 'plain' : homeWin ? 'win' : 'lose',
    },
    {
      label: hdcLine ? `让分(${formatLine(hdcLine)})` : '让分',
      value: handicapWin === null ? DASH : handicapWin ? '主胜' : '客胜',
      tone: handicapWin === null ? 'plain' : handicapWin ? 'win' : 'lose',
    },
    {
      label: hiloLine ? `大小分(${hiloLine})` : '大小分',
      value: total === null || !hiloLine ? DASH : `${total > hiloValue ? '大' : '小'} ${total}`,
      tone: total === null || !hiloLine ? 'plain' : 'draw',
    },
  ]
}

export function mapBasketballResults(list: BasketballResultDto[]): SportMatchResult[] {
  return list.map((dto, index) => {
    const score = parseScoreText(dto.finalScore)

    return {
      id: String(dto.matchId ?? `basketball-${index}`),
      matchNo: dto.matchNumStr || '',
      league: dto.leagueNameAbbr || '',
      homeTeam: dto.homeTeam || '',
      awayTeam: dto.awayTeam || '',
      score: score ? `${score[0]}:${score[1]}` : '',
      halfScore: '',
      finished: Boolean(score),
      plays: buildBasketballPlays(dto, score),
    }
  })
}

export async function loadFootballResults(
  dateKey: string
): Promise<CachedLoad<SportMatchResult[]> | null> {
  return loadWithCacheFromProxy(cacheKey('sport', 'football', dateKey), async () => {
    const result = await requestUniform<FootballResultDto>(FOOTBALL_RESULT_PATH, dateKey)
    return {
      ...result,
      data: mapFootballResults(filterByDate(requireMatchList(result.data), dateKey)),
    }
  })
}

export async function loadBasketballResults(
  dateKey: string
): Promise<CachedLoad<SportMatchResult[]> | null> {
  return loadWithCacheFromProxy(cacheKey('sport', 'basketball', dateKey), async () => {
    const result = await requestUniform<BasketballResultDto>(BASKETBALL_RESULT_PATH, dateKey)
    return {
      ...result,
      data: mapBasketballResults(filterByDate(requireMatchList(result.data), dateKey)),
    }
  })
}
