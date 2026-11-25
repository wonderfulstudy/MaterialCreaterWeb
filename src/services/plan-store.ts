import Taro from '@tarojs/taro'
import type { PlanLeg, SelectionSummary, SportKey } from '@/components/PlanCalculator'

/** 固定 key：结构升级时在快照内部换版本号并提供迁移，避免读到旧结构 */
export const PLAN_STORE_KEY = 'mc.plans.v1'

/** 一个手动方案系列（AC-11：多个方案并存，各自积累每日记录） */
export interface StoredPlan {
  id: string
  name: string
  sport: SportKey
  /** 最近一次的投注内容，由选择器保存时写入 */
  legs: PlanLeg[]
  passIds: string[]
  multiple: number
  summary?: SelectionSummary
  createdAt: number
  updatedAt: number
}

/** 某方案某一天的投注内容：日历卡按 date 取，详情页按 passIds + legs 复原 */
export interface StoredPlanDay {
  planId: string
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
  version: 2
  plans: Record<string, StoredPlan>
  /** planId -> date -> day */
  days: Record<string, Record<string, StoredPlanDay>>
}

export interface PlanStats {
  total: number
  hit: number
  miss: number
  pending: number
  /** 从最新一天往前数的连续命中数；休息日跳过不打断，miss / pending 打断 */
  streak: number
  last: StoredPlanDay | null
}

function emptyStore(): PlanStoreSnapshot {
  return { version: 2, plans: {}, days: {} }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSport(value: unknown): value is SportKey {
  return value === 'football' || value === 'basketball'
}

function parseDay(planId: string, value: unknown): StoredPlanDay | null {
  if (!isRecord(value)) return null
  const { date, sport, multiple, passIds, legs, summary } = value
  const isValidMultiple = typeof multiple === 'number' && Number.isFinite(multiple)
  const isValidPassIds = Array.isArray(passIds) && passIds.every((id) => typeof id === 'string')
  // 只校验到「能安全交给渲染层」的层级，legs / summary 的细节由摄入方保证
  if (typeof date !== 'string' || !date || !isSport(sport) || !isValidMultiple) return null
  if (!isValidPassIds || !Array.isArray(legs) || !isRecord(summary)) return null
  return {
    planId,
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

function parsePlan(value: unknown): StoredPlan | null {
  if (!isRecord(value)) return null
  const { id, name, sport, legs, passIds, multiple } = value
  if (typeof id !== 'string' || !id || typeof name !== 'string' || !name || !isSport(sport)) return null
  if (!Array.isArray(legs) || !Array.isArray(passIds) || typeof multiple !== 'number') return null
  const createdAt = typeof value.createdAt === 'number' && Number.isFinite(value.createdAt) ? value.createdAt : 0
  return {
    id,
    name,
    sport,
    legs: legs as PlanLeg[],
    passIds: passIds.filter((item): item is string => typeof item === 'string'),
    multiple: Number.isFinite(multiple) ? multiple : 1,
    summary: isRecord(value.summary) ? (value.summary as unknown as SelectionSummary) : undefined,
    createdAt,
    updatedAt: typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) ? value.updatedAt : createdAt,
  }
}

/** v1 只有一张全局日历：迁移成一个「方案 1」，历史记录全部归到它名下 */
function migrateV1(raw: Record<string, unknown>): PlanStoreSnapshot {
  const legacyDays = isRecord(raw.days) ? raw.days : {}
  const days: Record<string, StoredPlanDay> = {}
  Object.keys(legacyDays).forEach((key) => {
    const day = parseDay(LEGACY_PLAN_ID, legacyDays[key])
    if (day) days[day.date] = day
  })
  const latest = Object.values(days).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  if (!latest) return emptyStore()
  const plan: StoredPlan = {
    id: LEGACY_PLAN_ID,
    name: '方案 1',
    sport: latest.sport,
    legs: latest.legs,
    passIds: latest.passIds,
    multiple: latest.multiple,
    summary: latest.summary,
    createdAt: latest.updatedAt,
    updatedAt: latest.updatedAt,
  }
  return { version: 2, plans: { [plan.id]: plan }, days: { [plan.id]: days } }
}

/** v1 迁移出来的方案 id：固定字符串，保证多次读取结果一致 */
export const LEGACY_PLAN_ID = 'plan-1'

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
  if (!isRecord(raw)) return emptyStore()
  if (raw.version === 1) return migrateV1(raw)
  if (raw.version !== 2) return emptyStore()

  const plans: Record<string, StoredPlan> = {}
  if (isRecord(raw.plans)) {
    Object.keys(raw.plans).forEach((key) => {
      const plan = parsePlan((raw.plans as Record<string, unknown>)[key])
      if (plan) plans[plan.id] = plan
    })
  }
  const days: Record<string, Record<string, StoredPlanDay>> = {}
  if (isRecord(raw.days)) {
    Object.keys(raw.days).forEach((planId) => {
      const bucket = (raw.days as Record<string, unknown>)[planId]
      if (!isRecord(bucket)) return
      const mapped: Record<string, StoredPlanDay> = {}
      Object.keys(bucket).forEach((key) => {
        // 用 day.date 归一化键，历史脏数据里键和内容可能对不上
        const day = parseDay(planId, bucket[key])
        if (day) mapped[day.date] = day
      })
      days[planId] = mapped
    })
  }
  // 有记录却没有方案头（例如手工写过 storage）：补一个占位方案，别让记录成为孤儿
  Object.keys(days).forEach((planId) => {
    if (plans[planId]) return
    const values = Object.values(days[planId])
    if (!values.length) return
    const latest = values.sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    plans[planId] = {
      id: planId,
      name: '方案',
      sport: latest.sport,
      legs: latest.legs,
      passIds: latest.passIds,
      multiple: latest.multiple,
      summary: latest.summary,
      createdAt: latest.updatedAt,
      updatedAt: latest.updatedAt,
    }
  })
  return { version: 2, plans, days }
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

/** 方案列表：按创建时间正序，先建的在前面 */
export function listPlans(): StoredPlan[] {
  return Object.values(loadStore().plans).sort((a, b) => a.createdAt - b.createdAt)
}

export function findPlan(id: string): StoredPlan | null {
  return loadStore().plans[id] ?? null
}

/** 新增或覆盖方案头（不改名下的每日记录） */
export function savePlan(plan: StoredPlan): PlanStoreSnapshot {
  const store = loadStore()
  return persist({ ...store, plans: { ...store.plans, [plan.id]: plan } })
}

/** 删除方案连同它的全部每日记录（AC-23 删除模式） */
export function removePlans(ids: string[]): PlanStoreSnapshot {
  const store = loadStore()
  const plans = { ...store.plans }
  const days = { ...store.days }
  ids.forEach((id) => {
    delete plans[id]
    delete days[id]
  })
  return persist({ version: 2, plans, days })
}

/** 覆盖同一 (planId, date)；updatedAt 由入参决定，保证调用方可以按需回填 */
export function saveDay(day: StoredPlanDay): PlanStoreSnapshot {
  const store = loadStore()
  const bucket = { ...(store.days[day.planId] ?? {}), [day.date]: day }
  return persist({ ...store, days: { ...store.days, [day.planId]: bucket } })
}

export function findDay(date: string, planId = primaryPlanId() ?? ''): StoredPlanDay | null {
  if (!planId) return null
  return loadStore().days[planId]?.[date] ?? null
}

/** 日期倒序：YYYY-MM-DD 可直接按字符串比较；不传 planId 时取全部方案的记录 */
export function listDays(planId?: string): StoredPlanDay[] {
  const store = loadStore()
  const buckets = planId ? [store.days[planId] ?? {}] : Object.values(store.days)
  const all = buckets.flatMap((bucket) => Object.values(bucket))
  return all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/** 日历用：date -> day（不传 planId 时合并全部方案，同日冲突取较新的一条） */
export function listDaysMap(planId?: string): Record<string, StoredPlanDay> {
  const map: Record<string, StoredPlanDay> = {}
  listDays(planId)
    .slice()
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .forEach((day) => {
      map[day.date] = day
    })
  return map
}

/** 标记休整日；该日期还没有记录时无事可做，原样返回 */
export function markRest(date: string, rest = true, planId = primaryPlanId() ?? ''): PlanStoreSnapshot {
  const store = loadStore()
  if (!planId) return store
  const day = store.days[planId]?.[date]
  if (!day) return store
  return saveDay({ ...day, rest, updatedAt: Date.now() })
}

/** 第一个（最早创建的）方案：v1 单方案语义的默认归属 */
export function primaryPlanId(): string | null {
  const plans = listPlans()
  return plans.length ? plans[0].id : null
}

/** 系列战绩：总期数 / 命中 / 未中 / 待开奖 / 连中，供方案卡与海报共用 */
export function planStats(planId: string): PlanStats {
  const days = listDays(planId).slice().reverse() // 旧 → 新
  const stats: PlanStats = { total: 0, hit: 0, miss: 0, pending: 0, streak: 0, last: days.length ? days[days.length - 1] : null }
  days.forEach((day) => {
    if (day.rest) return
    stats.total += 1
    const judged = day.judged ?? 'pending'
    if (judged === 'hit') stats.hit += 1
    else if (judged === 'miss') stats.miss += 1
    else stats.pending += 1
  })
  for (let i = days.length - 1; i >= 0; i -= 1) {
    const day = days[i]
    if (day.rest) continue
    if ((day.judged ?? 'pending') !== 'hit') break
    stats.streak += 1
  }
  return stats
}
