import type { PlanLeg, SelectionSummary, SportKey } from '@/components/PlanCalculator'
import { summarizeCardLegs } from '@/components/PlanCardView'
import type { PlanHistoryEntry, PlanLegResult, SharePlan } from '@/components/SharePoster'

/** 一张推荐单卡片 */
export interface RecommendPlan {
  id: string
  sport: SportKey
  name: string
  imagePath: string
  recognizedText: string
  note: string
  /** 方案内含的比赛选择，由 PlanCalculator 生成 */
  legs: PlanLeg[]
  /** 注数 / 金额 / 奖金试算结果 */
  summary?: SelectionSummary
  /** 当前方案各场比赛的中奖情况（未接入赛果前均为待开奖） */
  results?: PlanLegResult[]
  /** 历史方案：每次改动前的旧版本快照，按时间倒序 */
  history?: PlanHistoryEntry[]
}

let planSequence = 0

export function createPlanId(): string {
  planSequence += 1
  return `plan-${Date.now()}-${planSequence}`
}

/**
 * 识别出的方案没有经过计算器，按「全部场次串关 + 1 倍」试算，
 * 与计算器默认选中的过关方式保持一致。
 */
export function summarizePlan(legs: PlanLeg[], multiple = 1): SelectionSummary {
  return summarizeCardLegs(legs, multiple)
}

export function createPlan(sport: SportKey, name: string, legs: PlanLeg[] = []): RecommendPlan {
  return {
    id: createPlanId(),
    sport,
    name,
    imagePath: '',
    recognizedText: '',
    note: '',
    legs,
    summary: legs.length ? summarizePlan(legs) : undefined,
  }
}

/** 卡片上展示的场次编号：优先用接口返回的 matchNum（如 2001），取不到时退回编号里的数字 */
export function legMatchNo(leg: PlanLeg, matchNumById: Map<number, number>): string {
  const matchNum = matchNumById.get(leg.matchId)
  if (matchNum) {
    return String(matchNum)
  }
  const digits = leg.matchNumStr.replace(/\D/g, '')
  return digits || leg.matchNumStr
}

/** 历史方案最多保留的版本数，避免无限增长 */
export const MAX_PLAN_HISTORY = 8

function todayKey(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 两份方案内容是否一致（场次 + 玩法 + 选项 + 赔率） */
export function sameLegs(a: PlanLeg[], b: PlanLeg[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  const key = (leg: PlanLeg) => `${leg.matchId}|${leg.poolCode}|${leg.optionKey}|${leg.odds}`
  const set = new Set(a.map(key))
  return b.every((leg) => set.has(key(leg)))
}

/**
 * 方案内容变化时，把旧版本压入历史（倒序、去重、限量）。
 * 旧版本没有任何投注内容时不记录。
 */
export function pushHistory(plan: RecommendPlan, nextLegs: PlanLeg[]): PlanHistoryEntry[] {
  const history = plan.history ?? []
  if (!plan.legs.length || sameLegs(plan.legs, nextLegs)) {
    return history
  }
  const entry: PlanHistoryEntry = {
    id: `${plan.id}-h${history.length + 1}-${Date.now()}`,
    label: `第 ${history.length + 1} 版`,
    date: todayKey(),
    legs: plan.legs,
    summary: plan.summary ?? summarizePlan(plan.legs),
    results: plan.results,
  }
  return [entry, ...history].slice(0, MAX_PLAN_HISTORY)
}

/** 推荐单卡片 → 海报数据模型 */
export function toSharePlan(plan: RecommendPlan): SharePlan {
  return {
    id: plan.id,
    sport: plan.sport,
    name: plan.name,
    legs: plan.legs,
    summary: plan.summary ?? (plan.legs.length ? summarizePlan(plan.legs) : undefined),
    results: plan.results,
    history: plan.history,
    note: plan.note || undefined,
  }
}
