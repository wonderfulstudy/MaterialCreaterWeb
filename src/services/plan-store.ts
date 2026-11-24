import Taro from '@tarojs/taro'
import type { PlanLeg, SelectionSummary, SportKey } from '@/components/PlanCalculator'

/** 固定 key：结构升级时换版本号，避免读到旧结构 */
export const PLAN_STORE_KEY = 'mc.plans.v1'

/** 按日期存一天投注内容：日历卡按 date 取，详情页按 passIds + legs 复原 */
export interface StoredPlanDay {
  date: string
  sport: SportKey
  multiple: number
  passIds: string[]
  legs: PlanLeg[]
  summary: SelectionSummary
  rest: boolean
  /** 休息理由（如「国庆休息 4 天」）；只在 rest 为真时有意义 */
  note?: string
  /** 当日判中结果（B5 判定写入，B4 海报消费）；缺省视为待开奖 */
  judged?: 'hit' | 'miss' | 'pending'
  updatedAt: number
}

export interface PlanStoreSnapshot {
  version: 1
  days: Record<string, StoredPlanDay>
}

function emptyStore(): PlanStoreSnapshot {
  return { version: 1, days: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseDay(value: unknown): StoredPlanDay | null {
  if (!isRecord(value)) return null
  const { date, sport, multiple, passIds, legs, summary } = value
  const isValidSport = sport === 'football' || sport === 'basketball'
  const isValidMultiple = typeof multiple === 'number' && Number.isFinite(multiple)
  const isValidPassIds = Array.isArray(passIds) && passIds.every((id) => typeof id === 'string')
  // 只校验到「能安全交给渲染层」的层级，legs / summary 的细节由摄入方保证
  if (typeof date !== 'string' || !date || !isValidSport || !isValidMultiple) return null
  if (!isValidPassIds || !Array.isArray(legs) || !isRecord(summary)) return null
  return {
    date,
    sport,
    multiple,
    passIds: passIds as string[],
    legs: legs as PlanLeg[],
    summary: summary as unknown as SelectionSummary,
    rest: value.rest === true,
    note: typeof value.note === 'string' && value.note ? value.note : undefined,
    judged:
      value.judged === 'hit' || value.judged === 'miss' || value.judged === 'pending' ? value.judged : undefined,
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : 0,
  }
}

function parseSnapshot(value: unknown): PlanStoreSnapshot {
  let raw = value
  if (typeof raw === 'string') {
    if (!raw) return emptyStore()
    try {
      raw = JSON.parse(raw) as unknown
    } catch {
      return emptyStore()
    }
  }
  if (!isRecord(raw) || raw.version !== 1 || !isRecord(raw.days)) return emptyStore()

  const days: Record<string, StoredPlanDay> = {}
  Object.keys(raw.days as Record<string, unknown>).forEach((key) => {
    const day = parseDay((raw.days as Record<string, unknown>)[key])
    // 用 day.date 归一化键，历史脏数据里键和内容可能对不上
    if (day) days[day.date] = day
  })
  return { version: 1, days }
}

export function loadStore(): PlanStoreSnapshot {
  try {
    return parseSnapshot(Taro.getStorageSync(PLAN_STORE_KEY))
  } catch {
    return emptyStore()
  }
}

function persist(snapshot: PlanStoreSnapshot): PlanStoreSnapshot {
  try {
    Taro.setStorageSync(PLAN_STORE_KEY, snapshot)
  } catch {
    // 写失败不抛出：调用方仍拿到内存中的最新快照，日历展示可继续
  }
  return snapshot
}

/** 覆盖同一 date；updatedAt 由入参决定，保证调用方可以按需回填 */
export function saveDay(day: StoredPlanDay): PlanStoreSnapshot {
  const store = loadStore()
  return persist({ version: 1, days: { ...store.days, [day.date]: day } })
}

export function findDay(date: string): StoredPlanDay | null {
  return loadStore().days[date] ?? null
}

/** 日期倒序：YYYY-MM-DD 可直接按字符串比较 */
export function listDays(): StoredPlanDay[] {
  return Object.values(loadStore().days).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** 标记休整日；该日期还没有方案时无事可做，原样返回 */
export function markRest(date: string, rest = true): PlanStoreSnapshot {
  const store = loadStore()
  const day = store.days[date]
  if (!day) return store
  return persist({
    version: 1,
    days: { ...store.days, [date]: { ...day, rest, updatedAt: Date.now() } },
  })
}
