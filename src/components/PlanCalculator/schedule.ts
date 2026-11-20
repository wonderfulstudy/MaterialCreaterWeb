import { useCallback, useEffect, useRef, useState } from 'react'
import Taro from '@tarojs/taro'
import AppConfig from '@/config/app'
import {
  ALL_POOLS,
  POOL_DEFS,
  type PoolCode,
  type PoolRow,
  type ScheduleStatus,
  type SportKey,
  type SportMatch,
  type SportSchedule,
} from './model'

type RawValue = string | number | null | undefined

interface RawOdds {
  [key: string]: RawValue
}

interface RawMatch {
  matchId: number
  matchNum: number
  matchNumStr?: string
  matchWeek?: string
  businessDate?: string
  matchDate?: string
  matchTime?: string
  leagueAbbName?: string
  leagueAllName?: string
  homeTeamAbbName?: string
  homeTeamAllName?: string
  awayTeamAbbName?: string
  awayTeamAllName?: string
  homeRank?: string
  awayRank?: string
  backColor?: string
  bettingSingle?: number | string
  had?: RawOdds
  hhad?: RawOdds
  hafu?: RawOdds
  ttg?: RawOdds
  crs?: RawOdds
  mnl?: RawOdds
  hdc?: RawOdds
  hilo?: RawOdds
  wnm?: RawOdds
}

interface RawMatchGroup {
  businessDate?: string
  subMatchList?: RawMatch[]
}

interface RawCalculatorResponse {
  success?: boolean
  errorMessage?: string
  value?: {
    lastUpdateTime?: string
    matchInfoList?: RawMatchGroup[]
  }
}

const SPORT_URLS: Record<SportKey, string> = {
  football: `${AppConfig.app.football_base_url}?channel=c&poolCode=hhad,had,hafu,ttg,crs`,
  basketball: `${AppConfig.app.basketball_base_url}?channel=c&poolCode=mnl,hdc,hilo,wnm`,
}

export function emptySchedule(sport: SportKey): SportSchedule {
  return { sport, dates: [], matches: [], updateTime: '' }
}

function toOdds(value: RawValue): number | undefined {
  const odds = Number(value)
  return Number.isFinite(odds) && odds > 0 ? odds : undefined
}

function buildRow(raw: RawOdds | undefined, poolCode: PoolCode): PoolRow | undefined {
  if (!raw) {
    return undefined
  }

  const def = POOL_DEFS[poolCode]
  const options = def.options.reduce<{ key: string; label: string; odds: number }[]>((list, option) => {
    const odds = toOdds(raw[option.key])
    if (odds !== undefined) {
      list.push({ key: option.key, label: option.label, odds })
    }
    return list
  }, [])

  if (!options.length) {
    return undefined
  }

  return {
    poolCode,
    title: def.name,
    line: typeof raw.goalLine === 'string' ? raw.goalLine : '',
    options,
  }
}

function poolSource(raw: RawMatch, poolCode: PoolCode): RawOdds | undefined {
  const sources: Record<PoolCode, RawOdds | undefined> = {
    HAD: raw.had,
    HHAD: raw.hhad,
    HAFU: raw.hafu,
    TTG: raw.ttg,
    CRS: raw.crs,
    MNL: raw.mnl,
    HDC: raw.hdc,
    HILO: raw.hilo,
    WNM: raw.wnm,
  }
  return sources[poolCode]
}

/** 比赛编号文案里的星期前缀，如「周二001」→「周二」 */
function weekFromNumStr(matchNumStr: string): string {
  const match = matchNumStr.match(/^周[一二三四五六日天]/)
  return match ? match[0] : ''
}

function normalizeMatch(raw: RawMatch, sport: SportKey, fallbackDate: string): SportMatch | undefined {
  const matchId = Number(raw.matchId)
  if (!Number.isFinite(matchId) || matchId <= 0) {
    return undefined
  }

  const rows = ALL_POOLS[sport]
    .map((poolCode) => buildRow(poolSource(raw, poolCode), poolCode))
    .filter((row): row is PoolRow => Boolean(row))

  if (!rows.length) {
    return undefined
  }

  const matchNum = Number(raw.matchNum)
  const businessDate = raw.businessDate || fallbackDate
  const matchNumStr = raw.matchNumStr?.trim() || (matchNum ? `第${matchNum}场` : '')

  return {
    matchId,
    matchNum: Number.isFinite(matchNum) ? matchNum : 0,
    matchNumStr,
    matchWeek: raw.matchWeek || weekFromNumStr(matchNumStr),
    businessDate,
    matchDate: raw.matchDate || businessDate,
    matchTime: raw.matchTime || '',
    league: raw.leagueAbbName || raw.leagueAllName || '未知联赛',
    homeTeam: raw.homeTeamAbbName || raw.homeTeamAllName || '主队',
    awayTeam: raw.awayTeamAbbName || raw.awayTeamAllName || '客队',
    homeRank: raw.homeRank || '',
    awayRank: raw.awayRank || '',
    backColor: raw.backColor || '',
    bettingSingle: Number(raw.bettingSingle) === 1 ? 1 : 0,
    rows,
  }
}

/** 把计算器接口返回的数据归一化成组件可直接使用的赛程 */
export function parseCalculatorResponse(
  raw: RawCalculatorResponse | null | undefined,
  sport: SportKey,
): SportSchedule {
  const groups = raw?.value?.matchInfoList ?? []
  const matches: SportMatch[] = []
  const dates = new Set<string>()

  groups.forEach((group) => {
    const fallbackDate = group.businessDate || ''
    ;(group.subMatchList ?? []).forEach((item) => {
      const match = normalizeMatch(item, sport, fallbackDate)
      if (!match) {
        return
      }
      matches.push(match)
      if (match.businessDate) {
        dates.add(match.businessDate)
      }
    })
  })

  matches.sort((left, right) => {
    if (left.businessDate !== right.businessDate) {
      return left.businessDate.localeCompare(right.businessDate)
    }
    return left.matchNum - right.matchNum
  })

  return {
    sport,
    dates: Array.from(dates).sort(),
    matches,
    updateTime: raw?.value?.lastUpdateTime ?? '',
  }
}

/** 拉取竞足 / 竞篮赛程与赔率 */
export async function fetchSportSchedule(sport: SportKey): Promise<SportSchedule> {
  const response = await Taro.request<RawCalculatorResponse>({
    url: SPORT_URLS[sport],
    method: 'GET',
    timeout: 15000,
  })

  if (response.statusCode !== 200) {
    throw new Error(`赛程请求失败：HTTP ${response.statusCode}`)
  }

  const data = response.data
  if (!data || data.success === false) {
    throw new Error(data?.errorMessage || '赛程数据异常')
  }

  const schedule = parseCalculatorResponse(data, sport)
  if (!schedule.matches.length) {
    throw new Error('当前没有可用的赛程数据')
  }

  return schedule
}

export interface SportScheduleState {
  status: ScheduleStatus
  error: string
  schedule: SportSchedule
}

export interface UseSportScheduleResult {
  states: Record<SportKey, SportScheduleState>
  load: (sport: SportKey) => Promise<SportSchedule | null>
}

const INITIAL_STATES: Record<SportKey, SportScheduleState> = {
  football: { status: 'loading', error: '', schedule: emptySchedule('football') },
  basketball: { status: 'loading', error: '', schedule: emptySchedule('basketball') },
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object' && 'errMsg' in error) {
    return String((error as { errMsg?: string }).errMsg || '')
  }
  return '赛程加载失败'
}

/** 按项目缓存赛程：切换项目时按需加载，已就绪的项目不重复请求 */
export function useSportSchedule(activeSport: SportKey): UseSportScheduleResult {
  const [states, setStates] = useState<Record<SportKey, SportScheduleState>>(INITIAL_STATES)
  const loadingRef = useRef<Record<SportKey, boolean>>({ football: false, basketball: false })
  const statesRef = useRef(states)
  statesRef.current = states

  const load = useCallback(async (sport: SportKey): Promise<SportSchedule | null> => {
    if (loadingRef.current[sport]) {
      return null
    }
    loadingRef.current[sport] = true
    setStates((prev) => ({ ...prev, [sport]: { ...prev[sport], status: 'loading', error: '' } }))

    try {
      const schedule = await fetchSportSchedule(sport)
      setStates((prev) => ({ ...prev, [sport]: { status: 'ready', error: '', schedule } }))
      return schedule
    } catch (error) {
      setStates((prev) => ({
        ...prev,
        [sport]: { status: 'error', error: getErrorMessage(error), schedule: prev[sport].schedule },
      }))
      return null
    } finally {
      loadingRef.current[sport] = false
    }
  }, [])

  useEffect(() => {
    if (statesRef.current[activeSport].status !== 'ready') {
      void load(activeSport)
    }
  }, [activeSport, load])

  return { states, load }
}
